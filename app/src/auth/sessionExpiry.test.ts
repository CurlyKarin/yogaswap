import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAuthSession } from "aws-amplify/auth";
import { loadCurrentUser } from "shared/lib/storage";
import { clearCognitoSession } from "./cognitoSession";
import {
  SESSION_ENDED_EVENT,
  SESSION_NOTICE_KEY,
  consumeSessionNotice,
  endSessionDueToExpiry,
  hasValidCognitoIdToken,
  installSessionDebugApi,
  reconcileLocalUserWithCognitoSession,
  setSessionNotice,
  startSessionIdleWatchdog,
} from "./sessionExpiry";

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("./cognitoSession", () => ({
  clearCognitoSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("shared/lib/storage", () => ({
  loadCurrentUser: vi.fn(),
  clearCurrentUser: vi.fn(),
  saveCurrentUser: vi.fn(),
}));

const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedLoadCurrentUser = loadCurrentUser as unknown as ReturnType<typeof vi.fn>;
const mockedClearCognitoSession = clearCognitoSession as unknown as ReturnType<typeof vi.fn>;

describe("sessionExpiry", () => {
  beforeEach(() => {
    sessionStorage.clear();
    delete window.__yogaswapSession;
    mockedFetchAuthSession.mockReset();
    mockedLoadCurrentUser.mockReset();
    mockedClearCognitoSession.mockReset();
    mockedClearCognitoSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    sessionStorage.clear();
    delete window.__yogaswapSession;
  });

  it("setSessionNotice / consumeSessionNotice are one-shot", () => {
    setSessionNotice("Hallo");
    expect(sessionStorage.getItem(SESSION_NOTICE_KEY)).toBe("Hallo");
    expect(consumeSessionNotice()).toBe("Hallo");
    expect(consumeSessionNotice()).toBe("");
  });

  it("endSessionDueToExpiry clears session and dispatches event", async () => {
    const handler = vi.fn();
    window.addEventListener(SESSION_ENDED_EVENT, handler);
    await endSessionDueToExpiry("idle");
    expect(mockedClearCognitoSession).toHaveBeenCalled();
    expect(consumeSessionNotice()).toMatch(/inaktiv/i);
    expect(handler).toHaveBeenCalled();
    window.removeEventListener(SESSION_ENDED_EVENT, handler);
  });

  it("hasValidCognitoIdToken mirrors Amplify session", async () => {
    mockedFetchAuthSession.mockResolvedValueOnce({ tokens: { idToken: {} } });
    expect(await hasValidCognitoIdToken()).toBe(true);
    mockedFetchAuthSession.mockResolvedValueOnce({ tokens: undefined });
    expect(await hasValidCognitoIdToken()).toBe(false);
  });

  it("reconcileLocalUserWithCognitoSession ends session when token missing", async () => {
    mockedLoadCurrentUser.mockReturnValue({ nickname: "alice", role: "participant" });
    mockedFetchAuthSession.mockResolvedValueOnce({ tokens: undefined });
    await reconcileLocalUserWithCognitoSession();
    expect(mockedClearCognitoSession).toHaveBeenCalled();
    expect(consumeSessionNotice()).toMatch(/abgelaufen/i);
  });

  it("reconcileLocalUserWithCognitoSession is no-op without local user", async () => {
    mockedLoadCurrentUser.mockReturnValue(null);
    await reconcileLocalUserWithCognitoSession();
    expect(mockedFetchAuthSession).not.toHaveBeenCalled();
  });

  it("startSessionIdleWatchdog fires after timeout when user present", async () => {
    vi.useFakeTimers();
    let now = 1_000_000;
    mockedLoadCurrentUser.mockReturnValue({ nickname: "alice", role: "participant" });
    const stop = startSessionIdleWatchdog({
      timeoutMs: 5_000,
      now: () => now,
    });
    now += 6_000;
    await vi.advanceTimersByTimeAsync(6_000);
    await Promise.resolve();
    expect(mockedClearCognitoSession).toHaveBeenCalled();
    stop();
    vi.useRealTimers();
  });

  it("installSessionDebugApi exposes helpers on window when enabled", async () => {
    installSessionDebugApi();
    expect(window.__yogaswapSession?.endIdle).toBeTypeOf("function");
    await window.__yogaswapSession!.endIdle();
    expect(mockedClearCognitoSession).toHaveBeenCalled();
  });
});
