import { describe, it, expect, vi, beforeEach } from "vitest";
import { inviteUser } from "./participants";
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
