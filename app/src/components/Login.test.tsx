import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import Login from "./Login";
import { useCognitoAuth } from "../auth/useCognitoAuth";
import { loadCurrentUser } from "shared/lib/storage";

vi.mock("../auth/useCognitoAuth", () => ({
  useCognitoAuth: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  loadCurrentUser: vi.fn(),
}));

const useCognitoAuthMock = useCognitoAuth as unknown as ReturnType<typeof vi.fn>;
const mockedLoadCurrentUser = loadCurrentUser as unknown as ReturnType<typeof vi.fn>;

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rendert Formular mit Demo-Credentials und ruft bei Erfolg onLogin mit gespeichertem User auf", async () => {
    const onLogin = vi.fn();

    useCognitoAuthMock.mockReturnValue({
      login: vi.fn().mockResolvedValue(true),
      isLoading: false,
      error: null,
    });

    mockedLoadCurrentUser.mockReturnValue({
      nickname: "Luna",
      email: "luna@example.com",
      role: "participant",
    });

    render(
      <MemoryRouter>
        <Login onLogin={onLogin} />
      </MemoryRouter>,
    );

    // Demo-Werte sind vorausgefüllt
    expect(screen.getByPlaceholderText("Spitzname")).toHaveValue("Luna");
    expect(screen.getByPlaceholderText("Passwort")).toHaveValue("Hallo123!");

    fireEvent.click(screen.getByRole("button", { name: /Login/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith({
        nickname: "Luna",
        email: "luna@example.com",
        role: "participant",
      });
    });
    expect(screen.getByRole("link", { name: /Passwort vergessen\?/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("zeigt eine Fehlermeldung aus useCognitoAuth an", () => {
    const onLogin = vi.fn();

    useCognitoAuthMock.mockReturnValue({
      login: vi.fn().mockResolvedValue(false),
      isLoading: false,
      error: "Login fehlgeschlagen",
    });

    render(
      <MemoryRouter>
        <Login onLogin={onLogin} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Login fehlgeschlagen/i)).toBeInTheDocument();
  });
});

