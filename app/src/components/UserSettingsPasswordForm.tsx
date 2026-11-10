import { useState } from "react";
import { fetchAuthSession, updatePassword } from "aws-amplify/auth";
import { clearCognitoSession } from "../auth/cognitoSession";
import { mapChangePasswordError, MIN_PASSWORD_LENGTH } from "../lib/mapChangePasswordError";
import FieldLabelWithTooltip from "./FieldLabelWithTooltip";

export type UserSettingsPasswordFormProps = {
  /** Studio-Login-Name — for password-manager autofill of current password. */
  nickname: string;
  /** Cognito `sub` of the logged-in profile; must match the active Amplify session. */
  authUserId?: string | null;
  /** After success: session is cleared — parent should show login + notice. */
  onPasswordChangedRequiresReauth: () => Promise<void> | void;
};

async function assertSessionMatchesProfile(authUserId: string | null | undefined): Promise<void> {
  const session = await fetchAuthSession();
  const sub = session.tokens?.idToken?.payload?.sub;
  const sessionSub = typeof sub === "string" ? sub.trim() : "";
  if (!sessionSub) {
    throw Object.assign(new Error("UserNeedsToBeAuthenticatedException"), {
      name: "UserNeedsToBeAuthenticatedException",
    });
  }
  const expected = typeof authUserId === "string" ? authUserId.trim() : "";
  if (!expected) {
    throw new Error(
      "Dieses Konto ist nicht sicher mit der Anmeldung verknüpft. Bitte ausloggen, neu einloggen und erneut versuchen.",
    );
  }
  if (sessionSub !== expected) {
    throw new Error(
      "Die aktive Anmeldung gehört zu einem anderen Konto als dem angezeigten Login-Namen. Bitte ausloggen, mit diesem Login-Namen neu anmelden und das Passwort erneut ändern.",
    );
  }
}

export default function UserSettingsPasswordForm({
  nickname,
  authUserId,
  onPasswordChangedRequiresReauth,
}: UserSettingsPasswordFormProps) {
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
      await assertSessionMatchesProfile(authUserId);
      await updatePassword({ oldPassword: currentPassword, newPassword });

      // Best-effort: Passwortmanager auf Login-Name + neues Passwort aktualisieren.
      try {
        const maybeCtor = (
          window as unknown as {
            PasswordCredential?: new (data: { id: string; password: string }) => unknown;
          }
        ).PasswordCredential;
        const credsApi = (
          navigator as Navigator & { credentials?: { store?: (credential: unknown) => Promise<unknown> } }
        ).credentials;
        if (maybeCtor && credsApi?.store) {
          await credsApi.store(new maybeCtor({ id: nickname.trim(), password: newPassword }));
        }
      } catch {
        // unsupported / blocked
      }

      resetFields();
      setSuccess("Passwort wurde geändert. Du wirst abgemeldet — bitte mit dem neuen Passwort anmelden.");
      await clearCognitoSession();
      await onPasswordChangedRequiresReauth();
    } catch (err) {
      console.error("Failed to change password:", err);
      setError(mapChangePasswordError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="studio-settings-grid"
      role="group"
      aria-label="Passwort ändern"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
    >
      {/* Visible username (same as /login) so password managers pick this account, not all yogaswap entries. */}
      <label className="dialog-field">
        <FieldLabelWithTooltip tooltip="Zum Ändern brauchst du dein aktuelles Passwort — oder du gehst über den Login und wählst „Passwort vergessen?“. Nach dem Speichern wirst du abgemeldet und meldest dich mit dem neuen Passwort an.">
          Login-Name
        </FieldLabelWithTooltip>
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={nickname}
          readOnly
          aria-readonly="true"
          className="is-readonly-muted"
          aria-label="Login-Name"
        />
      </label>

      <label className="dialog-field">
        <span className="dialog-field-label">Aktuelles Passwort</span>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          disabled={saving}
          autoComplete="current-password"
          name="password"
          aria-label="Aktuelles Passwort"
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
          aria-label="Neues Passwort"
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
          aria-label="Neues Passwort bestätigen"
        />
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button type="submit" className="modal-action-btn" disabled={!canSave}>
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
    </form>
  );
}
