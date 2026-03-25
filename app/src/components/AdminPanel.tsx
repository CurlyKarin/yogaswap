import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
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
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [role, setRole] = useState<"participant" | "instructor" | "admin">("participant");
  const [foreignManaged, setForeignManaged] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [participants, setParticipants] = useState<ParticipantWithStatus[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [participantsSearch, setParticipantsSearch] = useState("");

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState("");

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

  const handleInvite = async () => {
    if (!nickname) return;
    if (!foreignManaged && !email) return;
    setLoading(true);
    setMessage("");
    setError("");

    let inviteSucceeded = false;

    try {
      const effectiveRole = foreignManaged ? "participant" : role;
      const payload = foreignManaged
        ? { nickname, role: effectiveRole }
        : { email, nickname, role: effectiveRole };

      const result = await inviteUser(payload);

      if (result.error === "Nickname already exists") {
        setError("Dieser Spitzname ist bereits vergeben.");
      } else if (result.success) {
        inviteSucceeded = true;
        if (foreignManaged) {
          setMessage(
            `✅ Teilnehmer '${nickname}' wurde ohne Login angelegt.\n` +
            `Hinweis: Es wird keine Einladung per E-Mail verschickt.`
          );
        } else if (result.emailSent) {
          setMessage(`✅ Einladung per E-Mail gesendet an ${email}`);
        } else {
          // E-Mail nicht versendet - zeige temporäres Passwort
          const tempPw = result.tempPassword || "(Passwort nicht verfügbar)";
          setMessage(
            `⚠️ User erstellt, aber E-Mail konnte nicht versendet werden.\n` +
            `Temporäres Passwort für '${nickname}': ${tempPw}\n` +
            `Bitte Passwort persönlich übermitteln.`
          );
        }
        setEmail("");
        setNickname("");
        setForeignManaged(false);
        setRole("participant");
      } else {
        setError("Fehler beim Senden");
      }
    } catch (err: unknown) {
      console.error(err);
      setError("Fehler beim Senden");
    } finally {
      setLoading(false);
    }

    // Zwischenschritt: Liste nach erfolgreichem Anlegen/Einladen aktualisieren,
    // damit die gespeicherte E-Mail sofort sichtbar ist.
    if (inviteSucceeded) await refreshParticipants();
  };

  const safeParticipants = Array.isArray(participants) ? participants : [];

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
  
  return (
    <div className="admin-panel">
      <h3>Teilnehmer einladen</h3>
      <div style={{ display: "grid", gap: "0.5rem", maxWidth: 400 }}>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={foreignManaged}
            onChange={(e) => {
              const checked = e.target.checked;
              setForeignManaged(checked);
              if (checked) {
                setEmail("");
                setRole("participant");
              }
            }}
            disabled={loading}
          />
          Teilnehmer ohne Login anlegen (später einladen)
        </label>

        <input
          type="text"
          placeholder="Spitzname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={loading}
        />
        {!foreignManaged && (
          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        )}
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "participant" | "instructor" | "admin")
          }
          disabled={loading || foreignManaged}
        >
          <option value="participant">Teilnehmer</option>
          <option value="instructor">Kursleiter</option>
          <option value="admin">Admin</option>
        </select>
        <button
          className="btn-primary"
          onClick={handleInvite}
          disabled={loading || !nickname || (!foreignManaged && !email)}
        >
          {loading
            ? foreignManaged
              ? "Wird angelegt..."
              : "Wird gesendet..."
            : foreignManaged
              ? "Anlegen"
              : "Einladen"}
        </button>

        {message && (
          <p style={{ margin: "0.5rem 0", color: message.includes("⚠️") ? "orange" : "green", whiteSpace: "pre-line" }}>
            {message}
          </p>
        )}
        {error && <p style={{ margin: "0.5rem 0", color: "red" }}>{error}</p>}
 
      </div>

      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #eee" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Teilnehmer verwalten</h3>
          <button type="button" title="Neuer Teilnehmer (folgt)" aria-label="Neuer Teilnehmer" disabled>
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
                gridTemplateColumns: "130px 110px 110px 1fr 84px",
                gap: "0.5rem",
                alignItems: "center",
                fontWeight: 600,
                marginBottom: "0.5rem",
              }}
            >
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
                    gridTemplateColumns: "130px 110px 110px 1fr 84px",
                    gap: "0.5rem",
                    alignItems: "center",
                    padding: "0.25rem 0",
                  }}
                >
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
                  <div style={{ display: "flex", gap: "0.25rem", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      title={`Bearbeiten ${p.userId}`}
                      aria-label={`Bearbeiten ${p.userId}`}
                      disabled={participantsLoading || editingSaving}
                      onClick={() => startEditEmail(p)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button type="button" title={`Löschen ${p.userId}`} aria-label={`Löschen ${p.userId}`} disabled>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
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
    </div>
  );
}