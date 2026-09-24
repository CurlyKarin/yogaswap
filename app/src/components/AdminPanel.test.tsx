import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import React from "react";
import AdminPanel from "./AdminPanel";
import {
  checkStudioExitBlockers,
  deleteParticipant,
  getIdentityCandidates,
  getParticipants,
  inviteUser,
  purgeParticipant,
  resetParticipantPassword,
  updateParticipant,
} from "../api/participants";

vi.mock("../api/participants", () => ({
  inviteUser: vi.fn(),
  resetParticipantPassword: vi.fn(),
  getParticipants: vi.fn(),
  getIdentityCandidates: vi.fn(),
  updateParticipant: vi.fn(),
  deleteParticipant: vi.fn(),
  purgeParticipant: vi.fn(),
  checkStudioExitBlockers: vi.fn(),
}));

const mockedInviteUser = inviteUser as unknown as ReturnType<typeof vi.fn>;
const mockedResetParticipantPassword = resetParticipantPassword as unknown as ReturnType<typeof vi.fn>;
const mockedGetParticipants = getParticipants as unknown as ReturnType<typeof vi.fn>;
const mockedGetIdentityCandidates = getIdentityCandidates as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateParticipant = updateParticipant as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteParticipant = deleteParticipant as unknown as ReturnType<typeof vi.fn>;
const mockedPurgeParticipant = purgeParticipant as unknown as ReturnType<typeof vi.fn>;
const mockedCheckStudioExitBlockers = checkStudioExitBlockers as unknown as ReturnType<typeof vi.fn>;

describe("AdminPanel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedGetParticipants.mockResolvedValue([]);
    mockedGetIdentityCandidates.mockResolvedValue([]);
    mockedCheckStudioExitBlockers.mockResolvedValue({
      blocked: false,
      asOf: "2026-09-18",
      courses: [],
      swaps: [],
      waitlist: [],
    });
  });


  it("lädt Teilnehmerliste für die Verwaltung", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
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
      expect(within(panel).getByText("ohne Login")).toBeInTheDocument();
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
          userId: "alice", participantId: "alice",
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
      notificationEmailAttempted: false,
      notificationEmailSent: false,
      authTokensInvalidated: 0,
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
    await waitFor(() => {
      expect(mockedCheckStudioExitBlockers).toHaveBeenCalledWith("alice");
      expect(within(deleteDialog).getByRole("button", { name: /^Löschen$/i })).not.toBeDisabled();
    });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: /^Löschen$/i }));

    await waitFor(() => {
      expect(mockedDeleteParticipant).toHaveBeenCalledWith("alice");
      expect(within(panel).getByText(/Profil-Cleanup/i)).toBeInTheDocument();
      expect(within(panel).queryByText(/Info-Mail/i)).not.toBeInTheDocument();
    });
  });

  it("löscht ehemalige Mitglieder endgültig über den Purge-Dialog (#271)", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "active",
          participantId: "active",
          role: "participant",
          email: "active@example.com",
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "former",
          participantId: "former",
          email: "former@example.com",
          status: "no_login",
          authUserId: "sub-former",
        },
        {
          tenantId: "default-tenant",
          userId: "active",
          participantId: "active",
          role: "participant",
          email: "active@example.com",
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "active",
          participantId: "active",
          role: "participant",
          email: "active@example.com",
          status: "active",
        },
      ]);

    mockedPurgeParticipant.mockResolvedValueOnce({
      success: true,
      profileDeleted: true,
      cognitoUserDeleted: true,
      purgeScope: "full_account",
      notificationEmail: "former@example.com",
      notificationEmailAttempted: true,
      notificationEmailSent: true,
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("active")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByRole("button", { name: /Ehemalige endgültig löschen/i }));

    const purgeDialog = await within(panel).findByRole("dialog", {
      name: /Ehemalige endgültig löschen/i,
    });
    await waitFor(() => {
      expect(mockedGetParticipants).toHaveBeenCalledWith({ includeOrphaned: true });
      expect(within(purgeDialog).getByText("former")).toBeInTheDocument();
      expect(within(purgeDialog).queryByText("active")).not.toBeInTheDocument();
    });

    fireEvent.click(within(purgeDialog).getByLabelText("Endgültig löschen former"));
    const confirmDialog = within(panel).getByRole("dialog", {
      name: /Endgültiges Löschen bestätigen/i,
    });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: /Endgültig löschen/i }));

    await waitFor(() => {
      expect(mockedPurgeParticipant).toHaveBeenCalledWith("former");
      expect(
        within(panel).getByText(/Studio-Daten und YogaSwap-Login von "former" endgültig gelöscht/i),
      ).toBeInTheDocument();
    });
  });

  it("zieht Einladung zurück mit Info-Mail-Hinweis und Erfolgsmeldung", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice",
          participantId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "invited",
        },
      ])
      .mockResolvedValueOnce([]);

    mockedDeleteParticipant.mockResolvedValueOnce({
      success: true,
      membershipDeleted: true,
      profileDeleted: true,
      notificationEmail: "alice@example.com",
      notificationEmailAttempted: true,
      notificationEmailSent: true,
      authTokensInvalidated: 1,
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
      within(deleteDialog).getByText(/Einladung wird zurückgezogen/i),
    ).toBeInTheDocument();
    expect(
      within(deleteDialog).getByText(/Info-Mail versendet/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(within(deleteDialog).getByRole("button", { name: /^Löschen$/i })).not.toBeDisabled();
    });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: /^Löschen$/i }));

    await waitFor(() => {
      expect(mockedDeleteParticipant).toHaveBeenCalledWith("alice");
      expect(within(panel).getByText(/Info-Mail gesendet an alice@example.com/i)).toBeInTheDocument();
    });
  });

  it("blockiert Studio-Exit bei offenen Kurszuordnungen und zeigt die Blocker", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "active",
        authUserId: "sub-123",
      },
    ]);
    mockedCheckStudioExitBlockers.mockResolvedValueOnce({
      blocked: true,
      asOf: "2026-09-18",
      courses: [{ courseId: 1, courseName: "Morgenyoga", reason: "enrollment" }],
      swaps: [
        {
          fromDate: "2026-09-20",
          fromCourseId: 1,
          toDate: "2026-09-22",
          toCourseId: 2,
          status: "pending",
        },
      ],
      waitlist: [{ courseId: 3, date: "2026-09-25", courseName: "Abend" }],
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Löschen alice"));
    const deleteDialog = within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i });

    await waitFor(() => {
      expect(within(deleteDialog).getByText(/Morgenyoga/i)).toBeInTheDocument();
      expect(within(deleteDialog).getByText(/pending/i)).toBeInTheDocument();
      expect(within(deleteDialog).getByText(/Abend/i)).toBeInTheDocument();
      expect(within(deleteDialog).getByRole("button", { name: /^Löschen$/i })).toBeDisabled();
    });
    expect(mockedDeleteParticipant).not.toHaveBeenCalled();
  });

  it("zeigt im Löschdialog für registrierte Nutzer den Hinweis auf Info-Mail", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
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
        userId: "alice", participantId: "alice",
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
        userId: "alice", participantId: "alice",
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
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: /^Löschen$/i })).not.toBeDisabled();
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Löschen$/i }));

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: /Lösche/i })).toBeDisabled();
    });
    fireEvent.keyDown(within(panel).getByRole("dialog", { name: /Teilnehmer löschen/i }), {
      key: "Escape",
    });
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
          userId: "alice", participantId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "no_login",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice", participantId: "alice",
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

  it("überspringt Identity-Dialog bei erneuter Einladung (status invited)", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "sabine",
          participantId: "sabine",
          role: "participant",
          email: "shared@example.com",
          status: "invited",
          inviteSentAt: "2026-03-01T10:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "sabine",
          participantId: "sabine",
          role: "participant",
          email: "shared@example.com",
          status: "invited",
          inviteSentAt: "2026-03-01T10:00:00.000Z",
        },
      ]);
    mockedGetIdentityCandidates.mockResolvedValueOnce([
      {
        cognitoUsername: "opaque-sabine",
        nickname: "Sabine",
        tenantUserId: "sabine",
        tenantStatus: "invited",
        linkBlocked: true,
        poolStatus: "CONFIRMED",
      },
      {
        cognitoUsername: "opaque-sara",
        nickname: "Sara",
        poolStatus: "CONFIRMED",
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
      expect(within(panel).getByLabelText("Erneut einladen sabine")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Erneut einladen sabine"));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "shared@example.com",
        nickname: "sabine",
        role: "participant",
      });
    });
    expect(mockedGetIdentityCandidates).not.toHaveBeenCalled();
    expect(
      within(panel).queryByRole("dialog", { name: /Konto verknüpfen oder neue Person/i }),
    ).not.toBeInTheDocument();
  });

  it("setzt Passwort für registrierten Teilnehmer aus der Verwaltung zurück", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice", participantId: "alice",
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
          userId: "alice", participantId: "alice",
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
      userId: "alice", participantId: "alice",
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
        userId: "alice", participantId: "alice",
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
        userId: "alice", participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
      {
        tenantId: "default-tenant",
        userId: "bob", participantId: "bob",
        role: "participant",
        email: "bob@example.com",
        status: "invited",
      },
      {
        tenantId: "default-tenant",
        userId: "carol", participantId: "carol",
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

  it("bricht Sammel-Einladung ab wenn Identity-Wahl nötig ist (#342)", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice",
        participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
      {
        tenantId: "default-tenant",
        userId: "bob",
        participantId: "bob",
        role: "participant",
        email: "bob@example.com",
        status: "no_login",
      },
    ]);
    mockedGetIdentityCandidates.mockImplementation(async (params: { email: string }) => {
      if (params.email === "alice@example.com") {
        return [
          {
            cognitoUsername: "opaque-alice",
            nickname: "alice",
            email: "alice@example.com",
          },
        ];
      }
      return [];
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    fireEvent.click(within(panel).getByLabelText("Auswählen alice"));
    fireEvent.click(within(panel).getByLabelText("Auswählen bob"));
    fireEvent.click(within(panel).getByRole("button", { name: /Ausgewählte einladen/i }));

    await waitFor(() => {
      expect(
        within(panel).getByText(/Sammel-Einladung nicht möglich: für alice/i),
      ).toBeInTheDocument();
    });
    expect(mockedInviteUser).not.toHaveBeenCalled();
  });

  it("legt einen Teilnehmer über + Neu an (Displayname + Login-Name, E-Mail optional)", async () => {
    mockedGetParticipants.mockResolvedValue([]);

    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: false,
    });

    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice", participantId: "alice",
      role: "participant",
      email: "alice@example.com",
      status: "no_login",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));

    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Displayname"), {
      target: { value: "Alice" },
    });
    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("Login-Name") as HTMLInputElement).value).toBe("Alice");
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));
    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(false);
    });
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice@example.com" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        nickname: "Alice",
        displayName: "Alice",
        email: "alice@example.com",
        role: "participant",
        sendEmail: false,
      });
      expect(mockedUpdateParticipant).not.toHaveBeenCalled();
    });
  });

  it("erlaubt Anlegen nur mit Login-Name (Displayname optional)", async () => {
    mockedGetParticipants.mockResolvedValue([]);
    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: false,
      username: "kaja2",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });

    expect(within(dialog).getByText(/Login-Name/i).textContent).toMatch(/\*/);
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "kaja2" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));
    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(false);
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        nickname: "kaja2",
        role: "participant",
        sendEmail: false,
      });
    });
  });

  it("meldet fehlenden Login-Namen, nicht Displayname", async () => {
    mockedGetParticipants.mockResolvedValue([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

    await waitFor(() => {
      expect(within(dialog).getByText(/Bitte einen Login-Namen eingeben/i)).toBeInTheDocument();
    });
    expect(mockedInviteUser).not.toHaveBeenCalled();
  });

  it("schlägt Login-Name aus Displayname mit Umlaut vor (#327)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Displayname"), {
      target: { value: "Björn" },
    });

    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("Login-Name") as HTMLInputElement).value).toBe("Bjoern");
    });
  });

  it("hält E-Mail ohne validierten Nickname deaktiviert", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    const nicknameInput = within(dialog).getByPlaceholderText("Login-Name");
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;

    expect(emailInput.disabled).toBe(true);

    fireEvent.change(nicknameInput, { target: { value: "al" } });
    fireEvent.blur(nicknameInput);

    await waitFor(() => {
      expect(within(dialog).getByText(/Login-Name-Prüfung startet ab 3 Zeichen/i)).toBeInTheDocument();
      expect(emailInput.disabled).toBe(true);
    });
  });

  it("lehnt Nickname mit Umlauten ab und ruft invite nicht auf (#326)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Displayname"), {
      target: { value: "Björn" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "Björn" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));

    await waitFor(() => {
      expect(within(dialog).getByText(/ohne Umlaute/i)).toBeInTheDocument();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^Anlegen$/i }));

    await waitFor(() => {
      expect(within(dialog).getByText(/ohne Umlaute/i)).toBeInTheDocument();
    });
    expect(mockedInviteUser).not.toHaveBeenCalled();
  });

  it("lehnt Nickname mit # ab (#326)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([]);
    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "Max#1" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));

    await waitFor(() => {
      expect(within(dialog).getByText(/kein #/i)).toBeInTheDocument();
    });
    expect(mockedInviteUser).not.toHaveBeenCalled();
  });

  it("ueberschreibt E-Mail bei Reaktivierung standardmaessig nicht", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
        role: undefined,
        email: "alice@example.com",
        status: "active",
      },
    ]);
    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: false,
      emailAttempted: true,
      reactivated: true,
      username: "alice",
    });

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    fireEvent.click(within(panel).getByRole("button", { name: "Neuer Teilnehmer" }));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer anlegen/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));
    await waitFor(() => {
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).value).toBe(
        "alice@example.com",
      );
      expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(true);
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^(Reaktivieren|Anlegen)$/i }));

    await waitFor(() => {
      expect(mockedInviteUser).toHaveBeenCalledWith({
        nickname: "alice",
        email: "alice@example.com",
        role: "participant",
        sendEmail: false,
      });
      expect(mockedUpdateParticipant).not.toHaveBeenCalled();
      expect(
        within(panel).getByText(/Zugang freigeschaltet, aber Info-Mail konnte nicht versendet werden\./i),
      ).toBeInTheDocument();
    });
  });

  it("sendet bei Reaktivierung mit E-Mail-Ueberschreiben die neue E-Mail direkt beim Invite", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
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
      userId: "alice", participantId: "alice",
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
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));
    await waitFor(() => {
      expect(
        within(dialog).getByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer: alice/i),
      ).toBeInTheDocument();
    });
    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /E-Mail aendern/i,
      }),
    );
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });
    expect(
      within(dialog).getByText(/Bei Reaktivierung wird eine Info-Mail an die hinterlegte Adresse gesendet/i),
    ).toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /E-Mail aendern/i,
      }),
    );
    expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).disabled).toBe(true);
    expect((within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement).value).toBe("alice@example.com");

    fireEvent.click(
      within(dialog).getByRole("checkbox", {
        name: /E-Mail aendern/i,
      }),
    );
    fireEvent.change(within(dialog).getByPlaceholderText("E-Mail"), {
      target: { value: "alice.new@example.com" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /^(Reaktivieren|Anlegen)$/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice.new@example.com",
      });
      expect(mockedInviteUser).toHaveBeenCalledWith({
        nickname: "alice",
        email: "alice.new@example.com",
        role: "participant",
        sendEmail: false,
      });
      expect(
        within(panel).getByText(/Zugang freigeschaltet\. Info-Mail wurde gesendet\./i),
      ).toBeInTheDocument();
    });
  });

  it("fokussiert bei Reaktivierung per Tab zuerst die Reaktivierungs-Checkbox", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
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
    const nicknameInput = within(dialog).getByPlaceholderText("Login-Name") as HTMLInputElement;
    fireEvent.change(nicknameInput, { target: { value: "alice" } });
    nicknameInput.focus();
    fireEvent.keyDown(nicknameInput, { key: "Tab" });

    await waitFor(() => {
      expect(document.activeElement).toBe(
        within(dialog).getByRole("checkbox", { name: /E-Mail aendern/i }),
      );
    });
  });

  it("setzt Reaktivierungs-Eingaben beim erneuten Blur ohne Nickname-Änderung nicht zurück", async () => {
    mockedGetParticipants.mockResolvedValue([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
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
    const nicknameInput = within(dialog).getByPlaceholderText("Login-Name") as HTMLInputElement;
    const emailInput = within(dialog).getByPlaceholderText("E-Mail") as HTMLInputElement;

    fireEvent.change(nicknameInput, { target: { value: "alice" } });
    fireEvent.blur(nicknameInput);
    let reactivationCheckbox: HTMLInputElement;
    await waitFor(() => {
      reactivationCheckbox = within(dialog).getByRole("checkbox", {
        name: /E-Mail aendern/i,
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
        userId: "alice", participantId: "alice",
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
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));

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
        name: /E-Mail aendern/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("uebernimmt E-Mail in Create-Form anhand des Nicknames", async () => {
    mockedGetParticipants
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "alice", participantId: "alice",
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

    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "Alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));

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
        userId: "Kai", participantId: "Kai",
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

    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "kai" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/bereits aktiv/i),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Uebernehmen/i })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Anlegen$/i })).toBeDisabled();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: /Uebernehmen/i }));
    expect((within(dialog).getByPlaceholderText("Login-Name") as HTMLInputElement).value).toBe("kai1");
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
    const nicknameInput = within(dialog).getByPlaceholderText("Login-Name") as HTMLInputElement;
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
        userId: "alice", participantId: "alice",
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
    fireEvent.change(within(dialog).getByPlaceholderText("Login-Name"), {
      target: { value: "alice" },
    });
    fireEvent.blur(within(dialog).getByPlaceholderText("Login-Name"));

    await waitFor(() => {
      expect(
        within(dialog).getByText(/Teilnehmer existiert bereits im Studio/i),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByText(/Reaktivierung erkannt fuer bestehenden Teilnehmer/i),
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByRole("checkbox", { name: /E-Mail aendern/i }),
      ).not.toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /^Anlegen$/i })).toBeDisabled();
    });
  });

  it("bearbeitet E-Mail eines Teilnehmers über den Stift", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice", participantId: "alice",
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

  it("zeigt Speichern und Senden bei Displayname-Änderung fuer registrierte Person (#345)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        displayName: "Alice",
        status: "active",
        authUserId: "sub-alice",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      participantId: "alice",
      role: "participant",
      email: "alice@example.com",
      displayName: "Kaja2",
      status: "active",
      displayNameChanged: true,
      displayNameChangedEmailSent: true,
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByLabelText("Bearbeiten alice")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Displayname"), {
      target: { value: "Kaja2" },
    });
    expect(within(dialog).getByRole("button", { name: /^Speichern und Senden$/i })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Speichern und Senden$/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice@example.com",
        displayName: "Kaja2",
        role: "participant",
      });
      expect(
        within(panel).getByText(/Displayname aktualisiert\. Nutzer wurde über die Änderung informiert\./i),
      ).toBeInTheDocument();
    });
  });

  it("zeigt nur Speichern bei Displayname-Änderung ohne Info-Mail (#345)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice",
        participantId: "alice",
        role: "participant",
        displayName: "Alice",
        status: "no_login",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice",
      participantId: "alice",
      role: "participant",
      displayName: "Kaja2",
      status: "no_login",
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByLabelText("Bearbeiten alice")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Bearbeiten alice"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Displayname"), {
      target: { value: "Kaja2" },
    });
    expect(within(dialog).getByRole("button", { name: /^Speichern$/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Speichern und Senden$/i })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Speichern$/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: null,
        displayName: "Kaja2",
        role: "participant",
      });
      expect(within(panel).getByText(/^Displayname aktualisiert\.$/i)).toBeInTheDocument();
    });
  });

  it("Trainer darf E-Mail für eingeladenen Teilnehmer korrigieren", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
        role: "participant",
        email: "wrong@example.com",
        status: "invited",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice", participantId: "alice",
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

  it("sendet Re-Invite mit aktualisiertem Displayname (#345)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "sabine",
        participantId: "sabine",
        role: "participant",
        email: "sabine@example.com",
        displayName: "Sabine",
        status: "invited",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "sabine",
      participantId: "sabine",
      role: "participant",
      email: "sabine@example.com",
      displayName: "Sabine 1",
      status: "invited",
    });
    mockedInviteUser.mockResolvedValueOnce({
      success: true,
      emailSent: true,
    });

    const { container } = render(<AdminPanel canEditRoles />);
    const panel = container.querySelector("div");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByLabelText("Bearbeiten sabine")).toBeInTheDocument();
    });
    fireEvent.click(within(panel).getByLabelText("Bearbeiten sabine"));
    const dialog = within(panel).getByRole("dialog", { name: /Teilnehmer E-Mail bearbeiten/i });
    fireEvent.change(within(dialog).getByPlaceholderText("Displayname"), {
      target: { value: "Sabine 1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Speichern und Senden$/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("sabine", {
        email: "sabine@example.com",
        displayName: "Sabine 1",
        role: "participant",
      });
      expect(mockedInviteUser).toHaveBeenCalledWith({
        email: "sabine@example.com",
        nickname: "sabine",
        displayName: "Sabine 1",
        role: "participant",
      });
    });
  });

  it("Trainer kann Admins/Trainer nicht bearbeiten oder einladen", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "admin1", participantId: "admin1",
        role: "admin",
        email: "admin@example.com",
        status: "invited",
      },
      {
        tenantId: "default-tenant",
        userId: "trainer1", participantId: "trainer1",
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

  it("erzwingt Passwort-Reset bei E-Mail-Wechsel ohne Checkbox (#350)", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "active",
      },
    ]);

    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice", participantId: "alice",
      role: "participant",
      email: "alice.new@example.com",
      status: "active",
      passwordResetTriggered: true,
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
    expect(
      within(dialog).getByText(/Änderungsinfo und Link zum neuen Passwort/i),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Passwort-Reset-Mail senden/i)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /Speichern und Senden/i }));

    await waitFor(() => {
      expect(mockedUpdateParticipant).toHaveBeenCalledWith("alice", {
        email: "alice.new@example.com",
        role: "participant",
      });
      expect(mockedResetParticipantPassword).not.toHaveBeenCalled();
      expect(
        within(panel).getByText(/Info- und Passwort-Reset-Mail wurde an alice.new@example.com gesendet/i),
      ).toBeInTheDocument();
    });
  });

  it("zeigt Rollenfeld im Bearbeiten-Dialog nur fuer Admin und speichert Rolle mit", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);
    mockedUpdateParticipant.mockResolvedValueOnce({
      tenantId: "default-tenant",
      userId: "alice", participantId: "alice",
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

    fireEvent.click(within(dialog).getByLabelText("Rolle bearbeiten"));
    fireEvent.click(within(dialog).getByRole("option", { name: "Kursleitung" }));
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
        userId: "alice", participantId: "alice",
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
          userId: "alice", participantId: "alice",
          role: "participant",
          email: "alice@example.com",
          status: "no_login",
        },
      ])
      .mockResolvedValueOnce([
        {
          tenantId: "default-tenant",
          userId: "bob", participantId: "bob",
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

  it("stellt Landmark und Tabellen-Semantik für die Teilnehmerverwaltung bereit", async () => {
    mockedGetParticipants.mockResolvedValueOnce([
      {
        tenantId: "default-tenant",
        userId: "alice", participantId: "alice",
        role: "participant",
        email: "alice@example.com",
        status: "no_login",
      },
    ]);

    const { container } = render(<AdminPanel />);
    const panel = container.querySelector<HTMLElement>(".admin-panel");
    if (!panel) throw new Error("Panel not found");

    await waitFor(() => {
      expect(within(panel).getByText("alice")).toBeInTheDocument();
    });

    const section = panel.querySelector<HTMLElement>('section[aria-labelledby="participants-heading"]');
    if (!section) throw new Error("Participants section not found");
    const scoped = within(section);
    expect(scoped.getByRole("heading", { level: 3, name: /teilnehmer verwalten/i })).toBeInTheDocument();
    expect(scoped.getByRole("table", { name: /teilnehmerliste/i })).toBeInTheDocument();
    expect(scoped.getByRole("columnheader", { name: /name/i })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Teilnehmer suchen")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Neuer Teilnehmer")).toBeInTheDocument();
    expect(scoped.getByLabelText("Auswählen alice")).toBeInTheDocument();
    expect(scoped.getByLabelText("Einladen alice")).toBeInTheDocument();
  });
});

