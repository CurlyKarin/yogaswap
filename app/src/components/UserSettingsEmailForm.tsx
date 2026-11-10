import { useEffect, useState } from "react";
import { updateParticipant } from "../api/participants";
import { apiErrorMessage } from "../lib/apiErrorMessage";
import FieldLabelWithTooltip from "./FieldLabelWithTooltip";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserSettingsEmailFormProps = {
  nickname: string;
  email?: string;
  /** Called after a successful change that invalidates the session (#350/#435). */
  onRequiresReauth: () => Promise<void> | void;
};

export default function UserSettingsEmailForm({
  nickname,
  email = "",
  onRequiresReauth,
}: UserSettingsEmailFormProps) {
  const [draft, setDraft] = useState(email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(email);
    setError(null);
    setSuccess(null);
  }, [email]);

  const current = email.trim();
  const next = draft.trim();
  const unchanged = next.toLowerCase() === current.toLowerCase();
  const canSave = !saving && next.length > 0 && !unchanged;

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    if (!EMAIL_RE.test(next)) {
      setError("Bitte eine gültige E-Mail-Adresse eingeben.");
      return;
    }
    if (unchanged) {
      setError("Die E-Mail-Adresse ist unverändert.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateParticipant(nickname, { email: next });
      if (result.passwordResetTriggered) {
        setSuccess(
          "E-Mail geändert. Du wirst abgemeldet — bitte neues Passwort über den Link an die neue Adresse setzen.",
        );
        await onRequiresReauth();
        return;
      }
      setSuccess("E-Mail-Adresse gespeichert.");
      setDraft(result.email ?? next);
    } catch (err) {
      console.error("Failed to change email:", err);
      setError(apiErrorMessage(err, "E-Mail konnte nicht geändert werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-settings-grid" role="group" aria-label="E-Mail-Adresse">
      <label className="dialog-field">
        <FieldLabelWithTooltip tooltip={`Login-Name ${nickname} bleibt gleich. Nach dem Ändern wirst du abgemeldet und setzt über die neue Adresse ein neues Passwort. Die alte Adresse erhält einen Sicherheitshinweis.`}>
          E-Mail-Adresse
        </FieldLabelWithTooltip>
        <input
          type="email"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoComplete="email"
          placeholder="name@example.com"
          aria-label="E-Mail-Adresse"
        />
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="modal-action-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving ? "Speichern…" : "E-Mail speichern"}
        </button>
      </div>

      {error && (
        <p className="error-text" role="alert" style={{ gridColumn: "1 / -1", margin: 0 }}>
          {error}
        </p>
      )}
      {success && (
        <p className="muted small" role="status" style={{ gridColumn: "1 / -1", margin: 0 }}>
          {success}
        </p>
      )}
    </div>
  );
}
