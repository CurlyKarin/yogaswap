import { useEffect, useState } from "react";
import { validateDisplayName } from "shared/displayName";
import { updateParticipant } from "../api/participants";
import { apiErrorMessage } from "../lib/apiErrorMessage";
import FieldLabelWithTooltip from "./FieldLabelWithTooltip";

export type UserSettingsDisplayNameFormProps = {
  nickname: string;
  displayName?: string;
  onDisplayNameSaved?: (displayName: string) => void;
};

export default function UserSettingsDisplayNameForm({
  nickname,
  displayName = "",
  onDisplayNameSaved,
}: UserSettingsDisplayNameFormProps) {
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(displayName);
    setError(null);
    setSuccess(null);
  }, [displayName]);

  const current = displayName.trim();
  const next = draft.trim();
  const unchanged = next === current;
  const canSave = !saving && next.length > 0 && !unchanged;

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    const check = validateDisplayName(draft);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    if (check.displayName === current) {
      setError("Der Anzeigename ist unverändert.");
      return;
    }

    setSaving(true);
    try {
      const result = await updateParticipant(nickname, { displayName: check.displayName });
      const saved = (result.displayName ?? check.displayName).trim();
      setDraft(saved);
      onDisplayNameSaved?.(saved);
      if (result.displayNameChangedEmailSent) {
        setSuccess("Anzeigename gespeichert. Du erhältst eine Info-Mail.");
      } else {
        setSuccess("Anzeigename gespeichert.");
      }
    } catch (err) {
      console.error("Failed to change display name:", err);
      setError(apiErrorMessage(err, "Anzeigename konnte nicht geändert werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-settings-grid" role="group" aria-label="Anzeigename">
      <label className="dialog-field">
        <FieldLabelWithTooltip tooltip="Technischer Login-Name — bleibt unverändert und wird für Anmeldung sowie Zuordnungen genutzt.">
          Login-Name
        </FieldLabelWithTooltip>
        <input
          type="text"
          value={nickname}
          readOnly
          aria-readonly="true"
          className="is-readonly-muted"
          autoComplete="username"
          name="username"
        />
      </label>

      <label className="dialog-field">
        <FieldLabelWithTooltip tooltip="Sichtbarer Name in Kurslisten. Der Login-Name bleibt gleich. Bei Änderung erhältst du eine Info-Mail.">
          Anzeigename
        </FieldLabelWithTooltip>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={saving}
          autoComplete="nickname"
          name="display-name"
          placeholder="z. B. Anna"
          maxLength={40}
          aria-label="Anzeigename"
        />
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="modal-action-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving ? "Speichern…" : "Anzeigename speichern"}
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
