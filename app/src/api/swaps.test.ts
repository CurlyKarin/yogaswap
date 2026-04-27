import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getSwaps,
  createSwap,
  updateSwap,
  deleteSwap,
  getSwapsByStatus,
  processPromotions,
} from "./swaps";
import axios from "axios";
import { setActingForUserId } from "./delegation";
import type { Swap } from "shared/types";

vi.mock("axios");

const sampleSwap: Swap = {
  user: "alice",
  fromCourseId: 1,
  fromDate: "2025-06-16",
  toCourseId: 2,
  toDate: "2025-06-17",
  status: "active",
};

describe("getSwaps", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it("ruft GET /swaps mit user und optionalen Parametern auf und mappt die Antwort", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        {
          user: "alice",
          fromCourseId: "1",
          fromDate: "2025-06-16",
          toCourseId: "2",
          toDate: "2025-06-17",
          status: "active",
        },
      ],
    });

    const result = await getSwaps("alice", "2025-06-16", 1);

    expect(axios.get).toHaveBeenCalledWith("/swaps", {
      params: { user: "alice", fromDate: "2025-06-16", fromCourseId: "1" },
    });
    expect(result).toHaveLength(1);
    expect(result[0].fromCourseId).toBe(1);
    expect(result[0].toCourseId).toBe(2);
  });

  it("gibt leeres Array bei Fehler zurück", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("Network error"));

    const result = await getSwaps("alice");

    expect(result).toEqual([]);
  });
});

describe("createSwap", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
    setActingForUserId(null);
  });

  it("ruft POST /swaps mit Swap-Body auf", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({});

    await createSwap(sampleSwap);

    expect(axios.post).toHaveBeenCalledWith("/swaps", sampleSwap);
  });

  it("sendet Delegation-Header beim Anlegen wenn actingFor gesetzt ist", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({});
    setActingForUserId("maya");
    await createSwap(sampleSwap);
    expect(axios.post).toHaveBeenCalledWith("/swaps", sampleSwap, {
      headers: { "x-acting-for-user-id": "maya" },
    });
  });

  it("wirft bei Fehler den Fehler weiter", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("Conflict"));

    await expect(createSwap(sampleSwap)).rejects.toThrow("Conflict");
  });
});

describe("updateSwap", () => {
  beforeEach(() => {
    vi.mocked(axios.put).mockReset();
    setActingForUserId(null);
  });

  it("ruft PUT /swaps/:swapId mit status und user-Param auf", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({});

    await updateSwap(sampleSwap, "pending");

    const expectedSwapId = "2025-06-16_1_2025-06-17_2";
    expect(axios.put).toHaveBeenCalledWith(
      `/swaps/${expectedSwapId}`,
      { status: "pending" },
      { params: { user: "alice" } }
    );
  });

  it("sendet Delegation-Header beim Update wenn actingFor gesetzt ist", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({});
    setActingForUserId("maya");
    await updateSwap(sampleSwap, "pending");
    expect(axios.put).toHaveBeenCalledWith(
      "/swaps/2025-06-16_1_2025-06-17_2",
      { status: "pending" },
      { params: { user: "alice" }, headers: { "x-acting-for-user-id": "maya" } },
    );
  });

  it("wirft bei Fehler den Fehler weiter", async () => {
    vi.mocked(axios.put).mockRejectedValueOnce(new Error("Not found"));

    await expect(updateSwap(sampleSwap, "active")).rejects.toThrow("Not found");
  });
});

describe("deleteSwap", () => {
  beforeEach(() => {
    vi.mocked(axios.delete).mockReset();
    setActingForUserId(null);
  });

  it("ruft DELETE /swaps/:swapId mit user-Param auf", async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({});

    await deleteSwap(sampleSwap);

    expect(axios.delete).toHaveBeenCalledWith("/swaps/2025-06-16_1_2025-06-17_2", {
      params: { user: "alice" },
    });
  });

  it("sendet Delegation-Header beim Löschen wenn actingFor gesetzt ist", async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({});
    setActingForUserId("maya");
    await deleteSwap(sampleSwap);
    expect(axios.delete).toHaveBeenCalledWith("/swaps/2025-06-16_1_2025-06-17_2", {
      params: { user: "alice" },
      headers: { "x-acting-for-user-id": "maya" },
    });
  });

  it("wirft bei Fehler den Fehler weiter", async () => {
    vi.mocked(axios.delete).mockRejectedValueOnce(new Error("Forbidden"));

    await expect(deleteSwap(sampleSwap)).rejects.toThrow("Forbidden");
  });
});

describe("getSwapsByStatus", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
  });

  it("ruft GET /swaps/status mit status-Param auf und gibt response.data zurück", async () => {
    const swaps = [sampleSwap];
    vi.mocked(axios.get).mockResolvedValueOnce({ data: swaps });

    const result = await getSwapsByStatus("pending");

    expect(axios.get).toHaveBeenCalledWith("/swaps/status", { params: { status: "pending" } });
    expect(result).toEqual(swaps);
  });

  it("gibt leeres Array bei Fehler zurück", async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error("Server error"));

    const result = await getSwapsByStatus("active");

    expect(result).toEqual([]);
  });
});

describe("processPromotions", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("ruft POST /process-promotions auf und gibt response.data zurück", async () => {
    const payload = { message: "ok", iterations: 1, promoted: 0, swaps: [], overrides: [] };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: payload });

    const result = await processPromotions();

    expect(axios.post).toHaveBeenCalledWith("/process-promotions", {});
    expect(result).toEqual(payload);
  });

  it("wirft bei Fehler den Fehler weiter", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("Internal error"));

    await expect(processPromotions()).rejects.toThrow("Internal error");
  });
});
