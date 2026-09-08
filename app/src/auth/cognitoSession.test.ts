import { describe, it, expect, vi, beforeEach } from "vitest";
import { signOut } from "aws-amplify/auth";
import { clearCurrentUser } from "shared/lib/storage";
import { clearCognitoSession, isUserAlreadyAuthenticatedError } from "./cognitoSession";

vi.mock("aws-amplify/auth", () => ({
  signOut: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  clearCurrentUser: vi.fn(),
}));

describe("isUserAlreadyAuthenticatedError", () => {
  it("erkennt Amplify-Name und Message", () => {
    expect(
      isUserAlreadyAuthenticatedError({
        name: "UserAlreadyAuthenticatedException",
        message: "There is already a signed in user.",
      }),
    ).toBe(true);
    expect(
      isUserAlreadyAuthenticatedError(new Error("There is already a signed in user.")),
    ).toBe(true);
    expect(
      isUserAlreadyAuthenticatedError(new Error("UserAlreadyAuthenticatedException: foo")),
    ).toBe(true);
  });

  it("lehnt andere Fehler ab", () => {
    expect(isUserAlreadyAuthenticatedError(new Error("NotAuthorizedException"))).toBe(false);
    expect(isUserAlreadyAuthenticatedError(null)).toBe(false);
    expect(isUserAlreadyAuthenticatedError("already")).toBe(false);
  });
});

describe("clearCognitoSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ruft global signOut und clearCurrentUser auf", async () => {
    (signOut as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await clearCognitoSession();
    expect(signOut).toHaveBeenCalledWith({ global: true });
    expect(clearCurrentUser).toHaveBeenCalled();
  });

  it("cleared local auch wenn signOut fehlschlägt", async () => {
    (signOut as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no session"));
    await clearCognitoSession();
    expect(clearCurrentUser).toHaveBeenCalled();
  });
});
