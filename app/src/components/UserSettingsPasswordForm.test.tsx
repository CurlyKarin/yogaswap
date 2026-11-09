import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { updatePassword } from "aws-amplify/auth";
import UserSettingsPasswordForm from "./UserSettingsPasswordForm";
import { mapChangePasswordError } from "../lib/mapChangePasswordError";

vi.mock("aws-amplify/auth", () => ({
  updatePassword: vi.fn(),
}));

const mockedUpdatePassword = updatePassword as unknown as ReturnType<typeof vi.fn>;

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
  });

  it("ändert Passwort und leert die Felder", async () => {
    const user = userEvent.setup();
    mockedUpdatePassword.mockResolvedValue(undefined);

    render(<UserSettingsPasswordForm />);

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
    expect(screen.getByRole("status")).toHaveTextContent(/geändert/i);
    expect(screen.getByLabelText(/^aktuelles passwort$/i)).toHaveValue("");
    expect(screen.getByLabelText(/^neues passwort$/i)).toHaveValue("");
    expect(screen.getByLabelText(/neues passwort bestätigen/i)).toHaveValue("");
  });

  it("lehnt Bestätigung-Mismatch ohne API-Call ab", async () => {
    const user = userEvent.setup();
    render(<UserSettingsPasswordForm />);

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

    render(<UserSettingsPasswordForm />);

    await user.type(screen.getByLabelText(/^aktuelles passwort$/i), "falsch");
    await user.type(screen.getByLabelText(/^neues passwort$/i), "neu-pass");
    await user.type(screen.getByLabelText(/neues passwort bestätigen/i), "neu-pass");
    await user.click(screen.getByRole("button", { name: /passwort speichern/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/aktuelles passwort ist falsch/i);
    });
  });

  it("deaktiviert Speichern bei leeren Feldern", () => {
    render(<UserSettingsPasswordForm />);
    expect(screen.getByRole("button", { name: /passwort speichern/i })).toBeDisabled();
  });
});
