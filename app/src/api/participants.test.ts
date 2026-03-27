import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  deleteParticipant,
  getParticipants,
  inviteUser,
  updateParticipant,
} from "./participants";
import axios from "axios";

vi.mock("axios");

describe("inviteUser", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("gibt response.data zurück bei Erfolg", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { success: true, emailSent: true },
    });

    const result = await inviteUser({
      email: "new@example.com",
      nickname: "newuser",
      role: "participant",
    });

    expect(axios.post).toHaveBeenCalledWith("/participants", {
      email: "new@example.com",
      nickname: "newuser",
      role: "participant",
    });
    expect(result).toEqual({ success: true, emailSent: true });
  });

  it("gibt { error: 'Request failed' } bei Serverfehler (z. B. Nickname exists)", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: { data: { error: "Nickname already exists" } },
    });

    const result = await inviteUser({
      email: "a@b.de",
      nickname: "existing",
      role: "participant",
    });

    expect(result).toEqual({ error: "Request failed" });
  });

  it("gibt { error: 'Request failed' } bei Netzwerkfehler ohne response", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("Network error"));

    const result = await inviteUser({
      email: "x@y.de",
      nickname: "n",
      role: "admin",
    });

    expect(result).toEqual({ error: "Request failed" });
  });
});

describe("participants API (getParticipants/updateParticipant)", () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.put).mockReset();
    vi.mocked(axios.delete).mockReset();
  });

  it("getParticipants lädt Teilnehmer inkl. status", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [
        { tenantId: "default-tenant", userId: "alice", status: "no_login" },
      ],
    });

    const result = await getParticipants();
    expect(result).toEqual([
      { tenantId: "default-tenant", userId: "alice", status: "no_login" },
    ]);

    expect(axios.get).toHaveBeenCalledWith("/participants", undefined);
  });

  it("getParticipants mit search nutzt Query-Param", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [],
    });

    await getParticipants("ali");
    expect(axios.get).toHaveBeenCalledWith("/participants", { params: { search: "ali" } });
  });

  it("getParticipants wirft bei unerwartetem Response-Format", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { error: "Forbidden" },
    });

    await expect(getParticipants()).rejects.toThrow(
      "Unexpected /participants response format",
    );
  });

  it("getParticipants mit Filter/Sort-Optionen sendet alle Query-Params", async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: [],
    });

    await getParticipants({
      search: "ali",
      includeOrphaned: true,
      status: "invited",
      hasEmail: true,
      sortBy: "nickname",
      sortOrder: "desc",
    });

    expect(axios.get).toHaveBeenCalledWith("/participants", {
      params: {
        search: "ali",
        includeOrphaned: "true",
        status: "invited",
        hasEmail: "true",
        sortBy: "nickname",
        sortOrder: "desc",
      },
    });
  });

  it("updateParticipant PUT aktualisiert Profil und liefert status", async () => {
    vi.mocked(axios.put).mockResolvedValueOnce({
      data: {
        tenantId: "default-tenant",
        userId: "alice",
        email: "alice@example.com",
        status: "invited",
      },
    });

    const result = await updateParticipant("alice", { email: "alice@example.com" });

    expect(result.status).toBe("invited");
    expect(axios.put).toHaveBeenCalledWith(
      "/participants/alice",
      { email: "alice@example.com" },
    );
  });

  it("deleteParticipant DELETE entfernt Teilnehmer und gibt Cleanup-Info zurück", async () => {
    vi.mocked(axios.delete).mockResolvedValueOnce({
      data: {
        success: true,
        membershipDeleted: true,
        profileDeleted: true,
      },
    });

    const result = await deleteParticipant("alice");

    expect(result).toEqual({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
    });
    expect(axios.delete).toHaveBeenCalledWith("/participants/alice");
  });
});
