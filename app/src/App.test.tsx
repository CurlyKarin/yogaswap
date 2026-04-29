import { describe, expect, it, beforeEach, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { getActingForUserId, setActingForUserId, setActorUserId } from "./api/delegation";
import { canManageParticipants } from "shared/permissions";

const courseListMock = vi.fn<(props: unknown) => void>();

vi.mock("./components/Login", () => ({
  default: () => <div>Login Mock</div>,
}));

vi.mock("./components/CourseList", () => ({
  default: (props: unknown) => {
    courseListMock(props);
    return <div>CourseList Mock</div>;
  },
}));

vi.mock("./components/AdminPanel", () => ({
  default: () => <div>AdminPanel Mock</div>,
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
  useAppAuth: () => ({
    logout: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
  }),
}));

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn(),
}));

vi.mock("./api/tenantContext", () => ({
  getTenantContext: vi.fn(),
}));

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

describe("App delegation mode", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    courseListMock.mockClear();
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
    expect(courseListMock).toHaveBeenLastCalledWith(
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
