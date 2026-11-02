import { describe, expect, it, vi } from "vitest";
import { restoreStudioUserFromSession } from "./restoreSessionUser";

describe("restoreStudioUserFromSession (#412)", () => {
  it("behält Studio-Login-Name wenn authUserId zum Cognito-sub passt (JWT-nickname falsch)", async () => {
    const resolveLogin = vi.fn();
    const user = await restoreStudioUserFromSession({
      payload: {
        sub: "sub-anton",
        "cognito:username": "anton",
        nickname: "tim.tom",
        email: "anton@example.com",
        "custom:role": "participant",
      },
      stored: {
        nickname: "Anton",
        email: "anton@example.com",
        role: "participant",
        authUserId: "sub-anton",
      },
      resolveLogin,
    });

    expect(user.nickname).toBe("Anton");
    expect(user.authUserId).toBe("sub-anton");
    expect(resolveLogin).not.toHaveBeenCalled();
  });

  it("ohne authUserId: verifiziert gespeicherten Studio-Namen per resolveLogin", async () => {
    const resolveLogin = vi.fn().mockResolvedValue({
      cognitoUsername: "anton",
      nickname: "Anton",
    });
    const user = await restoreStudioUserFromSession({
      payload: {
        sub: "sub-anton",
        "cognito:username": "anton",
        nickname: "tim.tom",
        email: "anton@example.com",
        "custom:role": "admin",
      },
      stored: { nickname: "Anton", email: "old@example.com", role: "participant" },
      resolveLogin,
    });

    expect(resolveLogin).toHaveBeenCalledWith({ nickname: "Anton" });
    expect(user.nickname).toBe("Anton");
    expect(user.role).toBe("admin");
    expect(user.email).toBe("anton@example.com");
    expect(user.authUserId).toBe("sub-anton");
  });

  it("verwirft Storage wenn resolveLogin zu anderer Cognito-Identität gehört", async () => {
    const resolveLogin = vi
      .fn()
      .mockResolvedValueOnce({
        cognitoUsername: "other-person",
        nickname: "Bob",
      })
      .mockResolvedValueOnce({
        cognitoUsername: "anton",
        nickname: "Anton",
      });

    const user = await restoreStudioUserFromSession({
      payload: {
        sub: "sub-anton",
        "cognito:username": "anton",
        nickname: "tim.tom",
        email: "anton@example.com",
        "custom:role": "participant",
      },
      stored: { nickname: "Bob", email: "bob@example.com", role: "participant" },
      resolveLogin,
    });

    expect(user.nickname).toBe("Anton");
    expect(resolveLogin).toHaveBeenCalledWith({ nickname: "Bob" });
    expect(resolveLogin).toHaveBeenCalledWith({ nickname: "anton" });
  });

  it("ohne Storage: Studio-Name über Cognito-Username (Legacy) auflösen", async () => {
    const resolveLogin = vi.fn().mockResolvedValue({
      cognitoUsername: "anton",
      nickname: "Anton",
    });
    const user = await restoreStudioUserFromSession({
      payload: {
        sub: "sub-anton",
        "cognito:username": "anton",
        nickname: "tim.tom",
        email: "anton@example.com",
        "custom:role": "participant",
      },
      stored: null,
      resolveLogin,
    });

    expect(user.nickname).toBe("Anton");
    expect(resolveLogin).toHaveBeenCalledWith({ nickname: "anton" });
  });

  it("Fallback auf JWT-nickname wenn Resolve nicht möglich", async () => {
    const resolveLogin = vi.fn().mockRejectedValue(new Error("Login failed"));
    const user = await restoreStudioUserFromSession({
      payload: {
        sub: "sub-x",
        "cognito:username": "opaque-uuid",
        nickname: "jwt-nick",
        email: "x@example.com",
        "custom:role": "participant",
      },
      stored: null,
      resolveLogin,
    });

    expect(user.nickname).toBe("jwt-nick");
    expect(user.authUserId).toBe("sub-x");
  });
});
