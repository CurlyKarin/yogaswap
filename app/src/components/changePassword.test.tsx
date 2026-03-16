import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ChangePassword from "./changePassword";
import { confirmSignIn, fetchAuthSession } from "aws-amplify/auth";
import { saveCurrentUser } from "shared/lib/storage";

vi.mock("aws-amplify/auth", () => ({
  confirmSignIn: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useLocation: vi.fn(() => ({
      state: { username: "alice" },
    })),
  };
});

vi.mock("shared/lib/storage", () => ({
  saveCurrentUser: vi.fn(),
}));

const mockedConfirmSignIn = confirmSignIn as unknown as ReturnType<typeof vi.fn>;
const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedSaveCurrentUser = saveCurrentUser as unknown as ReturnType<typeof vi.fn>;

function renderWithRouter(initialEntries: string[] = ["/change-password"]) {
  const utils = render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/login" element={<div>Login-Seite</div>} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const page =
    (utils.container.querySelector(".auth-form") as HTMLElement | null) ??
    utils.container;
  return { ...utils, page };
}

describe("ChangePassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt den Benutzernamen im Begrüßungstext an", () => {
    const { page } = renderWithRouter();

    const welcome = within(page).getByText(/Willkommen/i);
    expect(welcome).toHaveTextContent("alice");
  });

  it("setzt Passwort, speichert User aus der Session und navigiert nach /", async () => {
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

    const { page } = renderWithRouter();

    fireEvent.change(within(page).getByPlaceholderText("Neues Passwort"), {
      target: { value: "SicheresPasswort123!" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(mockedConfirmSignIn).toHaveBeenCalledWith({
        challengeResponse: "SicheresPasswort123!",
      });
    });

    await waitFor(() => {
      expect(mockedFetchAuthSession).toHaveBeenCalled();
      expect(mockedSaveCurrentUser).toHaveBeenCalledWith({
        nickname: "alice",
        email: "alice@example.com",
        role: "admin",
      });
    });
  });

  it("zeigt eine Fehlermeldung an, wenn confirmSignIn fehlschlägt", async () => {
    mockedConfirmSignIn.mockRejectedValue(new Error("Passwort zu schwach"));

    const { page } = renderWithRouter();

    fireEvent.change(within(page).getByPlaceholderText("Neues Passwort"), {
      target: { value: "123" },
    });
    fireEvent.click(within(page).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(
        within(page).getByText(/Passwort zu schwach/i),
      ).toBeInTheDocument();
    });
  });
});

