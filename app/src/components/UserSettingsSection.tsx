import { useEffect, useId, useRef } from "react";
import type { ParticipantNotificationSettings } from "shared/participantNotifications";
import UserSettingsDisplayNameForm from "./UserSettingsDisplayNameForm";
import UserSettingsEmailForm from "./UserSettingsEmailForm";
import UserSettingsNotificationsForm from "./UserSettingsNotificationsForm";
import UserSettingsPasswordForm from "./UserSettingsPasswordForm";
import UserSettingsWaitlistForm from "./UserSettingsWaitlistForm";

export type UserSettingsSectionProps = {
  nickname: string;
  email?: string;
  displayName?: string;
  authUserId?: string | null;
  notificationSettings?: ParticipantNotificationSettings | null;
  studioCutoffMinutes?: number;
  waitlistNoPromoteWithinMinutes?: number | null;
  /** Controlled open state for the outer details (Header-Einstieg). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDisplayNameSaved?: (displayName: string) => void;
  onNotificationSettingsSaved?: (settings: ParticipantNotificationSettings) => void;
  onWaitlistBufferSaved?: (minutes: number) => void;
  /** After self-service email change with forced password reset (#435 / #350). */
  onEmailChangeRequiresReauth?: () => Promise<void> | void;
  /** After self-service password change (#434). */
  onPasswordChangedRequiresReauth?: () => Promise<void> | void;
};

/**
 * Persönliche Einstellungen — Hülle für #93-Folgetickets (#433).
 * Kein Studio verlassen / Konto löschen.
 */
export default function UserSettingsSection({
  nickname,
  email,
  displayName,
  authUserId,
  notificationSettings,
  studioCutoffMinutes = 60,
  waitlistNoPromoteWithinMinutes,
  open = false,
  onOpenChange,
  onDisplayNameSaved,
  onNotificationSettingsSaved,
  onWaitlistBufferSaved,
  onEmailChangeRequiresReauth,
  onPasswordChangedRequiresReauth,
}: UserSettingsSectionProps) {
  const headingId = useId();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    const node = detailsRef.current;
    if (!node) return;
    if (node.open !== open) {
      node.open = open;
    }
  }, [open]);

  return (
    <section
      id="user-settings"
      className="admin-panel user-settings-section"
      aria-labelledby={headingId}
    >
      <details
        ref={detailsRef}
        className="studio-settings-details"
        onToggle={(event) => {
          const nextOpen = event.currentTarget.open;
          onOpenChange?.(nextOpen);
        }}
      >
        <summary className="studio-settings-summary">
          <h3 id={headingId} className="studio-settings-summary-title">
            Meine Einstellungen
          </h3>
        </summary>

        <p className="muted small" style={{ marginTop: 0 }}>
          Persönliche Optionen für <strong>{nickname}</strong>. Studioweite Einstellungen bleiben in
          der Verwaltung.
        </p>

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">Profil</h4>
          </summary>
          {/* Only mount when outer panel is open — closed <details> stay tabbable in jsdom. */}
          {open ? (
            <UserSettingsDisplayNameForm
              nickname={nickname}
              displayName={displayName}
              onDisplayNameSaved={onDisplayNameSaved}
            />
          ) : null}
          {open && onEmailChangeRequiresReauth ? (
            <UserSettingsEmailForm
              nickname={nickname}
              email={email}
              onRequiresReauth={onEmailChangeRequiresReauth}
            />
          ) : null}
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">Sicherheit</h4>
          </summary>
          {/* Only mount when outer panel is open — closed <details> stay tabbable in jsdom. */}
          {open && onPasswordChangedRequiresReauth ? (
            <UserSettingsPasswordForm
              nickname={nickname}
              authUserId={authUserId}
              onPasswordChangedRequiresReauth={onPasswordChangedRequiresReauth}
            />
          ) : null}
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">E-Mail-Benachrichtigungen</h4>
          </summary>
          {open ? (
            <UserSettingsNotificationsForm
              nickname={nickname}
              notificationSettings={notificationSettings}
              onNotificationSettingsSaved={onNotificationSettingsSaved}
            />
          ) : null}
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">Warteliste</h4>
          </summary>
          {open ? (
            <UserSettingsWaitlistForm
              nickname={nickname}
              studioCutoffMinutes={studioCutoffMinutes}
              waitlistNoPromoteWithinMinutes={waitlistNoPromoteWithinMinutes}
              onWaitlistBufferSaved={onWaitlistBufferSaved}
            />
          ) : null}
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">Darstellung</h4>
          </summary>
          <p className="muted small" style={{ marginTop: 0 }}>
            Default für den Wochenfilter „nur meine Kurse“ folgt (#439).
          </p>
        </details>
      </details>
    </section>
  );
}
