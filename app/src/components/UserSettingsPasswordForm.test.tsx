import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fetchAuthSession, updatePassword } from "aws-amplify/auth";
import UserSettingsPasswordForm from "./UserSettingsPasswordForm";
import { mapChangePasswordError } from "../lib/mapChangePasswordError";
import { clearCognitoSession } from "../auth/cognitoSession";

vi.mock("aws-amplify/auth", () => ({
  updatePassword: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock("../auth/cognitoSession", () => ({
  clearCognitoSession: vi.fn().mockResolvedValue(undefined),
}));

const mockedUpdatePassword = updatePassword as unknown as ReturnType<typeof vi.fn>;
const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedClearCognitoSession = clearCognitoSession as unknown as ReturnType<typeof vi.fn>;

const AUTH_SUB = "sub-anton-1";

function mockMatchingSession() {
  mockedFetchAuthSession.mockResolvedValue({
    tokens: { idToken: { payload: { sub: AUTH_SUB } } },
  });
}

describe("mapChangePasswordError (#434)", () => {
  it("mappt bekannte Cognito-Fehler", () => {
    expect(mapChangePasswordError(Object.assign(new Error("x"), { name: "NotAuthorizedException" }))).toMatch(
      /aktuelles passwort/i,
    );
    expect(
      mapChangePasswordError(Object.assign(new Error("bad"), { name: "InvalidPasswordException" })),
    ).toMatch(/regeln nicht/i);
    expect(mapChangePasswordError(new Error("UserNeedsToBeAuthenticatedException"))).toMatch(
      /aktive anmeldung/i,
    );
  });
});

describe("UserSettingsPasswordForm (#434)", () => {
  beforeEach(() => {
    cleanup();
    mockedUpdatePassword.mockReset();
    mockedFetchAuthSession.mockReset();
    mockedClearCognitoSession.mockReset();
    mockedClearCognitoSession.mockResolvedValue(undefined);
    mockMatchingSession();
  });

  it("ändert Passwort, prüft Session-Sub und triggert Reauth", async () => {
    const user = userEvent.setup();
    const onPasswordChangedRequiresReauth = vi.fn().mockResolvedValue(undefined);
    mockedUpdatePassword.mockResolvedValue(undefined);

    render(
      <UserSettingsPasswordForm
        nickname="maya"
        authUserId={AUTH_SUB}
        onPasswordChangedRequiresReauth={onPasswordChangedRequiresReauth}
      />,
    );

    expect(screen.getByDisplayValue("maya")).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: /passwort vergessen/i })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^aktuelles passwort$/i), "altpass");
    await user.type(screen.getByLabelText(/^neues passwort$/i), "neu-pass");
    await user.type(screen.getByLabelText(/neues passwort bestätigen/i), "neu-pass");
    await user.click(screen.getByRole("button", { name: /passwort speichern/i }));

    await waitFor(() => {
      expect(mockedUpdatePassword).toHaveBeenCalledWith({
        oldPassword: "altpass",
        newPassword: "neu-pass",
      });
    });
    expect(mockedClearCognitoSession).toHaveBeenCalled();
    expect(onPasswordChangedRequiresReauth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(/abgemeldet/i);
  });

  it("bricht ab wenn Cognito-Session zu einem anderen Konto gehört", async () => {
    const user = userEvent.setup();
    const onPasswordChangedRequiresReauth = vi.fn();
    mockedFetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { sub: "other-sub" } } },
    });

    render(
      <UserSettingsPasswordForm
        nickname="maya"
        authUserId={AUTH_SUB}
        onPasswordChangedRequiresReauth={onPasswordChangedRequiresReauth}
      />,
    );

    await user.type(screen.getByLabelText(/^aktuelles passwort$/i), "altpass");
    await user.type(screen.getByLabelText(/^neues passwort$/i), "neu-pass");
    await user.type(screen.getByLabelText(/neues passwort bestätigen/i), "neu-pass");
    await user.click(screen.getByRole("button", { name: /passwort speichern/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/anderen konto/i);
    });
    expect(mockedUpdatePassword).not.toHaveBeenCalled();
    expect(onPasswordChangedRequiresReauth).not.toHaveBeenCalled();
  });

  it("lehnt Bestätigung-Mismatch ohne API-Call ab", async () => {
    const user = userEvent.setup();
    render(
      <UserSettingsPasswordForm
        nickname="maya"
        authUserId={AUTH_SUB}
        onPasswordChangedRequiresReauth={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^aktuelles passwort$/i), "altpass");
    await user.type(screen.getByLabelText(/^neues passwort$/i), "neu-pass");
    await user.type(screen.getByLabelText(/neues passwort bestätigen/i), "anders");
    await user.click(screen.getByRole("button", { name: /passwort speichern/i }));

    expect(mockedUpdatePassword).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/stimmen nicht überein/i);
  });

  it("zeigt gemappten Fehler bei falschem aktuellem Passwort", async () => {
    const user = userEvent.setup();
    mockedUpdatePassword.mockRejectedValue(
      Object.assign(new Error("Incorrect username or password."), {
        name: "NotAuthorizedException",
      }),
    );

    render(
      <UserSettingsPasswordForm
        nickname="maya"
        authUserId={AUTH_SUB}
        onPasswordChangedRequiresReauth={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/^aktuelles passwort$/i), "falsch");
    await user.type(screen.getByLabelText(/^neues passwort$/i), "neu-pass");
    await user.type(screen.getByLabelText(/neues passwort bestätigen/i), "neu-pass");
    await user.click(screen.getByRole("button", { name: /passwort speichern/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/aktuelles passwort ist falsch/i);
    });
  });

  it("deaktiviert Speichern bei leeren Feldern", () => {
    render(
      <UserSettingsPasswordForm
        nickname="maya"
        authUserId={AUTH_SUB}
        onPasswordChangedRequiresReauth={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /passwort speichern/i })).toBeDisabled();
  });
});
