import { useEffect, useId, useRef } from "react";

export type UserSettingsSectionProps = {
  nickname: string;
  /** Controlled open state for the outer details (Header-Einstieg). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Persönliche Einstellungen — Hülle für #93-Folgetickets (#433).
 * Kein Studio verlassen / Konto löschen.
 */
export default function UserSettingsSection({
  nickname,
  open = false,
  onOpenChange,
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
          <p className="muted small" style={{ marginTop: 0 }}>
            Anzeigename und E-Mail-Adresse folgen (#436, #435). Der Login-Name bleibt unverändert.
          </p>
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">Sicherheit</h4>
          </summary>
          <p className="muted small" style={{ marginTop: 0 }}>
            Passwort ändern folgt (#434).
          </p>
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">E-Mail-Benachrichtigungen</h4>
          </summary>
          <p className="muted small" style={{ marginTop: 0 }}>
            Persönliche Schalter für Kurs-/Termin-Mails folgen (#437). Zugangs- und Security-Mails
            bleiben immer an.
          </p>
        </details>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 className="studio-settings-summary-title">Warteliste</h4>
          </summary>
          <p className="muted small" style={{ marginTop: 0 }}>
            Persönlicher Zeitpuffer fürs Nachrücken folgt (#438).
          </p>
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
