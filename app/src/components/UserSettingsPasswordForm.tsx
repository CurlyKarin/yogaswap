import { useState } from "react";
import { updatePassword } from "aws-amplify/auth";
import { mapChangePasswordError, MIN_PASSWORD_LENGTH } from "../lib/mapChangePasswordError";

export default function UserSettingsPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSave =
    !saving &&
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0;

  const resetFields = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Neues Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Neues Passwort und Bestätigung stimmen nicht überein.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Neues Passwort muss sich vom aktuellen unterscheiden.");
      return;
    }

    setSaving(true);
    try {
      await updatePassword({ oldPassword: currentPassword, newPassword });
      resetFields();
      setSuccess("Passwort wurde geändert.");
    } catch (err) {
      console.error("Failed to change password:", err);
      setError(mapChangePasswordError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-settings-grid" role="group" aria-label="Passwort ändern">
      <p className="muted small" style={{ marginTop: 0, gridColumn: "1 / -1" }}>
        Zum Ändern brauchst du dein aktuelles Passwort. „Passwort vergessen?“ bleibt der Weg über den
        Login.
      </p>

      <label className="dialog-field">
        <span className="dialog-field-label">Aktuelles Passwort</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={saving}
          autoComplete="current-password"
          name="current-password"
        />
      </label>

      <label className="dialog-field">
        <span className="dialog-field-label">Neues Passwort</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          disabled={saving}
          autoComplete="new-password"
          name="new-password"
          minLength={MIN_PASSWORD_LENGTH}
        />
      </label>

      <label className="dialog-field">
        <span className="dialog-field-label">Neues Passwort bestätigen</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={saving}
          autoComplete="new-password"
          name="confirm-password"
          minLength={MIN_PASSWORD_LENGTH}
        />
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="modal-action-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving ? "Speichern…" : "Passwort speichern"}
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
