import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Login from "./Login";
import { useCognitoAuth } from "../auth/useCognitoAuth";
import { loadCurrentUser } from "shared/lib/storage";
import { isDemoLoginEnabled } from "../lib/demoLoginFlag";
import { fetchAuthSession } from "aws-amplify/auth";
import { clearCognitoSession } from "../auth/cognitoSession";

vi.mock("../auth/useCognitoAuth", () => ({
  useCognitoAuth: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  loadCurrentUser: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({ tokens: undefined }),
}));

vi.mock("../auth/cognitoSession", () => ({
  clearCognitoSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/demoLoginFlag", () => ({
  isDemoLoginEnabled: vi.fn(() => true),
}));

const useCognitoAuthMock = useCognitoAuth as unknown as ReturnType<typeof vi.fn>;
const mockedLoadCurrentUser = loadCurrentUser as unknown as ReturnType<typeof vi.fn>;
const mockedIsDemoLoginEnabled = isDemoLoginEnabled as unknown as ReturnType<typeof vi.fn>;
const mockedFetchAuthSession = fetchAuthSession as unknown as ReturnType<typeof vi.fn>;
const mockedClearCognitoSession = clearCognitoSession as unknown as ReturnType<typeof vi.fn>;

function authStub(
  overrides: Partial<{
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    isLoading: boolean;
    error: string | null;
  }> = {},
) {
  return {
    login: vi.fn().mockResolvedValue(false),
    logout: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    ...overrides,
  };
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedIsDemoLoginEnabled.mockReturnValue(true);
    mockedFetchAuthSession.mockResolvedValue({ tokens: undefined });
    mockedClearCognitoSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("rendert Formular mit Demo-Credentials und ruft bei Erfolg onLogin mit gespeichertem User auf", async () => {
    const onLogin = vi.fn();

    useCognitoAuthMock.mockReturnValue(
      authStub({
        login: vi.fn().mockResolvedValue(true),
      }),
    );

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

    expect(screen.getByPlaceholderText("Login-Name")).toHaveValue("Luna");
    expect(screen.getByPlaceholderText("Passwort")).toHaveValue("Hallo123!");
    expect(screen.getByText(/Der Name aus der Einladung zum Einloggen/i)).toBeInTheDocument();
    expect(screen.getByText(/Demo:/i)).toBeInTheDocument();

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

  it("lässt Login-Felder leer ohne Demo-Flag", () => {
    mockedIsDemoLoginEnabled.mockReturnValue(false);
    const onLogin = vi.fn();

    useCognitoAuthMock.mockReturnValue(authStub());

    render(
      <MemoryRouter>
        <Login onLogin={onLogin} />
      </MemoryRouter>,
    );

    expect(screen.getByPlaceholderText("Login-Name")).toHaveValue("");
    expect(screen.getByPlaceholderText("Passwort")).toHaveValue("");
    expect(screen.queryByText(/Demo:/i)).not.toBeInTheDocument();
  });

  it("zeigt eine Fehlermeldung aus useCognitoAuth an", () => {
    const onLogin = vi.fn();

    useCognitoAuthMock.mockReturnValue(authStub({ error: "Login fehlgeschlagen" }));

    render(
      <MemoryRouter>
        <Login onLogin={onLogin} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Login fehlgeschlagen/i)).toBeInTheDocument();
  });

  it("zeigt Abmelden-Button bei Already-Authenticated-Fehler (#338)", () => {
    useCognitoAuthMock.mockReturnValue(
      authStub({ error: "There is already a signed in user." }),
    );

    render(
      <MemoryRouter>
        <Login onLogin={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Abmelden und neu anmelden/i })).toBeInTheDocument();
  });

  it("guestRoute: leitet bei gültiger Session zur App weiter (#338)", async () => {
    mockedFetchAuthSession.mockResolvedValue({
      tokens: { idToken: { payload: { nickname: "alice" } } },
    });
    useCognitoAuthMock.mockReturnValue(authStub());

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login onLogin={vi.fn()} guestRoute />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Home")).toBeInTheDocument();
    });
  });

  it("guestRoute: cleared verwaiste Session ohne Token (#338)", async () => {
    mockedFetchAuthSession.mockResolvedValue({ tokens: undefined });
    useCognitoAuthMock.mockReturnValue(authStub());

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<Login onLogin={vi.fn()} guestRoute />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockedClearCognitoSession).toHaveBeenCalled();
      expect(screen.getByPlaceholderText("Login-Name")).toBeInTheDocument();
    });
  });

  it("nutzt bei Weiterleitung aus Passwort-Reset den Nutzernamen statt Demo-Prefill", () => {
    const onLogin = vi.fn();

    useCognitoAuthMock.mockReturnValue(authStub());

    const { container } = render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/login",
            state: {
              info: "Passwort wurde zurueckgesetzt.",
              prefillUsername: "alice",
              prefillPassword: "NeuesPasswort123!",
            },
          } as never,
        ]}
      >
        <Routes>
          <Route path="/login" element={<Login onLogin={onLogin} />} />
        </Routes>
      </MemoryRouter>,
    );
    const page = container.querySelector(".login-wrap") as HTMLElement;

    expect(within(page).getByPlaceholderText("Login-Name")).toHaveValue("alice");
    expect(within(page).getByPlaceholderText("Passwort")).toHaveValue("NeuesPasswort123!");
    expect(within(page).queryByText(/Demo:/i)).not.toBeInTheDocument();
  });
});
