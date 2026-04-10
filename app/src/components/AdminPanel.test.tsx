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
    vi.clearAllMocks();
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
    fireEvent.click(within(deleteDialog).getByRole("button", { name: /^Löschen$/i }));

    await waitFor(() => {
      expect(mockedDeleteParticipant).toHaveBeenCalledWith("alice");
      expect(within(panel).getByText(/Profil-Cleanup/i)).toBeInTheDocument();
      expect(within(panel).getByText(/Info-Mail gesendet an alice@example.com/i)).toBeInTheDocument();
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

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByLabelText("Weitere Aktionen alice")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Weitere Aktionen alice"));
    await waitFor(() => {
      expect(within(panel).getByLabelText("Passwort zurücksetzen alice")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Passwort zurücksetzen alice"));

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
    expect(within(panel).queryByLabelText("Passwort zurücksetzen alice")).not.toBeInTheDocument();
    expect(within(panel).getByLabelText("Bearbeiten alice")).toBeDisabled();
  });

  it("sendet Einladungen gesammelt für ausgewählte Teilnehmer", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce([
        // Refresh nach Bulk: Status ist egal für den Test, wir liefern einfach erneut Daten.
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "invited",
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
      // Refresh am Ende
      expect(mockedGetParticipants).toHaveBeenCalledTimes(2);
    });
  });

  it("legt einen Teilnehmer über + Neu an (Nickname Pflicht, E-Mail optional)", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "no_login",
        },
      ]);

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
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({ nickname: "alice", role: "participant" });
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", { email: "alice@example.com" });
      expect(within(panel).getByText("alice")).toBeInTheDocument();
      expect(within(panel).getByText("alice@example.com")).toBeInTheDocument();
    });
  });

  it("ueberschreibt E-Mail bei Reaktivierung standardmaessig nicht", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
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
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

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
        role: "participant",
        email: "alice@example.com",
        status: "invited",
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
      role: "participant",
      email: "alice.new@example.com",
      status: "invited",
    });

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
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });
    await waitFor(() => {
      expect(
        within(dialog).getByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer: alice/i),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /Eingegebene E-Mail fuer Reaktivierung uebernehmen/i,
      }),
    );
    expect(within(dialog).getByText(/Mail geht an: alice\.new@example\.com/i)).toBeInTheDocument();

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

  it("uebernimmt E-Mail in Create-Form anhand des Nicknames", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "invited",
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
      expect(
        within(dialog).getByText(/Spitzname existiert bereits \(case-insensitiv\)/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Reaktivieren$/i })).toBeInTheDocument();
    });
  });

  it("blockt aktive Nicknames und bietet Vorschlag mit Suffix", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
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

    await waitFor(() => {
      expect(
        within(dialog).getByText(/bereits aktiv/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Uebernehmen/i })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Anlegen$/i })).toBeDisabled();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /Uebernehmen/i }));
    expect((within(dialog).getByPlaceholderText("Spitzname") as HTMLInputElement).value).toBe("kai1");
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
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", { email: "alice@example.com" });
    });
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
      within(dialog).getByLabelText(/Bei E-Mail-Wechsel Passwort-Reset erzwingen/i),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice.new@example.com",
        forcePasswordResetOnEmailChange: true,
        role: "participant",
      });
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

