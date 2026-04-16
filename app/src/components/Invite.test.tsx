import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Invite from "./Invite";
import { signIn, fetchAuthSession, signOut, confirmResetPassword } from "@aws-amplify/auth";
import { saveCurrentUser } from "shared/lib/storage";

vi.mock("@aws-amplify/auth", () => ({
  signIn: vi.fn(),
  fetchAuthSession: vi.fn(),
  signOut: vi.fn(),
  confirmResetPassword: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  saveCurrentUser: vi.fn(),
}));

vi.mock("../api/auth", () => ({
  startPasswordResetFromToken: vi.fn(),
}));

const mockedSignIn = signIn as unknown as ReturnType<typeof vi.fn>;
const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedSignOut = signOut as unknown as ReturnType<typeof vi.fn>;
const mockedConfirmResetPassword = confirmResetPassword as unknown as ReturnType<typeof vi.fn>;
const mockedSaveCurrentUser = saveCurrentUser as unknown as ReturnType<typeof vi.fn>;
const { startPasswordResetFromToken } = await import("../api/auth");
const mockedStartPasswordResetFromToken =
  startPasswordResetFromToken as unknown as ReturnType<typeof vi.fn>;

function renderWithParams(search: string, onSuccess?: () => void) {
  const utils = render(
    <MemoryRouter initialEntries={[`/invite${search}`]}>
      <Routes>
        <Route path="/invite" element={<Invite onSuccess={onSuccess} />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const panels = utils.container.querySelectorAll("div[style*='max-width: 480px']");
  const panel = (panels[panels.length - 1] as HTMLElement) ?? utils.container;
  return { ...utils, panel };
}

describe("Invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedSignOut.mockResolvedValue(undefined);
  });

  it("zeigt 'Ungültiger Link.', wenn kein Token-Link vorhanden ist", () => {
    const { panel } = renderWithParams("");

    expect(panel).toHaveTextContent(/Ungültiger Link\./i);
  });

  it("setzt im Token-Flow Passwort per Code und speichert den User", async () => {
    mockedStartPasswordResetFromToken.mockResolvedValue({
      success: true,
      username: "Alice",
    });

    mockedConfirmResetPassword.mockResolvedValue(undefined);
    mockedSignIn.mockResolvedValue({ nextStep: { signInStep: "DONE" } });
    mockedFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "alice",
            email: "alice@example.com",
            "custom:role": "participant",
          },
        },
      },
    });

    const { panel } = renderWithParams(
      "?tenantId=default-tenant&token=t1&nickname=Alice&email=alice@example.com",
    );

    await waitFor(() => {
      expect(mockedStartPasswordResetFromToken).toHaveBeenCalledWith({
        tenantId: "default-tenant",
        token: "t1",
      });
    });
    const hiddenUsername = panel.querySelector(
      "input[name='username'][autocomplete='username']",
    ) as HTMLInputElement | null;
    expect(hiddenUsername).toBeTruthy();
    expect(hiddenUsername?.value).toBe("Alice");

    // code + new password
    fireEvent.change(within(panel).getByPlaceholderText(/Code aus E-Mail/i), {
      target: { value: "123456" },
    });
    fireEvent.change(within(panel).getByPlaceholderText(/Neues Passwort/i), {
      target: { value: "SicheresPasswort123!" },
    });

    fireEvent.click(
      within(panel).getByRole("button", { name: /Passwort setzen/i }),
    );

    await waitFor(() => {
      expect(mockedConfirmResetPassword).toHaveBeenCalledWith({
        username: "Alice",
        confirmationCode: "123456",
        newPassword: "SicheresPasswort123!",
      });
      expect(mockedSignIn).toHaveBeenCalledWith({
        username: "Alice",
        password: "SicheresPasswort123!",
      });
      expect(mockedSaveCurrentUser).toHaveBeenCalledWith({
        nickname: "alice",
        email: "alice@example.com",
        role: "participant",
      });
    });
  });

  it("zeigt Validierungsfehler bei zu kurzem Passwort", async () => {
    mockedStartPasswordResetFromToken.mockResolvedValue({
      success: true,
      username: "Alice",
    });

    const { panel } = renderWithParams(
      "?tenantId=default-tenant&token=t1&nickname=Alice&email=alice@example.com",
    );

    await waitFor(() => {
      expect(mockedStartPasswordResetFromToken).toHaveBeenCalled();
    });

    fireEvent.change(within(panel).getByPlaceholderText(/Code aus E-Mail/i), {
      target: { value: "123456" },
    });
    fireEvent.change(within(panel).getByPlaceholderText(/Neues Passwort/i), {
      target: { value: "123" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: /Passwort setzen/i }));

    await waitFor(() => {
      expect(
        within(panel).getByText(/Das neue Passwort muss mindestens 6 Zeichen lang sein\./i),
      ).toBeInTheDocument();
    });
  });

  it("zeigt klare Meldung, wenn Token zu anderem Flow gehoert", async () => {
    mockedStartPasswordResetFromToken.mockRejectedValue(
      new Error("Token purpose is invalid"),
    );

    const { panel } = renderWithParams(
      "?tenantId=default-tenant&token=t1&nickname=Alice&email=alice@example.com",
    );

    await waitFor(() => {
      expect(
        within(panel).getByText(
          /Dieser Link gehoert zu einem anderen Vorgang\. Bitte nutze den neuesten Link aus deiner E-Mail\./i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("zeigt klare Meldung, wenn ein neuerer Link den Token ersetzt hat", async () => {
    mockedStartPasswordResetFromToken.mockRejectedValue(
      new Error("Token superseded by newer link"),
    );

    const { panel } = renderWithParams(
      "?tenantId=default-tenant&token=t1&nickname=Alice&email=alice@example.com",
    );

    await waitFor(() => {
      expect(
        within(panel).getByText(
          /Dieser Link wurde durch einen neueren Link ersetzt\. Bitte nutze die zuletzt gesendete E-Mail\./i,
        ),
      ).toBeInTheDocument();
    });
  });
});

