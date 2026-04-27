import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.mock("./components/Login", () => ({
  default: () => <div>Login Mock</div>,
}));

vi.mock("./components/CourseList", () => ({
  default: () => <div>CourseList Mock</div>,
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
    vi.clearAllMocks();
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

    const delegationSelect = await screen.findByLabelText(/vertretungsmodus auswählen/i);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /maya/i })).toBeInTheDocument();
    });
    await userEvent.selectOptions(delegationSelect, "maya");

    expect(screen.getByRole("dialog", { name: /vertretung bestätigen/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /bestätigen/i }));

    expect(screen.getByText(/vertretung aktiv:/i)).toBeInTheDocument();
    expect(screen.getByText(/du handelst im auftrag von/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /vertretung beenden/i }));
    expect(screen.queryByText(/vertretung aktiv:/i)).not.toBeInTheDocument();
  });
});
