import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { signIn, fetchAuthSession } from "aws-amplify/auth";
import { saveCurrentUser, loadCurrentUser } from "shared/lib/storage";
import { resolveLogin } from "../api/auth";
import { useCognitoAuth } from "./useCognitoAuth";
import { clearCognitoSession, isUserAlreadyAuthenticatedError } from "./cognitoSession";

vi.mock("aws-amplify/auth", () => ({
  signIn: vi.fn(),
  fetchAuthSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("../api/auth", () => ({
  resolveLogin: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  saveCurrentUser: vi.fn(),
  loadCurrentUser: vi.fn(() => null),
  clearCurrentUser: vi.fn(),
}));

vi.mock("./cognitoSession", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cognitoSession")>();
  return {
    ...actual,
    clearCognitoSession: vi.fn().mockResolvedValue(undefined),
  };
});

const mockedSignIn = signIn as unknown as ReturnType<typeof vi.fn>;
const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedClearCognitoSession = clearCognitoSession as unknown as ReturnType<typeof vi.fn>;
const mockedSaveCurrentUser = saveCurrentUser as unknown as ReturnType<typeof vi.fn>;
const mockedResolveLogin = resolveLogin as unknown as ReturnType<typeof vi.fn>;

describe("useCognitoAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (loadCurrentUser as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);
    mockedClearCognitoSession.mockResolvedValue(undefined);
    mockedResolveLogin.mockResolvedValue({
      cognitoUsername: "alice",
      nickname: "alice",
    });
  });

  it("cleared Session vor signIn (#338)", async () => {
    mockedSignIn.mockResolvedValue({ nextStep: { signInStep: "DONE" } });
    mockedFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "alice",
            email: "a@example.com",
            "custom:role": "participant",
          },
        },
      },
    });

    const { result } = renderHook(() => useCognitoAuth());
    let ok = false;
    await act(async () => {
      ok = await result.current.login({ username: "alice", password: "secret" });
    });

    expect(ok).toBe(true);
    expect(mockedResolveLogin).toHaveBeenCalledWith({ nickname: "alice" });
    expect(mockedClearCognitoSession).toHaveBeenCalled();
    expect(mockedSignIn).toHaveBeenCalledWith({ username: "alice", password: "secret" });
    expect(mockedSaveCurrentUser).toHaveBeenCalled();
  });

  it("signIn mit opaque cognitoUsername nach resolve (#324)", async () => {
    mockedResolveLogin.mockResolvedValue({
      cognitoUsername: "11111111-2222-4333-8444-555555555555",
      nickname: "admin_prod",
    });
    mockedSignIn.mockResolvedValue({ nextStep: { signInStep: "DONE" } });
    mockedFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "admin_prod",
            email: "a@example.com",
            "custom:role": "admin",
          },
        },
      },
    });

    const { result } = renderHook(() => useCognitoAuth());
    let ok = false;
    await act(async () => {
      ok = await result.current.login({ username: "admin_prod", password: "secret" });
    });

    expect(ok).toBe(true);
    expect(mockedSignIn).toHaveBeenCalledWith({
      username: "11111111-2222-4333-8444-555555555555",
      password: "secret",
    });
    expect(mockedSaveCurrentUser).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: "admin_prod" }),
    );
  });

  it("bricht ab wenn resolve-login fehlschlägt (#324)", async () => {
    mockedResolveLogin.mockRejectedValue(new Error("Login failed"));

    const { result } = renderHook(() => useCognitoAuth());
    let ok = true;
    await act(async () => {
      ok = await result.current.login({ username: "ghost", password: "secret" });
    });

    expect(ok).toBe(false);
    expect(mockedSignIn).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Login fehlgeschlagen/i);
  });

  it("retry bei Already-Authenticated nach Message ohne Exception-Namen (#338)", async () => {
    mockedSignIn
      .mockRejectedValueOnce(new Error("There is already a signed in user."))
      .mockResolvedValueOnce({ nextStep: { signInStep: "DONE" } });
    mockedFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: { nickname: "alice", email: "a@example.com", "custom:role": "admin" },
        },
      },
    });

    expect(isUserAlreadyAuthenticatedError(new Error("There is already a signed in user."))).toBe(
      true,
    );

    const { result } = renderHook(() => useCognitoAuth());
    let ok = false;
    await act(async () => {
      ok = await result.current.login({ username: "alice", password: "secret" });
    });

    expect(ok).toBe(true);
    expect(mockedSignIn).toHaveBeenCalledTimes(2);
    expect(mockedClearCognitoSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
