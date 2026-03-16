import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Invite from "./Invite";
import { signIn, confirmSignIn, fetchAuthSession } from "@aws-amplify/auth";
import { saveCurrentUser } from "shared/lib/storage";

vi.mock("@aws-amplify/auth", () => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  saveCurrentUser: vi.fn(),
}));

const mockedSignIn = signIn as unknown as ReturnType<typeof vi.fn>;
const mockedConfirmSignIn = confirmSignIn as unknown as ReturnType<typeof vi.fn>;
const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedSaveCurrentUser = saveCurrentUser as unknown as ReturnType<typeof vi.fn>;

function renderWithParams(search: string, onSuccess?: () => void) {
  const utils = render(
    <MemoryRouter initialEntries={[`/invite${search}`]}>
      <Routes>
        <Route path="/invite" element={<Invite onSuccess={onSuccess} />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const panels = utils.container.querySelectorAll("div[style*='Passwort-Setup']");
  const panel = (panels[panels.length - 1] as HTMLElement) ?? utils.container;
  return { ...utils, panel };
}

describe("Invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("zeigt 'Ungültiger Link.', wenn kein nickname-Parameter vorhanden ist", () => {
    const { panel } = renderWithParams("");

    expect(panel).toHaveTextContent(/Ungültiger Link\./i);
  });

  it("zeigt Validierungsfehler, wenn Felder leer oder zu kurz sind", async () => {
    const { panel } = renderWithParams("?nickname=alice");

    fireEvent.click(
      within(panel).getByRole("button", { name: /Passwort setzen/i }),
    );

    await waitFor(() => {
      expect(
        within(panel).getByText(
          /Bitte das temporäre Passwort aus der E-Mail eingeben\./i,
        ),
      ).toBeInTheDocument();
    });

    // Temporäres Passwort gesetzt, neues Passwort zu kurz
    fireEvent.change(
      within(panel).getByPlaceholderText(
        /Temporäres Passwort hier eingeben/i,
      ),
      { target: { value: "temp-123" } },
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: /Passwort setzen/i }),
    );

    await waitFor(() => {
      expect(
        within(panel).getByText(
          /Das neue Passwort muss mindestens 6 Zeichen lang sein\./i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("führt den vollständigen Passwort-Setup-Flow aus und speichert den User", async () => {
    const onSuccess = vi.fn();

    mockedSignIn.mockResolvedValue({
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
    });
    mockedConfirmSignIn.mockResolvedValue({});
    mockedFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "alice",
            email: "alice@example.com",
            "custom:role": "admin",
          },
        },
      },
    });

    const { panel } = renderWithParams(
      "?nickname=Alice&email=alice@example.com",
      onSuccess,
    );

    fireEvent.change(
      within(panel).getByPlaceholderText(
        /Temporäres Passwort hier eingeben/i,
      ),
      { target: { value: "temp-123" } },
    );
    fireEvent.change(within(panel).getByPlaceholderText(/Neues Passwort/i), {
      target: { value: "SicheresPasswort123!" },
    });

    fireEvent.click(
      within(panel).getByRole("button", { name: /Passwort setzen/i }),
    );

    await waitFor(() => {
      expect(mockedSignIn).toHaveBeenCalledWith({
        username: "alice",
        password: "temp-123",
      });
      expect(mockedConfirmSignIn).toHaveBeenCalledWith({
        challengeResponse: "SicheresPasswort123!",
      });
      expect(mockedFetchAuthSession).toHaveBeenCalled();
      expect(mockedSaveCurrentUser).toHaveBeenCalledWith({
        nickname: "alice",
        email: "alice@example.com",
        role: "admin",
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("zeigt eine sprechende Fehlermeldung bei falschem temporären Passwort", async () => {
    mockedSignIn.mockRejectedValue(
      new Error("Incorrect username or password"),
    );

    const { panel } = renderWithParams("?nickname=alice");

    fireEvent.change(
      within(panel).getByPlaceholderText(
        /Temporäres Passwort hier eingeben/i,
      ),
      { target: { value: "falsches-temp" } },
    );
    fireEvent.change(within(panel).getByPlaceholderText(/Neues Passwort/i), {
      target: { value: "SicheresPasswort123!" },
    });

    fireEvent.click(
      within(panel).getByRole("button", { name: /Passwort setzen/i }),
    );

    await waitFor(() => {
      expect(
        within(panel).getByText(
          /Benutzername oder temporäres Passwort ist falsch\. Bitte Admin um neue Einladung\./i,
        ),
      ).toBeInTheDocument();
    });
  });
});

