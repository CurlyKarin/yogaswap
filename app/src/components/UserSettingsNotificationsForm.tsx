import { useEffect, useId, useState } from "react";
import {
  resolveParticipantNotificationPrefs,
  type ParticipantNotificationSettings,
  type ResolvedParticipantNotificationPrefs,
} from "shared/participantNotifications";
import { updateParticipant } from "../api/participants";
import { apiErrorMessage } from "../lib/apiErrorMessage";
import FieldLabelWithTooltip from "./FieldLabelWithTooltip";

export type UserSettingsNotificationsFormProps = {
  nickname: string;
  notificationSettings?: ParticipantNotificationSettings | null;
  onNotificationSettingsSaved?: (settings: ParticipantNotificationSettings) => void;
};

const TOOLTIPS = {
  studioCourse:
    "Mails vom Studio und zum Kursstamm: Studio-Absagen, Beitritt/Austritt, Kurs aktiv, geplantes Kursende.",
  ownTermChange:
    "Mails zu deinen eigenen Terminänderungen: Tausch bestätigt, Termin freigegeben, Absage zurückgenommen.",
  waitlistPromotion:
    "Mails beim Nachrücken über Warteliste oder Ringtausch. Unabhängig vom Schalter „Meine Terminänderungen“.",
} as const;

export default function UserSettingsNotificationsForm({
  nickname,
  notificationSettings,
  onNotificationSettingsSaved,
}: UserSettingsNotificationsFormProps) {
  const headingId = useId();
  const [draft, setDraft] = useState<ResolvedParticipantNotificationPrefs>(() =>
    resolveParticipantNotificationPrefs(notificationSettings),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(resolveParticipantNotificationPrefs(notificationSettings));
    setError(null);
    setSuccess(null);
  }, [notificationSettings]);

  const current = resolveParticipantNotificationPrefs(notificationSettings);
  const dirty =
    draft.studioCourseEmail !== current.studioCourseEmail ||
    draft.ownTermChangeEmail !== current.ownTermChangeEmail ||
    draft.waitlistPromotionEmail !== current.waitlistPromotionEmail;
  const canSave = !saving && dirty;

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const notifications: ParticipantNotificationSettings = {
        studioCourseEmail: draft.studioCourseEmail,
        ownTermChangeEmail: draft.ownTermChangeEmail,
        waitlistPromotionEmail: draft.waitlistPromotionEmail,
      };
      const result = await updateParticipant(nickname, {
        settings: { notifications },
      });
      const saved =
        result.settings?.notifications &&
        typeof result.settings.notifications === "object" &&
        !Array.isArray(result.settings.notifications)
          ? (result.settings.notifications as ParticipantNotificationSettings)
          : notifications;
      setDraft(resolveParticipantNotificationPrefs(saved));
      onNotificationSettingsSaved?.(saved);
      setSuccess("Benachrichtigungen gespeichert.");
    } catch (err) {
      console.error("Failed to save notification settings:", err);
      setError(apiErrorMessage(err, "Benachrichtigungen konnten nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="studio-settings-grid"
      role="group"
      aria-labelledby={headingId}
    >
      <p id={headingId} className="muted small" style={{ gridColumn: "1 / -1", margin: 0 }}>
        Zugangs- und Security-Mails (Einladung, Passwort, E-Mail-/Namensänderung, Rolle) bleiben immer
        an.
      </p>

      <label className="dialog-field studio-settings-checkbox-field">
        <FieldLabelWithTooltip tooltip={TOOLTIPS.studioCourse}>
          <input
            type="checkbox"
            checked={draft.studioCourseEmail}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, studioCourseEmail: e.target.checked }))
            }
            disabled={saving}
          />{" "}
          Mitteilungen vom Studio
        </FieldLabelWithTooltip>
      </label>

      <label className="dialog-field studio-settings-checkbox-field">
        <FieldLabelWithTooltip tooltip={TOOLTIPS.ownTermChange}>
          <input
            type="checkbox"
            checked={draft.ownTermChangeEmail}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, ownTermChangeEmail: e.target.checked }))
            }
            disabled={saving}
          />{" "}
          Meine Terminänderungen
        </FieldLabelWithTooltip>
      </label>

      <label className="dialog-field studio-settings-checkbox-field">
        <FieldLabelWithTooltip tooltip={TOOLTIPS.waitlistPromotion}>
          <input
            type="checkbox"
            checked={draft.waitlistPromotionEmail}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, waitlistPromotionEmail: e.target.checked }))
            }
            disabled={saving}
          />{" "}
          Nachrücken
        </FieldLabelWithTooltip>
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="modal-action-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving ? "Speichern…" : "Benachrichtigungen speichern"}
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
