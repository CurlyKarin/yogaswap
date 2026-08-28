import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { getActingForUserId, setActingForUserId, setActorUserId } from "./api/delegation";
import { canManageParticipants } from "shared/permissions";

const coursesShellMock = vi.fn<(props: unknown) => void>();

const { createMockUseAppAuth } = vi.hoisted(() => ({
  createMockUseAppAuth: (overrides?: { error?: string | null; isLoading?: boolean }) => ({
    user: null,
    isLoading: overrides?.isLoading ?? false,
    error: overrides?.error ?? null,
    login: vi.fn().mockResolvedValue(false),
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("./components/Login", () => ({
  default: () => <div>Login Mock</div>,
}));

vi.mock("./components/CoursesShell", () => ({
  default: (props: unknown) => {
    coursesShellMock(props);
    return (
      <div>
        <div id="course-toolbar">
          <button type="button" aria-label="Vorherige Woche">
            Prev
          </button>
          <select aria-label="Kurstermin">
            <option>Termin</option>
          </select>
        </div>
        <span>CoursesShell Mock</span>
      </div>
    );
  },
}));

vi.mock("./components/AdminPanel", () => ({
  default: () => (
    <div>
      <input aria-label="Studioname" />
      <input aria-label="Teilnehmer suchen" />
      <span>AdminPanel Mock</span>
    </div>
  ),
}));

vi.mock("./components/Invite", () => ({
  default: () => <div>Invite Mock</div>,
}));

vi.mock("./components/ForgotPassword", () => ({
  default: () => <div>ForgotPassword Mock</div>,
}));

vi.mock("./components/Impressum", () => ({
  default: () => <div>Impressum Mock</div>,
}));

vi.mock("./components/Datenschutz", () => ({
  default: () => <div>Datenschutz Mock</div>,
}));

vi.mock("./components/OpenSourceLicenses", () => ({
  default: () => <div>Lizenzen Mock</div>,
}));

vi.mock("./auth/useAppAuth", () => ({
  useAppAuth: vi.fn(() => createMockUseAppAuth()),
}));

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn(),
}));

vi.mock("./api/tenantContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/tenantContext")>();
  return {
    ...actual,
    getTenantContext: vi.fn(),
  };
});

vi.mock("./api/participants", () => ({
  getParticipants: vi.fn(),
}));

vi.mock("shared/lib/storage", () => ({
  loadCurrentUser: vi.fn(() => null),
  saveCurrentUser: vi.fn(),
  clearCurrentUser: vi.fn(),
}));

vi.mock("shared/permissions", () => ({
  canInviteParticipants: vi.fn(() => true),
  canManageParticipants: vi.fn(() => true),
}));

async function renderLoggedInAdmin() {
  const { fetchAuthSession } = await import("aws-amplify/auth");
  const { getTenantContext } = await import("./api/tenantContext");
  const { getParticipants } = await import("./api/participants");

  vi.mocked(fetchAuthSession).mockResolvedValue({
    tokens: {
      idToken: {
        payload: {
          nickname: "admin",
          email: "admin@example.com",
          "custom:role": "admin",
        },
      },
    },
  } as unknown as never);

  vi.mocked(getTenantContext).mockResolvedValue({
    tenantId: "default-tenant",
    userId: "admin",
    tenant: { tenantId: "default-tenant", name: "Default" },
    membership: { tenantId: "default-tenant", userId: "admin", role: "admin" },
  } as unknown as never);

  vi.mocked(getParticipants).mockResolvedValue([] as unknown as never);

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  await waitFor(() => {
    expect(screen.getByText(/hi, admin/i)).toBeInTheDocument();
  });
}

describe("App shell a11y", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    coursesShellMock.mockClear();
    vi.mocked(canManageParticipants).mockReturnValue(true);
    setActingForUserId(null);
    setActorUserId(null);
    const { useAppAuth } = await import("./auth/useAppAuth");
    vi.mocked(useAppAuth).mockReturnValue(createMockUseAppAuth());
  });

  it("bietet Skip-Link und main-Landmark mit Kurs- und Verwaltungsbereich", async () => {
    await renderLoggedInAdmin();

    await waitFor(() => {
      expect(screen.getByText("AdminPanel Mock")).toBeInTheDocument();
    });

    expect(screen.getByRole("navigation", { name: /seitenüberspringen/i })).toBeInTheDocument();
    const skipControl = screen.getByRole("button", { name: /zum inhalt/i });
    expect(skipControl).toHaveAttribute("type", "button");

    const main = screen.getByRole("main");
    const coursesSection = document.getElementById("main-content");
    expect(coursesSection).not.toHaveAttribute("tabindex");
    expect(main).toContainElement(coursesSection);
    expect(screen.getByRole("navigation", { name: /benutzer-menü/i })).toBeInTheDocument();
    expect(main).toContainElement(screen.getByRole("heading", { level: 2, name: /kurse/i }));
    expect(main).toContainElement(document.getElementById("admin-heading"));
    expect(main).toContainElement(screen.getByText("CoursesShell Mock"));
    expect(main).toContainElement(screen.getByText("AdminPanel Mock"));
  });

  it("springt mit Leertaste zur Wochennavigation im Kursbereich", async () => {
    await renderLoggedInAdmin();

    const toolbar = document.getElementById("course-toolbar");
    expect(toolbar).not.toBeNull();
    const weekButton = screen.getByRole("button", { name: /vorherige woche/i });
    const scrollTo = vi.fn();
    const focus = vi.fn();
    window.scrollTo = scrollTo;
    weekButton.focus = focus;

    const skipControl = screen.getByRole("button", { name: /zum inhalt/i });
    skipControl.focus();
    await userEvent.keyboard(" ");

    expect(scrollTo).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("Tab-Reihenfolge: Skip-Links, Menü, Kurse, Verwaltung, Footer", async () => {
    const user = userEvent.setup();
    await renderLoggedInAdmin();

    await waitFor(() => {
      expect(screen.getByText("AdminPanel Mock")).toBeInTheDocument();
    });

    await user.tab();
    expect(screen.getByRole("button", { name: /zum menü/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /zum inhalt/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /zum fußbereich/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /logout/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /vertretung/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /vorherige woche/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("combobox", { name: /kurstermin/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("textbox", { name: /studioname/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("textbox", { name: /teilnehmer suchen/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("link", { name: /impressum/i })).toHaveFocus();
  });

  it("meldet Auth-Fehler als Alert", async () => {
    const { useAppAuth } = await import("./auth/useAppAuth");
    vi.mocked(useAppAuth).mockReturnValue(
      createMockUseAppAuth({ error: "Sitzung abgelaufen" }),
    );

    await renderLoggedInAdmin();

    expect(screen.getByRole("alert")).toHaveTextContent("Sitzung abgelaufen");
  });
});

describe("App delegation mode", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    coursesShellMock.mockClear();
    vi.mocked(canManageParticipants).mockReturnValue(true);
    setActingForUserId(null);
    setActorUserId(null);
  });

  it("shows delegation banner after confirm and allows ending delegation", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const { getTenantContext } = await import("./api/tenantContext");
    const { getParticipants } = await import("./api/participants");

    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "admin",
            email: "admin@example.com",
            "custom:role": "admin",
          },
        },
      },
    } as unknown as never);

    vi.mocked(getTenantContext).mockResolvedValue({
      tenant: { tenantId: "default-tenant", name: "Default" },
      membership: { tenantId: "default-tenant", userId: "admin", role: "admin" },
    } as unknown as never);

    vi.mocked(getParticipants).mockResolvedValue([
      { userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "luca", status: "invited", role: "participant", tenantId: "default-tenant" },
    ] as unknown as never);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/hi, admin/i)).toBeInTheDocument();
    });

    await userEvent.click(await screen.findByRole("button", { name: /^vertretung$/i }));
    await userEvent.click(await screen.findByRole("option", { name: /maya/i }));

    expect(screen.getByRole("dialog", { name: /vertretung bestätigen/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /bestätigen/i }));

    expect(screen.getByText(/vertretung aktiv:/i)).toBeInTheDocument();
    expect(screen.getByText(/du handelst im auftrag von/i)).toBeInTheDocument();
    expect(screen.queryByText(/AdminPanel Mock/i)).not.toBeInTheDocument();
    expect(coursesShellMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceParticipantView: true }),
    );

    await userEvent.click(screen.getByRole("button", { name: /vertretung beenden/i }));
    expect(screen.queryByText(/vertretung aktiv:/i)).not.toBeInTheDocument();
  });

  it("clears delegation context on logout", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const { getTenantContext } = await import("./api/tenantContext");
    const { getParticipants } = await import("./api/participants");

    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "admin",
            email: "admin@example.com",
            "custom:role": "admin",
          },
        },
      },
    } as unknown as never);

    vi.mocked(getTenantContext).mockResolvedValue({
      tenant: { tenantId: "default-tenant", name: "Default" },
      membership: { tenantId: "default-tenant", userId: "admin", role: "admin" },
    } as unknown as never);

    vi.mocked(getParticipants).mockResolvedValue([
      { userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" },
    ] as unknown as never);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/hi, admin/i)).toBeInTheDocument();
    });

    await userEvent.click(await screen.findByRole("button", { name: /^vertretung$/i }));
    await userEvent.click(await screen.findByRole("option", { name: /maya/i }));
    await userEvent.click(screen.getByRole("button", { name: /bestätigen/i }));
    expect(getActingForUserId()).toBe("maya");

    await userEvent.click(screen.getByRole("button", { name: /logout/i }));
    expect(getActingForUserId()).toBeNull();
  });

  it("does not show delegation entry when user cannot delegate", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const { getTenantContext } = await import("./api/tenantContext");
    const { canManageParticipants } = await import("shared/permissions");

    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "admin",
            email: "admin@example.com",
            "custom:role": "admin",
          },
        },
      },
    } as unknown as never);

    vi.mocked(getTenantContext).mockResolvedValue({
      tenant: { tenantId: "default-tenant", name: "Default" },
      membership: { tenantId: "default-tenant", userId: "admin", role: "admin" },
    } as unknown as never);

    vi.mocked(canManageParticipants).mockReturnValue(false);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/hi, admin/i)).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^vertretung$/i })).not.toBeInTheDocument();
  });

  it("allows cancelling delegation confirmation without activating mode", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const { getTenantContext } = await import("./api/tenantContext");
    const { getParticipants } = await import("./api/participants");

    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "admin",
            email: "admin@example.com",
            "custom:role": "admin",
          },
        },
      },
    } as unknown as never);

    vi.mocked(getTenantContext).mockResolvedValue({
      tenant: { tenantId: "default-tenant", name: "Default" },
      membership: { tenantId: "default-tenant", userId: "admin", role: "admin" },
    } as unknown as never);

    vi.mocked(getParticipants).mockResolvedValue([
      { userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" },
    ] as unknown as never);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/hi, admin/i)).toBeInTheDocument();
    });

    await userEvent.click(await screen.findByRole("button", { name: /^vertretung$/i }));
    await userEvent.click(await screen.findByRole("option", { name: /maya/i }));
    await userEvent.click(screen.getByRole("button", { name: /abbrechen/i }));

    expect(screen.queryByText(/vertretung aktiv:/i)).not.toBeInTheDocument();
    expect(getActingForUserId()).toBeNull();
  });

  it("supports switching delegation from one participant to another", async () => {
    const { fetchAuthSession } = await import("aws-amplify/auth");
    const { getTenantContext } = await import("./api/tenantContext");
    const { getParticipants } = await import("./api/participants");

    vi.mocked(fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            nickname: "admin",
            email: "admin@example.com",
            "custom:role": "admin",
          },
        },
      },
    } as unknown as never);

    vi.mocked(getTenantContext).mockResolvedValue({
      tenant: { tenantId: "default-tenant", name: "Default" },
      membership: { tenantId: "default-tenant", userId: "admin", role: "admin" },
    } as unknown as never);

    vi.mocked(getParticipants).mockResolvedValue([
      { userId: "maya", status: "active", role: "participant", tenantId: "default-tenant" },
      { userId: "luca", status: "invited", role: "participant", tenantId: "default-tenant" },
    ] as unknown as never);

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/hi, admin/i)).toBeInTheDocument();
    });

    await userEvent.click(await screen.findByRole("button", { name: /^vertretung$/i }));
    await userEvent.click(await screen.findByRole("option", { name: /maya/i }));
    await userEvent.click(screen.getByRole("button", { name: /bestätigen/i }));
    expect(screen.getByText(/im auftrag von/i)).toHaveTextContent(/maya/i);
    expect(getActingForUserId()).toBe("maya");

    await userEvent.click(screen.getByRole("button", { name: /^vertretung$/i }));
    await userEvent.click(await screen.findByRole("option", { name: /luca/i }));
    await userEvent.click(screen.getByRole("button", { name: /bestätigen/i }));

    expect(screen.getByText(/im auftrag von/i)).toHaveTextContent(/luca/i);
    expect(getActingForUserId()).toBe("luca");
  });
});
