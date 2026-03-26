import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteParticipant,
  getParticipants,
  inviteUser,
  updateParticipant,
  type ParticipantWithStatus,
} from "../api/participants";
import type { UserRole } from "shared/types";

const ROLE_LABELS_DE: Record<UserRole, string> = {
  admin: "Admin",
  instructor: "Kursleitung",
  participant: "Teilnehmerin",
};

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

export default function AdminPanel() {
  const [participants, setParticipants] = useState<ParticipantWithStatus[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [participantsSearch, setParticipantsSearch] = useState("");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
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
      const remoteList = await getParticipants({ search: normalized });
      const remoteMatch = remoteList.find(
        (p) => (p.userId || "").trim().toLowerCase() === normalized,
      );
      setCreateReactivationUserId(
        remoteMatch && remoteMatch.status !== "active" ? remoteMatch.userId : null,
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
    setEditingError("");
    setEditingSaving(false);
  };

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

      await updateParticipant(editingUserId, { email: nextEmail });

      // Lokales Update reicht für diesen Zwischen-Use-Case.
      setParticipants((prev) =>
        prev.map((p) =>
          p.userId === editingUserId
            ? {
                ...p,
                email: nextEmail ?? undefined,
              }
            : p,
        ),
      );

      setEditingUserId(null);
    } catch (err) {
      console.error("Failed to update participant email", err);
      setEditingError("E-Mail konnte nicht gespeichert werden.");
    } finally {
      setEditingSaving(false);
    }
  };

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

      if (emailValue.length > 0 && (!result.reactivated || createOverwriteEmailOnReactivate)) {
        await updateParticipant(result.username ?? nicknameValue.toLowerCase(), { email: emailValue });
      } else if (emailValue.length > 0 && result.reactivated && !createOverwriteEmailOnReactivate) {
        setBulkInviteResult(
          "Reaktivierung: bestehende E-Mail blieb unverändert (kein Überschreiben).",
        );
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
    if (p.status === "active") return;

    const refreshAfter = options?.refreshAfter ?? true;
    const userId = p.userId;
    const effectiveRole: UserRole = p.role ?? "participant";

    setInviteSendingByUserId((prev) => ({ ...prev, [userId]: true }));
    setInviteResultByUserId((prev) => ({ ...prev, [userId]: "" }));
    try {
      const result = await inviteUser({
        email: p.email,
        nickname: userId,
        role: effectiveRole,
      });

      if (result.error) {
        setInviteResultByUserId((prev) => ({ ...prev, [userId]: "Fehler beim Einladen." }));
        return { ok: false as const };
      }

      if (result.emailSent) {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: result.reactivated
            ? `Zugang reaktiviert. Info-Mail gesendet an ${p.email}.`
            : `Einladung gesendet an ${p.email}.`,
        }));
      } else {
        setInviteResultByUserId((prev) => ({
          ...prev,
          [userId]: "Einladung angestoßen, aber E-Mail konnte nicht versendet werden.",
        }));
      }

      if (refreshAfter) {
        await refreshParticipants();
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

  const deleteParticipantFromTenant = async (p: ParticipantWithStatus) => {
    const userId = p.userId;
    const confirmed = window.confirm(
      `Teilnehmer "${userId}" aus diesem Studio entfernen?\n\n` +
        `Hinweis: Mit Login bleibt das globale Profil erhalten. Ohne Login kann zusätzlich das Profil gelöscht werden, falls keine weitere Studio-Zuordnung existiert.`,
    );
    if (!confirmed) return;

    setDeleteRunningByUserId((prev) => ({ ...prev, [userId]: true }));
    setBulkInviteResult("");

    try {
      const result = await deleteParticipant(userId);
      setBulkInviteResult(
        result.profileDeleted
          ? `Teilnehmer "${userId}" entfernt (inkl. Profil-Cleanup).`
          : `Teilnehmer "${userId}" aus diesem Studio entfernt.`,
      );
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
          {bulkInviteResult && <span style={{ color: "#374151", fontSize: 12 }}>{bulkInviteResult}</span>}
        </div>

        {participantsError && (
          <p style={{ margin: "0.5rem 0", color: "red", whiteSpace: "pre-line" }}>
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
                gridTemplateColumns: "36px 130px 110px 110px 1fr 160px",
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
              <span>E-Mail</span>
              <span>Aktion</span>
              </div>
              {safeParticipants.map((p) => (
                <div
                  key={p.userId}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 130px 110px 110px 1fr 160px",
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
                            ? "Bereits registriert"
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
                    style={{ display: "inline-flex", justifyContent: "center" }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: getStatusPresentation(p.status).color,
                      }}
                    />
                  </span>
                  <span style={{ color: p.email ? "#111827" : "#9ca3af" }}>{p.email ?? "-"}</span>
                  <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      title={
                        !p.email
                          ? "E-Mail fehlt"
                          : p.status === "active"
                            ? "Bereits registriert"
                            : p.status === "invited"
                              ? "Einladung erneut senden"
                              : "Einladung senden"
                      }
                      aria-label={`${p.status === "invited" ? "Erneut einladen" : "Einladen"} ${p.userId}`}
                      disabled={
                        !p.email ||
                        p.status === "active" ||
                        !!inviteSendingByUserId[p.userId] ||
                        participantsLoading ||
                        editingSaving ||
                        createSaving
                      }
                      onClick={() => sendInviteForParticipant(p)}
                    >
                      {inviteSendingByUserId[p.userId]
                        ? "..."
                        : p.status === "invited"
                          ? "Erneut"
                          : "Einladen"}
                    </button>
                    <button
                      type="button"
                      title={`Bearbeiten ${p.userId}`}
                      aria-label={`Bearbeiten ${p.userId}`}
                      disabled={participantsLoading || editingSaving || !!deleteRunningByUserId[p.userId]}
                      onClick={() => startEditEmail(p)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
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
                      onClick={() => deleteParticipantFromTenant(p)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {inviteResultByUserId[p.userId] && (
                    <div style={{ gridColumn: "1 / -1", color: "#374151", fontSize: 12 }}>
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
          <div className="modal">
            <h4>Teilnehmer bearbeiten</h4>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              User: <strong>{editingUserId}</strong>
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label>
                E-Mail
                <input
                  type="email"
                  placeholder="E-Mail"
                  value={editingEmail}
                  onChange={(e) => setEditingEmail(e.target.value)}
                  disabled={editingSaving}
                  style={{ width: "100%", padding: "0.5rem", borderRadius: 8, border: "1px solid #ddd", fontSize: 16 }}
                />
              </label>
              {editingError && <p style={{ color: "crimson", margin: 0 }}>{editingError}</p>}
            </div>

            <div className="modal-actions">
              <button type="button" onClick={() => setEditingUserId(null)} disabled={editingSaving}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={saveEditEmail}
                disabled={editingSaving}
              >
                {editingSaving ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Teilnehmer anlegen">
          <div className="modal">
            <h4>Teilnehmer anlegen</h4>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label>
                Nickname
                <input
                  type="text"
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
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 16,
                  }}
                />
              </label>

              <label>
                E-Mail (optional)
                <input
                  type="email"
                  placeholder="E-Mail"
                  value={createEmail}
                  onChange={(e) => {
                    setCreateEmail(e.target.value);
                    setCreateEmailAutoFilled(false);
                  }}
                  disabled={createSaving}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 16,
                  }}
                />
                {createEmailAutoFilled && (
                  <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: 12 }}>
                    E-Mail aus bestehendem Profil uebernommen.
                  </p>
                )}
                <p style={{ margin: "0.25rem 0 0", color: "#4b5563", fontSize: 12 }}>
                  Bei Reaktivierung bleibt die bestehende E-Mail standardmaessig unveraendert.
                </p>
              </label>
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
                    E-Mail bei Reaktivierung ueberschreiben
                  </label>
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

              <label>
                Rolle
                <select
                  value={createRole}
                  onChange={(e) =>
                    setCreateRole(e.target.value as "participant" | "instructor" | "admin")
                  }
                  disabled={createSaving}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 16,
                  }}
                >
                  <option value="participant">Teilnehmer</option>
                  <option value="instructor">Kursleiter</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              {createError && <p style={{ color: "crimson", margin: 0 }}>{createError}</p>}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={createSaving}
                style={{
                  minWidth: 120,
                  height: 38,
                  padding: "0 0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={saveCreate}
                disabled={createSaving || createActiveConflict}
                style={{
                  minWidth: 120,
                  height: 38,
                  padding: "0 0.75rem",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxSizing: "border-box",
                }}
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
    </div>
  );
}