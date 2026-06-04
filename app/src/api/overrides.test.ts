import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOverrides, updateOverride, deleteOverride, createOverride } from "./overrides";
import { setActingForUserId } from "./delegation";
import axios from "axios";
import type { CourseDateOverride } from "shared/types";

vi.mock("axios");

describe("getOverrides", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it("ruft GET /course-overrides auf und gibt Array zurück", async () => {
    const data: CourseDateOverride[] = [
      { courseId: 1, date: "2025-06-16", participants: ["alice"], waitlist: [] },
    ];
    vi.mocked(axios.get).mockResolvedValueOnce({ data });

    const result = await getOverrides();

    expect(axios.get).toHaveBeenCalledWith("/course-overrides", {
      params: { sinceDate: undefined },
    });
    expect(result).toEqual(data);
  });

  it("übergibt sinceDate als Query-Param wenn gesetzt", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: [] });

    await getOverrides("2025-06-01");

    expect(axios.get).toHaveBeenCalledWith("/course-overrides", {
      params: { sinceDate: "2025-06-01" },
    });
  });

  it("gibt leeres Array wenn response nicht Array ist", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: null });

    const result = await getOverrides();

    expect(result).toEqual([]);
  });

  it("gibt leeres Array bei Fehler zurück", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network error"));

    const result = await getOverrides();

    expect(result).toEqual([]);
  });
});

describe("updateOverride", () => {
  beforeEach(() => {
    vi.mocked(axios.put).mockReset();
    setActingForUserId(null);
  });

  it("ruft PUT /course-overrides/:courseId/:date mit updates auf", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({});

    await updateOverride(1, "2025-06-16", { participants: ["alice", "bob"] });

    expect(axios.put).toHaveBeenCalledWith("/course-overrides/1/2025-06-16", {
      participants: ["alice", "bob"],
    });
  });

  it("sendet Delegation-Header wenn actingFor gesetzt ist", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({});
    setActingForUserId("maya");
    await updateOverride(1, "2025-06-16", { participants: ["alice", "bob"] });

    expect(axios.put).toHaveBeenCalledWith(
      "/course-overrides/1/2025-06-16",
      { participants: ["alice", "bob"] },
      { headers: { "x-acting-for-user-id": "maya" } },
    );
  });

  it("wirft bei API-Fehler", async () => {
    vi.mocked(axios.put).mockRejectedValueOnce(new Error("Network error"));

    await expect(
      updateOverride(1, "2025-06-16", { participants: ["alice"] }),
    ).rejects.toThrow("Network error");
  });
});

describe("deleteOverride", () => {
  beforeEach(() => {
    vi.mocked(axios.delete).mockReset();
    setActingForUserId(null);
  });

  it("ruft DELETE /course-overrides/:courseId/:date auf", async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({});

    await deleteOverride(1, "2025-06-16");

    expect(axios.delete).toHaveBeenCalledWith("/course-overrides/1/2025-06-16");
  });

  it("sendet Delegation-Header beim Löschen wenn actingFor gesetzt ist", async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({});
    setActingForUserId("maya");
    await deleteOverride(1, "2025-06-16");

    expect(axios.delete).toHaveBeenCalledWith("/course-overrides/1/2025-06-16", {
      headers: { "x-acting-for-user-id": "maya" },
    });
  });
});

describe("createOverride", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
    setActingForUserId(null);
  });

  it("ruft POST /course-overrides mit newOverride-Body auf", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({});

    const newOverride: CourseDateOverride = {
      courseId: 1,
      date: "2025-06-16",
      participants: ["alice"],
      waitlist: ["bob"],
    };

    await createOverride(newOverride);

    expect(axios.post).toHaveBeenCalledWith("/course-overrides", newOverride);
  });

  it("sendet Delegation-Header beim Anlegen wenn actingFor gesetzt ist", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({});
    setActingForUserId("maya");
    const newOverride: CourseDateOverride = {
      courseId: 1,
      date: "2025-06-16",
      participants: ["alice"],
      waitlist: ["bob"],
    };

    await createOverride(newOverride);
    expect(axios.post).toHaveBeenCalledWith("/course-overrides", newOverride, {
      headers: { "x-acting-for-user-id": "maya" },
    });
  });

  it("wirft bei API-Fehler", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("Network error"));
    const newOverride: CourseDateOverride = {
      courseId: 1,
      date: "2025-06-16",
      participants: ["alice"],
      waitlist: [],
    };

    await expect(createOverride(newOverride)).rejects.toThrow("Network error");
  });
});
