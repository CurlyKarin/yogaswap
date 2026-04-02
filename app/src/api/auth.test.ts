import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { startPasswordResetFromToken } from "./auth";

vi.mock("axios");

describe("startPasswordResetFromToken", () => {
  beforeEach(() => {
    vi.mocked(axios.post).mockReset();
  });

  it("ruft POST /auth/password-reset/from-token mit token+tenantId als Query-Params auf (encoded)", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { success: true, username: "Alice" },
    });

    const result = await startPasswordResetFromToken({
      token: "t+/=",
      tenantId: "tenant 1",
    });

    expect(axios.post).toHaveBeenCalledWith(
      "/auth/password-reset/from-token?token=t%2B%2F%3D&tenantId=tenant%201",
    );
    expect(result).toEqual({ success: true, username: "Alice" });
  });

  it("wirft Error mit backend error-Message", async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { data: { error: "Token already used or expired" } },
      message: "Request failed with status code 400",
    });

    await expect(
      startPasswordResetFromToken({ token: "t1", tenantId: "tenant-1" }),
    ).rejects.toThrow(/Token already used or expired/i);
  });
});

