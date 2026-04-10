import { useEffect, useMemo, useState } from "react";
import { Mail, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteParticipant,
  getParticipants,
  inviteUser,
  resetParticipantPassword,
  updateParticipant,
  type ParticipantWithStatus,
} from "../api/participants";
import type { UserRole } from "shared/types";

const ROLE_LABELS_DE: Record<UserRole, string> = {
  admin: "Admin",
  instructor: "Kursleitung",
  participant: "Teilnehmerin",
};
const ROLE_OPTIONS: UserRole[] = ["participant", "instructor", "admin"];

function getRoleLabel(role: UserRole | undefined): string {
  if (!role) return "-";
  return ROLE_LABELS_DE[role] ?? role;
}

function getStatusPresentation(status: ParticipantWithStatus["status"]): {
  color: string;
  label: string;
} {
  if (status === "active") {
    return { color: "#16a34a", label: "registriert" };
  }
  if (status === "invited") {
    return { color: "#ca8a04", label: "eingeladen" };
  }
  return { color: "#6b7280", label: "ohne Login" };
}

type AdminPanelProps = {
  canEditRoles?: boolean;
};

export default function AdminPanel({ canEditRoles = false }: AdminPanelProps) {
  const [participants, setParticipants] = useState<ParticipantWithStatus[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [participantsSearch, setParticipantsSearch] = useState("");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
  const [editingRole, setEditingRole] = useState<UserRole>("participant");
  const [editingForcePasswordResetOnEmailChange, setEditingForcePasswordResetOnEmailChange] =
    useState(false);
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createNickname, setCreateNickname] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"participant" | "instructor" | "admin">(
    "participant",
  );
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createEmailAutoFilled, setCreateEmailAutoFilled] = useState(false);
  const [createOverwriteEmailOnReactivate, setCreateOverwriteEmailOnReactivate] = useState(false);
  const [createReactivationUserId, setCreateReactivationUserId] = useState<string | null>(null);

  const [inviteSendingByUserId, setInviteSendingByUserId] = useState<Record<string, boolean>>(
    {},
  );
  const [inviteResultByUserId, setInviteResultByUserId] = useState<Record<string, string>>({});
  const [selectedInviteUserIds, setSelectedInviteUserIds] = useState<Record<string, boolean>>(
    {},
  );
  const [bulkInviteSending, setBulkInviteSending] = useState(false);
  const [bulkInviteResult, setBulkInviteResult] = useState("");
  const [deleteRunningByUserId, setDeleteRunningByUserId] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<ParticipantWithStatus | null>(null);

  const refreshParticipants = async () => {
    setParticipantsLoading(true);
    setParticipantsError("");
    try {
      const searchValue = participantsSearch.trim();
      const list = await getParticipants(
        searchValue
          ? {
              search: searchValue,
            }
          : undefined,
      );
      const safeList = Array.isArray(list) ? list : [];
      setParticipants(safeList);
    } catch (err) {
      console.error("Failed to load participants", err);
      setParticipantsError("Konnte Teilnehmer nicht laden.");
    } finally {
      setParticipantsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadParticipants() {
      setParticipantsLoading(true);
      setParticipantsError("");
      try {
        const searchValue = participantsSearch.trim();
        const list = await getParticipants(
          searchValue
            ? {
                search: searchValue,
              }
            : undefined,
        );
        if (cancelled) return;
        const safeList = Array.isArray(list) ? list : [];
        setParticipants(safeList);
      } catch (err) {
        console.error("Failed to load participants", err);
        if (!cancelled) {
          setParticipantsError("Konnte Teilnehmer nicht laden.");
        }
      }

      if (!cancelled) {
        setParticipantsLoading(false);
      }
    }

    loadParticipants();
    return () => {
      cancelled = true;
    };
  }, [participantsSearch]);

  const safeParticipants = useMemo(
    () => (Array.isArray(participants) ? participants : []),
    [participants],
  );
  const getKnownEmailByNickname = (nicknameValue: string): string => {
    const normalized = nicknameValue.trim().toLowerCase();
    if (!normalized) return "";
    const match = safeParticipants.find(
      (p) => (p.userId || "").trim().toLowerCase() === normalized && !!p.email,
    );
    return match?.email ?? "";
  };
  const getKnownParticipantByNickname = (nicknameValue: string): ParticipantWithStatus | undefined => {
    const normalized = nicknameValue.trim().toLowerCase();
    if (!normalized) return undefined;
    return safeParticipants.find((p) => (p.userId || "").trim().toLowerCase() === normalized);
  };
  const createMatch = getKnownParticipantByNickname(createNickname);
  const createActiveConflict = !!createMatch && createMatch.status === "active";
  const createSuggestedNickname = useMemo(() => {
    if (!createActiveConflict) return "";
    const base = createNickname.trim();
    if (!base) return "";
    const used = new Set(safeParticipants.map((p) => (p.userId || "").trim().toLowerCase()));
    let idx = 1;
    let candidate = `${base}${idx}`;
    while (used.has(candidate.toLowerCase()) && idx < 1000) {
      idx += 1;
      candidate = `${base}${idx}`;
    }
    return candidate;
  }, [createActiveConflict, createNickname, safeParticipants]);
  const prefillCreateEmailByNickname = async (nicknameValue: string) => {
    if (createEmail.trim()) return;
    const normalized = nicknameValue.trim().toLowerCase();
    if (!normalized) {
      setCreateReactivationUserId(null);
      return;
    }

    const localMatch = getKnownParticipantByNickname(normalized);
    setCreateReactivationUserId(localMatch && localMatch.status !== "active" ? localMatch.userId : null);
    const localEmail = localMatch?.email ?? "";
    if (localEmail) {
      setCreateEmail(localEmail);
      setCreateEmailAutoFilled(true);
      return;
    }

    try {
      const remoteList = await getParticipants({ search: normalized, includeOrphaned: true });
      const remoteMatch = remoteList.find(
        (p) => (p.userId || "").trim().toLowerCase() === normalized,
      );
      setCreateReactivationUserId(
        remoteMatch && (!remoteMatch.role || remoteMatch.status !== "active")
          ? remoteMatch.userId
          : null,
      );
      if (remoteMatch?.email) {
        setCreateEmail((prev) => (prev.trim() ? prev : remoteMatch.email ?? ""));
        setCreateEmailAutoFilled(true);
      } else {
        setCreateEmailAutoFilled(false);
      }
    } catch {
      setCreateEmailAutoFilled(false);
    }
  };
  const isInviteEligible = (p: ParticipantWithStatus) => !!p.email && p.status !== "active";
  const inviteEligibleUserIds = useMemo(
    () => safeParticipants.filter(isInviteEligible).map((p) => p.userId),
    [safeParticipants],
  );
  const selectedEligibleUserIds = inviteEligibleUserIds.filter((id) => !!selectedInviteUserIds[id]);
  const allEligibleSelected =
    inviteEligibleUserIds.length > 0 && selectedEligibleUserIds.length === inviteEligibleUserIds.length;

  useEffect(() => {
    // Selections sauber halten (z.B. nach Search/Refresh).
    setSelectedInviteUserIds((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of inviteEligibleUserIds) {
        if (prev[id]) next[id] = true;
      }
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) {
        return prev;
      }
      return next;
    });
  }, [inviteEligibleUserIds]);

  const startEditEmail = (p: ParticipantWithStatus) => {
    setEditingUserId(p.userId);
    setEditingEmail(p.email ?? "");
    setEditingRole(p.role ?? "participant");
    setEditingForcePasswordResetOnEmailChange(false);
    setEditingError("");
    setEditingSaving(false);
  };
  const canEditEmailForParticipant = (p: ParticipantWithStatus): boolean =>
    canEditRoles || (p.status !== "active" && !p.authUserId);

  const saveEditEmail = async () => {
    if (!editingUserId) return;
    setEditingSaving(true);
    setEditingError("");
    try {
      const trimmed = editingEmail.trim();
      const isValidEmailOrEmpty =
        trimmed.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      if (!isValidEmailOrEmpty) {
        setEditingError("Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen).");
        return;
      }
      const nextEmail = trimmed.length > 0 ? trimmed : null;
      const original = safeParticipants.find((p) => p.userId === editingUserId);
      const originalEmail = (original?.email ?? "").trim();
      const nextEmailText = (nextEmail ?? "").trim();
      const emailChanged = originalEmail.toLowerCase() !== nextEmailText.toLowerCase();
      if (!canEditRoles && original?.status === "active" && emailChanged) {
        setEditingError("E-Mail von registrierten Teilnehmern kann nur von Admins geändert werden.");
        return;
      }
      const shouldForcePasswordReset =
        original?.status === "active" &&
        editingForcePasswordResetOnEmailChange &&
        nextEmailText.length > 0;

      await updateParticipant(
        editingUserId,
        canEditRoles
          ? {
              email: nextEmail,
              role: editingRole,
            }
          : {
              email: nextEmail,
            },
      );

      // Lokales Update reicht für diesen Zwischen-Use-Case.
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === editingUserId
            ? {
                ...p,
                email: nextEmail ?? undefined,
                role: canEditRoles ? editingRole : p.role,
              }
            : p,
        ),
      );

      setEditingUserId(null);
      const roleChanged = canEditRoles && original?.role !== editingRole;
      if (shouldForcePasswordReset) {
        setBulkInviteResult("Änderungen gespeichert. Passwort-Reset wird gesendet.");
      } else if (emailChanged && original?.status === "active") {
        setBulkInviteResult(
          "E-Mail aktualisiert. Info-Mail wurde an die neue Adresse gesendet.",
        );
      } else if (roleChanged && original?.status === "active") {
        setBulkInviteResult("Rolle aktualisiert. Nutzer wurde über die Änderung informiert.");
      } else if (roleChanged) {
        setBulkInviteResult("Rolle aktualisiert.");
      }
      if (canEditRoles && original?.status === "active" && nextEmailText.length > 0) {
        const effectiveParticipant: ParticipantWithStatus = {
          ...original,
          email: nextEmailText,
          role: canEditRoles ? editingRole : original.role,
        };
        if (editingForcePasswordResetOnEmailChange) {
          const resetResult = await sendPasswordResetForParticipant(effectiveParticipant, {
            refreshAfter: false,
          });
          if (resetResult?.ok && resetResult.emailSent) {
            setBulkInviteResult("Änderungen gespeichert. Passwort-Reset-Mail wurde gesendet.");
          } else if (resetResult?.ok && !resetResult.emailSent) {
            setBulkInviteResult(
              "Änderungen gespeichert. Passwort-Reset angestoßen, aber E-Mail konnte nicht versendet werden.",
            );
          } else {
            setBulkInviteResult(
              "Änderungen gespeichert, aber Passwort-Reset konnte nicht gestartet werden.",
            );
          }
        }
      }
    } catch (err) {
      console.error("Failed to update participant email", err);
      setEditingError("E-Mail konnte nicht gespeichert werden.");
    } finally {
      setEditingSaving(false);
    }
  };

  const editingOriginal = editingUserId
    ? safeParticipants.find((p) => p.userId === editingUserId)
    : undefined;
  const editingEmailTrimmed = editingEmail.trim();
  const editingOriginalEmail = (editingOriginal?.email ?? "").trim();
  const editingEmailChanged = editingEmailTrimmed.toLowerCase() !== editingOriginalEmail.toLowerCase();
  const editingRoleChanged = !!(canEditRoles && editingOriginal && editingOriginal.role !== editingRole);
  const editingCanSendReset = !!(canEditRoles && editingOriginal?.status === "active");
  const editingHasChanges =
    editingEmailChanged || editingRoleChanged || (editingCanSendReset && editingForcePasswordResetOnEmailChange);

  const openCreate = () => {
    setCreateOpen(true);
    setCreateNickname("");
    setCreateEmail("");
    setCreateEmailAutoFilled(false);
    setCreateRole("participant");
    setCreateError("");
    setCreateSaving(false);
    setCreateOverwriteEmailOnReactivate(false);
    setCreateReactivationUserId(null);
  };

  const saveCreate = async () => {
    const nicknameValue = createNickname.trim();
    const emailValue = createEmail.trim();
    if (!nicknameValue) {
      setCreateError("Bitte einen Nickname eingeben.");
      return;
    }
    const isValidEmailOrEmpty =
      emailValue.length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
    if (!isValidEmailOrEmpty) {
      setCreateError("Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen).");
      return;
    }
    if (createActiveConflict) {
      setCreateError(
        createSuggestedNickname
          ? `Dieser Spitzname ist im Tenant bereits aktiv. Vorschlag: ${createSuggestedNickname}`
          : "Dieser Spitzname ist im Tenant bereits aktiv.",
      );
      return;
    }

    setCreateSaving(true);
    setCreateError("");
    try {
      const shouldPreUpdateEmailForReactivation =
        !!createReactivationUserId && createOverwriteEmailOnReactivate && emailValue.length > 0;

      if (shouldPreUpdateEmailForReactivation) {
        await updateParticipant(createReactivationUserId, { email: emailValue });
      }

      // #67: Teilnehmer anlegen ohne Einladung (kein Cognito/SES).
      // Wir legen zunächst ohne E-Mail an, speichern E-Mail (falls vorhanden) danach separat im Profil.
      const result = await inviteUser({ nickname: nicknameValue, role: createRole });
      if (result.error === "Nickname already exists") {
        setCreateError("Dieser Spitzname ist bereits vergeben.");
        return;
      }
      if (!result.success) {
        setCreateError("Teilnehmer konnte nicht angelegt werden.");
        return;
      }

      if (
        emailValue.length > 0 &&
        (!result.reactivated || createOverwriteEmailOnReactivate) &&
        !shouldPreUpdateEmailForReactivation
      ) {
        await updateParticipant(result.username ?? nicknameValue.toLowerCase(), { email: emailValue });
      } else if (emailValue.length > 0 && result.reactivated && !createOverwriteEmailOnReactivate) {
        setBulkInviteResult(
          "Reaktivierung: bestehende E-Mail blieb unverändert (kein Überschreiben).",
        );
      }

      const effectiveEmail = emailValue || createEmail;
      if (result.reactivated) {
        const reactivationNotificationTarget =
          createOverwriteEmailOnReactivate && emailValue
            ? emailValue
            : "bestehende Profil-E-Mail";
        if (result.emailSent) {
          setBulkInviteResult(
            `Reaktivierung: Info-Mail gesendet an ${reactivationNotificationTarget}.`,
          );
        } else {
          setBulkInviteResult("Reaktivierung erfolgt, aber E-Mail konnte nicht versendet werden.");
        }
      } else if (result.emailSent) {
        setBulkInviteResult(
          effectiveEmail
            ? `Einladung gesendet an ${effectiveEmail}.`
            : "Einladung wurde gesendet.",
        );
      } else if (effectiveEmail) {
        setBulkInviteResult("Einladung angestoßen, aber E-Mail konnte nicht versendet werden.");
      }

      setCreateOpen(false);
      await refreshParticipants();
    } catch (err) {
      console.error("Failed to create participant", err);
      setCreateError("Teilnehmer konnte nicht angelegt werden.");
    } finally {
      setCreateSaving(false);
    }
  };

  const sendInviteForParticipant = async (
    p: ParticipantWithStatus,
    options?: { refreshAfter?: boolean },
  ) => {
    if (!p.email) return;
    if (p.status === "active" && !canEditRoles) return;

    const refreshAfter = options?.refreshAfter ?? true;
    const userId = p.userId;
    const effectiveRole: UserRole = p.role ?? "participant";

    // Avoid stale global status text from previous create/bulk actions.
    setBulkInviteResult("");
    setInviteSendingByUserId((prev) => ({ ...prev, [userId]: true }));
    setInviteResultByUserId((prev) => ({ ...prev, [userId]: "" }));
    try {
      const result = await inviteUser({
        email: p.email,
        nickname: userId,
        role: effectiveRole,
      });

      if (result.error) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: `Fehler beim Einladen: ${result.error}`,
        }));
        return { ok: false as const };
      }

      if (result.emailSent) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]:
            result.reactivated
              ? `Zugang reaktiviert. Info-Mail gesendet an ${p.email}.`
              : p.status === "active"
                ? `Einladungslink zur Passwort-Recovery gesendet an ${p.email}.`
                : `Einladung gesendet an ${p.email}.`,
        }));
      } else {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: "Einladung angestoßen, aber E-Mail konnte nicht versendet werden.",
        }));
      }

      if (refreshAfter) {
        try {
          await refreshParticipants();
        } catch (refreshErr) {
          console.warn("Invite succeeded but participant refresh failed", refreshErr);
          setInviteResultByUserId((prev) => ({
            ...prev,
            [userId]:
              "Einladung gesendet, aber die Liste konnte nicht aktualisiert werden. Bitte Seite neu laden.",
          }));
          return { ok: true as const };
        }
      }
      return { ok: true as const };
    } catch (err) {
      console.error("Failed to send invite", err);
      setInviteResultByUserId((prev) => ({ ...prev, [userId]: "Fehler beim Einladen." }));
      return { ok: false as const };
    } finally {
      setInviteSendingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const sendPasswordResetForParticipant = async (
    p: ParticipantWithStatus,
    options?: { refreshAfter?: boolean },
  ): Promise<{ ok: boolean; emailSent: boolean } | undefined> => {
    if (!p.email) return undefined;
    if (p.status !== "active") return undefined;

    const refreshAfter = options?.refreshAfter ?? true;
    const userId = p.userId;
    // Avoid stale global status text from previous create/bulk actions.
    setBulkInviteResult("");
    setInviteSendingByUserId((prev) => ({ ...prev, [userId]: true }));
    setInviteResultByUserId((prev) => ({ ...prev, [userId]: "" }));
    try {
      const result = await resetParticipantPassword(userId);
      if (result.emailSent) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: `Passwort-Reset-Mail gesendet an ${p.email}.`,
        }));
      } else {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: "Passwort-Reset angestoßen, aber E-Mail konnte nicht versendet werden.",
        }));
      }
      if (refreshAfter) {
        await refreshParticipants();
      }
      return { ok: true, emailSent: !!result.emailSent };
    } catch (err) {
      console.error("Failed to reset password", err);
      setInviteResultByUserId((prev) => ({ ...prev, [userId]: "Fehler beim Passwort-Reset." }));
      return { ok: false, emailSent: false };
    } finally {
      setInviteSendingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const toggleSelectedInviteUserId = (userId: string, checked: boolean) => {
    setSelectedInviteUserIds((prev) => ({ ...prev, [userId]: checked }));
  };

  const toggleSelectAllEligible = (checked: boolean) => {
    if (!checked) {
      setSelectedInviteUserIds({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const id of inviteEligibleUserIds) next[id] = true;
    setSelectedInviteUserIds(next);
  };

  const sendBulkInvites = async () => {
    if (bulkInviteSending) return;
    if (selectedEligibleUserIds.length === 0) return;

    setBulkInviteSending(true);
    setBulkInviteResult("");

    let ok = 0;
    let failed = 0;

    try {
      const byId = new Map(safeParticipants.map((p) => [p.userId, p]));
      for (const userId of selectedEligibleUserIds) {
        const p = byId.get(userId);
        if (!p || !isInviteEligible(p)) continue;

        // Pro User UI-Feedback beibehalten, aber Refresh erst am Ende.
        const res = await sendInviteForParticipant(p, { refreshAfter: false });
        if (res?.ok) ok += 1;
        else failed += 1;
      }
    } finally {
      await refreshParticipants();
      setBulkInviteSending(false);
      setBulkInviteResult(
        failed > 0 ? `${ok} Einladung(en) gesendet, ${failed} fehlgeschlagen.` : `${ok} Einladung(en) gesendet.`,
      );
    }
  };

  const confirmDeleteParticipant = async () => {
    if (!deleteTarget) return;
    const userId = deleteTarget.userId;
    setDeleteRunningByUserId((prev) => ({ ...prev, [userId]: true }));
    setBulkInviteResult("");

    try {
      const result = await deleteParticipant(userId);
      setBulkInviteResult(
        result.profileDeleted
          ? `Teilnehmer "${userId}" entfernt (inkl. Profil-Cleanup).`
          : `Teilnehmer "${userId}" aus diesem Studio entfernt.`,
      );
      if (result.notificationEmail) {
        setBulkInviteResult((prev) =>
          `${prev} ${
            result.notificationEmailSent
              ? `Info-Mail gesendet an ${result.notificationEmail}.`
              : `Info-Mail an ${result.notificationEmail} konnte nicht versendet werden.`
          }`,
        );
      }
      setDeleteTarget(null);
      await refreshParticipants();
    } catch (err) {
      console.error("Failed to delete participant", err);
      setBulkInviteResult(`Teilnehmer "${userId}" konnte nicht gelöscht werden.`);
    } finally {
      setDeleteRunningByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };
  
  return (
    <div className="admin-panel">
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Teilnehmer verwalten</h3>
          <button
            type="button"
            title="Neuer Teilnehmer"
            aria-label="Neuer Teilnehmer"
            onClick={openCreate}
            disabled={createSaving || editingSaving}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <Plus size={16} aria-hidden="true" />
              Neu
            </span>
          </button>
        </div>
        <div style={{ marginBottom: "0.5rem" }}>
          <input
            type="search"
            placeholder="Suche (Nickname oder E-Mail)"
            aria-label="Teilnehmer suchen"
            value={participantsSearch}
            onChange={(e) => setParticipantsSearch(e.target.value)}
            style={{ width: "100%", maxWidth: 360 }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            aria-label="Ausgewählte einladen"
            title={
              selectedEligibleUserIds.length === 0
                ? "Wähle Teilnehmer mit E-Mail aus"
                : "Einladung an ausgewählte Teilnehmer senden/erneut senden"
            }
            disabled={
              selectedEligibleUserIds.length === 0 ||
              bulkInviteSending ||
              participantsLoading ||
              editingSaving ||
              createSaving
            }
            onClick={sendBulkInvites}
          >
            {bulkInviteSending ? "Sende..." : `Ausgewählte einladen (${selectedEligibleUserIds.length})`}
          </button>
          {bulkInviteResult && (
            <span style={{ color: "#374151", fontSize: 12 }} role="status" aria-live="polite">
              {bulkInviteResult}
            </span>
          )}
        </div>

        {participantsError && (
          <p style={{ margin: "0.5rem 0", color: "red", whiteSpace: "pre-line" }} role="alert">
            {participantsError}
          </p>
        )}

        {participantsLoading ? (
          <p>Teilnehmer werden geladen...</p>
        ) : safeParticipants.length === 0 ? (
          <p>Keine Teilnehmer gefunden.</p>
        ) : (
          <div className="participants-table">
            <div className="participants-table-scroll">
              <div className="participants-table-inner">
              <div
              style={{
                display: "grid",
                gridTemplateColumns: "36px 130px 110px 150px minmax(220px, 1fr) 220px",
                gap: "0.5rem",
                alignItems: "center",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
              <span style={{ display: "inline-flex", justifyContent: "center" }}>
                <input
                  type="checkbox"
                  aria-label="Alle (einladbar) auswählen"
                  checked={allEligibleSelected}
                  disabled={inviteEligibleUserIds.length === 0 || participantsLoading || bulkInviteSending}
                  onChange={(e) => toggleSelectAllEligible(e.target.checked)}
                />
              </span>
              <span>Nickname</span>
              <span>Rolle</span>
              <span>Status</span>
                  <span style={{ whiteSpace: "nowrap" }}>E-Mail</span>
                  <span style={{ whiteSpace: "nowrap" }}>Aktion</span>
              </div>
              {safeParticipants.map((p) => (
                <div
                  key={p.userId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 130px 110px 150px minmax(220px, 1fr) 220px",
                    gap: "0.5rem",
                    alignItems: "center",
                    padding: "0.25rem 0",
                  }}
                >
                  <span style={{ display: "inline-flex", justifyContent: "center" }}>
                    <input
                      type="checkbox"
                      aria-label={`Auswählen ${p.userId}`}
                      checked={!!selectedInviteUserIds[p.userId]}
                      disabled={!isInviteEligible(p) || participantsLoading || bulkInviteSending}
                      title={
                        !p.email
                          ? "E-Mail fehlt"
                          : p.status === "active"
                            ? "Bereits registriert (kein Sammelversand)"
                            : "Auswählen"
                      }
                      onChange={(e) => toggleSelectedInviteUserId(p.userId, e.target.checked)}
                    />
                  </span>
                  <span style={{ fontWeight: 600 }}>{p.userId}</span>
                  <span style={{ color: "#374151" }}>{getRoleLabel(p.role)}</span>
                  <span
                    title={getStatusPresentation(p.status).label}
                    aria-label={`Status: ${getStatusPresentation(p.status).label}`}
                    style={{ display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: getStatusPresentation(p.status).color,
                      }}
                    />
                    <span style={{ fontSize: 12, color: "#374151" }}>
                      {getStatusPresentation(p.status).label}
                    </span>
                  </span>
                  <span
                    style={{
                      color: p.email ? "#111827" : "#9ca3af",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                    title={p.email ?? "-"}
                  >
                    {p.email ?? "-"}
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.25rem",
                      justifyContent: "flex-end",
                      flexWrap: "nowrap",
                      alignItems: "center",
                      position: "relative",
                      width: "100%",
                      justifySelf: "end",
                    }}
                  >
                    {!(p.status === "active" && canEditRoles) && (
                      <button
                        type="button"
                        title={
                          !p.email
                            ? "E-Mail fehlt"
                            : p.status === "active" && !canEditRoles
                              ? "Bereits registriert"
                              : p.status === "invited"
                                ? "Einladung erneut senden"
                                : "Einladung senden"
                        }
                        aria-label={
                          p.status === "invited"
                            ? `Erneut einladen ${p.userId}`
                            : `Einladen ${p.userId}`
                        }
                        disabled={
                          !p.email ||
                          (p.status === "active" && !canEditRoles) ||
                          !!inviteSendingByUserId[p.userId] ||
                          participantsLoading ||
                          editingSaving ||
                          createSaving
                        }
                        onClick={() => sendInviteForParticipant(p)}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Mail size={14} aria-hidden="true" />
                          {inviteSendingByUserId[p.userId] ? "..." : null}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      title={
                        !canEditEmailForParticipant(p)
                          ? "E-Mail von registrierten Teilnehmern nur für Admin"
                          : `Bearbeiten ${p.userId}`
                      }
                      aria-label={`Bearbeiten ${p.userId}`}
                      disabled={
                        participantsLoading ||
                        editingSaving ||
                        !!deleteRunningByUserId[p.userId] ||
                        !canEditEmailForParticipant(p)
                      }
                      onClick={() => startEditEmail(p)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    {canEditRoles && (
                      <button
                        type="button"
                        title={`Löschen ${p.userId}`}
                        aria-label={`Löschen ${p.userId}`}
                        disabled={
                          participantsLoading ||
                          editingSaving ||
                          createSaving ||
                          bulkInviteSending ||
                          !!inviteSendingByUserId[p.userId] ||
                          !!deleteRunningByUserId[p.userId]
                        }
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  {inviteResultByUserId[p.userId] && (
                    <div style={{ gridColumn: "1 / -1", color: "#374151", fontSize: 12 }} role="status" aria-live="polite">
                      {inviteResultByUserId[p.userId]}
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {editingUserId && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Teilnehmer E-Mail bearbeiten">
          <div className="modal modal-compact">
            <h4>Teilnehmer bearbeiten</h4>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              User: <strong>{editingUserId}</strong>
            </p>

            <div className="dialog-stack">
              <input
                type="email"
                aria-label="E-Mail"
                placeholder="E-Mail"
                value={editingEmail}
                onChange={(e) => setEditingEmail(e.target.value)}
                disabled={editingSaving}
                className="dialog-field"
              />
              {canEditRoles && (
                <select
                  aria-label="Rolle bearbeiten"
                  value={editingRole}
                  onChange={(e) => setEditingRole(e.target.value as UserRole)}
                  disabled={editingSaving}
                  className="dialog-field"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS_DE[role]}
                    </option>
                  ))}
                </select>
              )}
              {canEditRoles && editingOriginal?.status === "active" && (
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={editingForcePasswordResetOnEmailChange}
                    onChange={(e) => setEditingForcePasswordResetOnEmailChange(e.target.checked)}
                    disabled={editingSaving}
                  />
                  Passwort-Reset-Mail senden
                </label>
              )}
              {editingError && <p style={{ color: "crimson", margin: 0 }}>{editingError}</p>}
            </div>

            <div className="modal-actions dialog-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => setEditingUserId(null)}
                disabled={editingSaving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveEditEmail}
                disabled={editingSaving || !editingHasChanges}
              >
                {editingSaving
                  ? "Speichere..."
                  : canEditRoles && editingOriginal?.status === "active"
                    ? "Speichern und Senden"
                    : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Teilnehmer anlegen">
          <div className="modal modal-compact">
            <h4>Teilnehmer anlegen</h4>

            <div className="dialog-stack">
              <input
                type="text"
                aria-label="Spitzname"
                placeholder="Spitzname"
                value={createNickname}
                onChange={(e) => {
                  const nextNickname = e.target.value;
                  setCreateNickname(nextNickname);
                  const localMatch = getKnownParticipantByNickname(nextNickname);
                  setCreateReactivationUserId(
                    localMatch && localMatch.status !== "active" ? localMatch.userId : null,
                  );
                  if (localMatch?.status === "active") {
                    setCreateOverwriteEmailOnReactivate(false);
                  }
                  if (createEmail.trim()) return;
                  const suggestedEmail = getKnownEmailByNickname(nextNickname);
                  if (suggestedEmail) setCreateEmail(suggestedEmail);
                  setCreateEmailAutoFilled(!!suggestedEmail);
                }}
                onBlur={() => {
                  void prefillCreateEmailByNickname(createNickname);
                }}
                disabled={createSaving}
                className="dialog-field"
              />

              <input
                type="email"
                aria-label="E-Mail"
                placeholder="E-Mail"
                value={createEmail}
                onChange={(e) => {
                  setCreateEmail(e.target.value);
                  setCreateEmailAutoFilled(false);
                }}
                disabled={createSaving}
                className="dialog-field"
              />
              {createEmailAutoFilled && (
                <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: 12 }}>
                  E-Mail aus bestehendem Profil uebernommen.
                </p>
              )}
              <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: 12 }}>
                Bei Reaktivierung bleibt die bestehende E-Mail standardmaessig unveraendert.
              </p>
              {createReactivationUserId && (
                <>
                  <p style={{ margin: "0.25rem 0 0", color: "#92400e", fontSize: 12 }}>
                    Reaktivierung erkannt fuer bestehenden Teilnehmer: {createReactivationUserId}
                  </p>
                  <p style={{ margin: "0.15rem 0 0", color: "#92400e", fontSize: 12 }}>
                    Spitzname existiert bereits (case-insensitiv). Es wird kein neuer User angelegt.
                  </p>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={createOverwriteEmailOnReactivate}
                      onChange={(e) => setCreateOverwriteEmailOnReactivate(e.target.checked)}
                      disabled={createSaving}
                    />
                    Eingegebene E-Mail fuer Reaktivierung uebernehmen
                  </label>
                  <p style={{ margin: "0.1rem 0 0", color: "#4b5563", fontSize: 12 }}>
                    {createOverwriteEmailOnReactivate && createEmail.trim()
                      ? `Mail geht an: ${createEmail.trim()}`
                      : "Mail geht an: bestehende Profil-E-Mail"}
                  </p>
                </>
              )}
              {createActiveConflict && (
                <div style={{ margin: "0.25rem 0 0", color: "#991b1b", fontSize: 12 }}>
                  <p style={{ margin: 0 }}>
                    Dieser Spitzname ist im aktuellen Tenant bereits aktiv.
                  </p>
                  {createSuggestedNickname && (
                    <p style={{ margin: "0.15rem 0 0" }}>
                      Vorschlag fuer neuen Nickname: <strong>{createSuggestedNickname}</strong>
                      {" "}
                      <button
                        type="button"
                        onClick={() => setCreateNickname(createSuggestedNickname)}
                        disabled={createSaving}
                        style={{ marginLeft: 6 }}
                      >
                        Uebernehmen
                      </button>
                    </p>
                  )}
                </div>
              )}

              <select
                aria-label="Rolle"
                value={createRole}
                onChange={(e) =>
                  setCreateRole(e.target.value as "participant" | "instructor" | "admin")
                }
                disabled={createSaving}
                className="dialog-field"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS_DE[role]}
                  </option>
                ))}
              </select>

              {createError && <p style={{ color: "crimson", margin: 0 }}>{createError}</p>}
            </div>

            <div className="modal-actions dialog-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => setCreateOpen(false)}
                disabled={createSaving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveCreate}
                disabled={createSaving || createActiveConflict}
              >
                {createSaving
                  ? createReactivationUserId
                    ? "Reaktiviere..."
                    : "Lege an..."
                  : createReactivationUserId
                    ? "Reaktivieren"
                    : "Anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Teilnehmer löschen">
          <div className="modal modal-compact">
            <h4>Teilnehmer löschen</h4>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Teilnehmer <strong>{deleteTarget.userId}</strong> aus diesem Studio entfernen?
            </p>
            <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
              Mit Login bleibt das globale Profil erhalten. Ohne Login kann zusätzlich das Profil
              gelöscht werden, falls keine weitere Studio-Zuordnung existiert.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => setDeleteTarget(null)}
                disabled={!!deleteRunningByUserId[deleteTarget.userId]}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={confirmDeleteParticipant}
                disabled={!!deleteRunningByUserId[deleteTarget.userId]}
              >
                {deleteRunningByUserId[deleteTarget.userId] ? "Lösche..." : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}