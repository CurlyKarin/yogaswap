import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import AdminPanel from "./AdminPanel";
import {
  deleteParticipant,
  getParticipants,
  inviteUser,
  resetParticipantPassword,
  updateParticipant,
} from "../api/participants";

vi.mock("../api/participants", () => ({
  inviteUser: vi.fn(),
  resetParticipantPassword: vi.fn(),
  getParticipants: vi.fn(),
  updateParticipant: vi.fn(),
  deleteParticipant: vi.fn(),
}));

const mockedInviteUser = inviteUser as unknown as ReturnType<typeof vi.fn>;
const mockedResetParticipantPassword = resetParticipantPassword as unknown as ReturnType<typeof vi.fn>;
const mockedGetParticipants = getParticipants as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateParticipant = updateParticipant as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteParticipant = deleteParticipant as unknown as ReturnType<typeof vi.fn>;

describe("AdminPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetParticipants.mockResolvedValue([]);
  });


  it("lädt Teilnehmerliste für die Verwaltung", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
      expect(within(panel).getByText("Teilnehmerin")).toBeInTheDocument();
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
      expect(within(panel).getByLabelText("Status: ohne Login")).toBeInTheDocument();
      expect(within(panel).getByLabelText("Einladen alice")).not.toBeDisabled();
      expect(within(panel).getByLabelText("Bearbeiten alice")).not.toBeDisabled();
      expect(within(panel).queryByLabelText("Löschen alice")).not.toBeInTheDocument();
    });
  });

  it("löscht Teilnehmer aus der Teilnehmerliste", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "no_login",
        },
      ])
      .mockResolvedValueOnce([]);

    mockedDeleteParticipant.mockResolvedValueOnce({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
      notificationEmail: "alice@example.com",
      notificationEmailSent: true,
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Löschen alice"));
    const deleteDialog = within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i });
    expect(
      within(deleteDialog).getByText(/vollständig entfernt, ohne Info-Mail/i),
    ).toBeInTheDocument();
    fireEvent.click(within(deleteDialog).getByRole("button", { name: /^Löschen$/i }));

    await waitFor(() => {
      expect(mockedDeleteParticipant).toHaveBeenCalledWith("alice");
      expect(within(panel).getByText(/Profil-Cleanup/i)).toBeInTheDocument();
      expect(within(panel).getByText(/Info-Mail gesendet an alice@example.com/i)).toBeInTheDocument();
    });
  });

  it("zeigt im Löschdialog für registrierte Nutzer den Hinweis auf Info-Mail", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "active",
        authUserId: "sub-123",
        inviteCompletedAt: "2026-04-10T10:00:00.000Z",
      },
    ]);

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Löschen alice"));
    const deleteDialog = within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i });
    expect(
      within(deleteDialog).getByText(/Profil bleibt erhalten und es wird eine Info-Mail versendet/i),
    ).toBeInTheDocument();
  });

  it("schließt den Anlegen-Dialog per Escape", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(within(panel).queryByRole("dialog", { name: /Teilnehmer anlegen/i })).not.toBeInTheDocument();
    });
  });

  it("schließt den Bearbeiten-Dialog per Escape", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(within(panel).queryByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i })).not.toBeInTheDocument();
    });
  });

  it("schließt den Lösch-Dialog nicht per Escape während Löschen läuft", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);
    let resolveDelete!: (value: {
      success: boolean;
      membershipDeleted: boolean;
      profileDeleted: boolean;
      notificationEmail: string;
      notificationEmailSent: boolean;
    }) => void;
    const pendingDelete = new Promise<{
      success: boolean;
      membershipDeleted: boolean;
      profileDeleted: boolean;
      notificationEmail: string;
      notificationEmailSent: boolean;
    }>((resolve) => {
      resolveDelete = resolve;
    });
    mockedDeleteParticipant.mockImplementationOnce(() => pendingDelete);

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Löschen alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Löschen$/i }));

    await waitFor(() => {
      expect(within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i })).toBeInTheDocument();
    });
    fireEvent.keyDown(within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i }), { key: "Escape" });
    expect(within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i })).toBeInTheDocument();

    resolveDelete({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
      notificationEmail: "alice@example.com",
      notificationEmailSent: true,
    });
    await waitFor(() => {
      expect(within(panel).queryByRole("dialog", { name: /Teilnehmer löschen/i })).not.toBeInTheDocument();
    });
  });

  it("sendet Einladung aus der Teilnehmerliste", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "no_login",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "invited",
        },
      ]);

    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: true,
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByLabelText("Einladen alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Einladen alice"));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "alice@example.com",
        nickname: "alice",
        role: "participant",
      });
      expect(within(panel).getByText(/Einladung gesendet an alice@example.com/i)).toBeInTheDocument();
    });
  });

  it("setzt Passwort für registrierten Teilnehmer aus der Verwaltung zurück", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "active",
          authUserId: "sub-alice",
          inviteCompletedAt: "2026-04-01T10:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "active",
          authUserId: "sub-alice",
          inviteCompletedAt: "2026-04-01T10:00:00.000Z",
        },
      ]);

    mockedResetParticipantPassword.mockResolvedValueOnce({
      success: true,
      emailSent: true,
    });
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: "participant",
      email: "alice@example.com",
      status: "active",
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.click(
      within(dialog).getByLabelText(/Passwort-Reset-Mail senden/i),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern und Senden/i }));

    await waitFor(() => {
      expect(mockedResetParticipantPassword).toHaveBeenCalledWith("alice");
      expect(within(panel).getByText(/Passwort-Reset-Mail gesendet an alice@example.com/i)).toBeInTheDocument();
    });
  });

  it("zeigt Passwort-Reset-Button nicht für Trainer/ohne Admin-Rechte", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "active",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });
    expect(within(panel).queryByLabelText("Weitere Aktionen alice")).not.toBeInTheDocument();
    expect(within(panel).getByLabelText("Bearbeiten alice")).toBeDisabled();
  });

  it("sendet Einladungen gesammelt für ausgewählte Teilnehmer", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
      {
        tenantId: "default-tenant",
        userId: "bob",
        role: "participant",
        email: "bob@example.com",
        status: "invited",
      },
      {
        tenantId: "default-tenant",
        userId: "carol",
        role: "participant",
        email: "carol@example.com",
        status: "active",
      },
    ]);

    mockedInviteUser
      .mockResolvedValueOnce({ success: true, emailSent: true })
      .mockResolvedValueOnce({ success: true, emailSent: true });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
      expect(within(panel).getByText("bob")).toBeInTheDocument();
      expect(within(panel).getByText("carol")).toBeInTheDocument();
    });

    // carol ist active → Checkbox disabled
    expect(within(panel).getByLabelText("Auswählen carol")).toBeDisabled();

    fireEvent.click(within(panel).getByLabelText("Auswählen alice"));
    fireEvent.click(within(panel).getByLabelText("Auswählen bob"));

    const bulkBtn = within(panel).getByRole("button", { name: /Ausgewählte einladen/i });
    expect(bulkBtn).not.toBeDisabled();
    fireEvent.click(bulkBtn);

    await waitFor(() => {
      // 2 Einladungen ausgelöst
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "alice@example.com",
        nickname: "alice",
        role: "participant",
      });
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "bob@example.com",
        nickname: "bob",
        role: "participant",
      });
      // Refresh am Ende (kann in Test-Umgebung öfter aufgerufen werden)
      expect(mockedGetParticipants.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("legt einen Teilnehmer über + Neu an (Nickname Pflicht, E-Mail optional)", async () => {
    mockedGetParticipants.mockResolvedValue([]);

    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: false,
    });

    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: "participant",
      email: "alice@example.com",
      status: "no_login",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));

    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));
    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(false);
    });
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({ nickname: "alice", role: "participant" });
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", { email: "alice@example.com" });
    });
  });

  it("hält E-Mail ohne validierten Nickname deaktiviert", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    const nicknameInput = within(dialog).getByPlaceholderText("Spitzname");
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;

    expect(emailInput.disabled).toBe(true);

    fireEvent.change(nicknameInput, { target: { value: "al" } });
    fireEvent.blur(nicknameInput);

    await waitFor(() => {
      expect(within(dialog).getByText(/Nickname-Prüfung startet ab 3 Zeichen/i)).toBeInTheDocument();
      expect(emailInput.disabled).toBe(true);
    });
  });

  it("ueberschreibt E-Mail bei Reaktivierung standardmaessig nicht", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: undefined,
        email: "alice@example.com",
        status: "active",
      },
    ]);
    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: true,
      reactivated: true,
      username: "alice",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));
    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).value).toBe(
        "alice@example.com",
      );
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(true);
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^(Reaktivieren|Anlegen)$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({ nickname: "alice", role: "participant" });
      expect(mockedUpdateParticipant).not.toHaveBeenCalled();
      expect(
        within(panel).getByText(/Reaktivierung: Info-Mail gesendet an bestehende Profil-E-Mail\./i),
      ).toBeInTheDocument();
    });
  });

  it("sendet bei Reaktivierung mit E-Mail-Ueberschreiben die neue E-Mail direkt beim Invite", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: undefined,
        email: "alice@example.com",
        status: "active",
      },
    ]);
    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: true,
      reactivated: true,
      username: "alice",
    });
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: undefined,
      email: "alice.new@example.com",
      status: "active",
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));
    await waitFor(() => {
      expect(
        within(dialog).getByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer: alice/i),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /E-Mail fuer Reaktivierung bearbeiten/i,
      }),
    );
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });
    expect(within(dialog).getByText(/Mail geht an: alice\.new@example\.com/i)).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /E-Mail fuer Reaktivierung bearbeiten/i,
      }),
    );
    expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).value).toBe("alice@example.com");

    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /E-Mail fuer Reaktivierung bearbeiten/i,
      }),
    );
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^(Reaktivieren|Anlegen)$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        nickname: "alice",
        role: "participant",
      });
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice.new@example.com",
      });
      expect(
        within(panel).getByText(/Reaktivierung: Info-Mail gesendet an alice\.new@example\.com\./i),
      ).toBeInTheDocument();
    });
  });

  it("fokussiert bei Reaktivierung per Tab zuerst die Reaktivierungs-Checkbox", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: undefined,
        email: "alice@example.com",
        status: "active",
      },
    ]);

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    const nicknameInput = within(dialog).getByPlaceholderText("Spitzname") as HTMLInputElement;
    fireEvent.change(nicknameInput, { target: { value: "alice" } });
    nicknameInput.focus();
    fireEvent.keyDown(nicknameInput, { key: "Tab" });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(dialog).getByRole("checkbox", { name: /E-Mail fuer Reaktivierung bearbeiten/i }),
      );
    });
  });

  it("setzt Reaktivierungs-Eingaben beim erneuten Blur ohne Nickname-Änderung nicht zurück", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: undefined,
        email: "alice@example.com",
        status: "active",
      },
    ]);

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    const nicknameInput = within(dialog).getByPlaceholderText("Spitzname") as HTMLInputElement;
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;

    fireEvent.change(nicknameInput, { target: { value: "alice" } });
    fireEvent.blur(nicknameInput);
    let reactivationCheckbox: HTMLInputElement;
    await waitFor(() => {
      reactivationCheckbox = within(dialog).getByRole("checkbox", {
        name: /E-Mail fuer Reaktivierung bearbeiten/i,
      }) as HTMLInputElement;
      expect(reactivationCheckbox.checked).toBe(false);
      expect(emailInput.disabled).toBe(true);
    });

    fireEvent.click(reactivationCheckbox!);
    fireEvent.change(emailInput, { target: { value: "alice.new@example.com" } });
    expect(reactivationCheckbox!.checked).toBe(true);
    expect(emailInput.value).toBe("alice.new@example.com");

    fireEvent.focus(nicknameInput);
    fireEvent.blur(nicknameInput);

    await waitFor(() => {
      expect(reactivationCheckbox!.checked).toBe(true);
      expect(emailInput.disabled).toBe(false);
      expect(emailInput.value).toBe("alice.new@example.com");
    });
  });

  it("Kursleitung sieht Reaktivierungs-E-Mail nur read-only und ohne Checkbox", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: undefined,
        email: "alice@example.com",
        status: "active",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer: alice/i),
      ).toBeInTheDocument();
    });

    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;
    expect(emailInput).toBeDisabled();
    expect(emailInput.value).toBe("alice@example.com");
    expect(
      within(dialog).queryByRole("checkbox", {
        name: /E-Mail fuer Reaktivierung bearbeiten/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("uebernimmt E-Mail in Create-Form anhand des Nicknames", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: undefined,
          email: "alice@example.com",
          status: "active",
        },
      ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });

    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "Alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));

    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).value).toBe(
        "alice@example.com",
      );
      expect(mockedGetParticipants).toHaveBeenCalledWith({
        search: "alice",
        includeOrphaned: true,
      });
      expect(
        within(dialog).getByText(/E-Mail aus bestehendem Profil uebernommen\./i),
      ).toBeInTheDocument();
      expect(
        within(dialog).getByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer: alice/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Reaktivieren$/i })).toBeInTheDocument();
    });
  });

  it("blockt aktive Nicknames und bietet Vorschlag mit Suffix", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "Kai",
        role: "participant",
        email: "kai@example.com",
        status: "active",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });

    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "kai" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/bereits aktiv/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Uebernehmen/i })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Anlegen$/i })).toBeDisabled();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /Uebernehmen/i }));
    expect((within(dialog).getByPlaceholderText("Spitzname") as HTMLInputElement).value).toBe("kai1");
    expect(within(dialog).queryByText(/bereits aktiv/i)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: /^Anlegen$/i })).not.toBeDisabled();
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(false);
    });
  });

  it("fokussiert E-Mail direkt bei Tab nach neuer Nickname-Prüfung", async () => {
    mockedGetParticipants.mockResolvedValue([]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    const nicknameInput = within(dialog).getByPlaceholderText("Spitzname") as HTMLInputElement;
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;

    fireEvent.change(nicknameInput, { target: { value: "mira" } });
    nicknameInput.focus();
    fireEvent.keyDown(nicknameInput, { key: "Tab" });

    await waitFor(() => {
      expect(document.activeElement).toBe(emailInput);
    });
  });

  it("erkennt eingeladenen Studio-Teilnehmer nicht als Reaktivierung", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "invited",
      },
    ]);

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Spitzname"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Spitzname"));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/Teilnehmer existiert bereits im Studio/i),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer/i),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("checkbox", { name: /E-Mail fuer Reaktivierung bearbeiten/i }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Anlegen$/i })).toBeDisabled();
    });
  });

  it("bearbeitet E-Mail eines Teilnehmers über den Stift", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: "participant",
      email: "alice.new@example.com",
      status: "no_login",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));

    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "alice.new@example.com" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", { email: "alice.new@example.com" });
      expect(within(panel).getByText("alice.new@example.com")).toBeInTheDocument();
    });
  });

  it("Trainer darf E-Mail für eingeladenen Teilnehmer korrigieren", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "wrong@example.com",
        status: "invited",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: "participant",
      email: "alice@example.com",
      status: "invited",
    });
    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: true,
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByLabelText("Bearbeiten alice")).not.toBeDisabled();
    });

    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern und Senden/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", { email: "alice@example.com" });
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "alice@example.com",
        nickname: "alice",
        role: "participant",
      });
    });
  });

  it("Trainer kann Admins/Trainer nicht bearbeiten oder einladen", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "admin1",
        role: "admin",
        email: "admin@example.com",
        status: "invited",
      },
      {
        tenantId: "default-tenant",
        userId: "trainer1",
        role: "instructor",
        email: "trainer@example.com",
        status: "no_login",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("admin1")).toBeInTheDocument();
      expect(within(panel).getByText("trainer1")).toBeInTheDocument();
    });

    expect(within(panel).getByLabelText("Bearbeiten admin1")).toBeDisabled();
    expect(within(panel).getByLabelText("Bearbeiten trainer1")).toBeDisabled();
    expect(within(panel).getByLabelText("Erneut einladen admin1")).toBeDisabled();
    expect(within(panel).getByLabelText("Einladen trainer1")).toBeDisabled();
  });

  it("zeigt Rollenauswahl im Anlegen-Dialog nur für Admin", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);

    const { container, rerender } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByLabelText("Neuer Teilnehmer"));
    let dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    expect(within(dialog).queryByLabelText("Rolle")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Abbrechen/i }));

    rerender(<AdminPanel canEditRoles />);
    fireEvent.click(within(panel).getByLabelText("Neuer Teilnehmer"));
    dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    expect(within(dialog).getByLabelText("Rolle")).toBeInTheDocument();
  });

  it("erzwingt optional Passwort-Reset beim E-Mail-Wechsel", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "active",
      },
    ]);

    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: "participant",
      email: "alice.new@example.com",
      status: "invited",
      passwordResetEmailSent: true,
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });
    fireEvent.click(
      within(dialog).getByLabelText(/Passwort-Reset-Mail senden/i),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice.new@example.com",
        role: "participant",
      });
      expect(mockedResetParticipantPassword).toHaveBeenCalledWith("alice");
    });
  });

  it("zeigt Rollenfeld im Bearbeiten-Dialog nur fuer Admin und speichert Rolle mit", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      role: "instructor",
      email: "alice@example.com",
      status: "no_login",
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    expect(within(dialog).getByLabelText("Rolle bearbeiten")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Rolle bearbeiten"), {
      target: { value: "instructor" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice@example.com",
        role: "instructor",
      });
      expect(within(panel).getByText("Kursleitung")).toBeInTheDocument();
    });
  });

  it("validiert E-Mail Format beim Bearbeiten", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));

    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "not-an-email" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(within(dialog).getByText(/gültige E-Mail-Adresse/i)).toBeInTheDocument();
    });
    expect(mockedUpdateParticipant).not.toHaveBeenCalled();
  });

  it("lädt Teilnehmerliste neu mit Suchbegriff", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "no_login",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "bob",
          role: "participant",
          email: "bob@example.com",
          status: "active",
        },
      ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.change(within(panel).getByLabelText("Teilnehmer suchen"), {
      target: { value: "bob" },
    });

    await waitFor(() => {
      expect(mockedGetParticipants).toHaveBeenLastCalledWith({ search: "bob" });
      expect(within(panel).getByText("bob")).toBeInTheDocument();
    });
  });
});

