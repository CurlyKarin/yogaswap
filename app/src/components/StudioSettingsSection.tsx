import { useEffect, useId, useState, type ReactNode } from "react";
import type { Tenant } from "shared/types";
import {
  resolveCancellationSwapCutoffMinutes,
  resolveInactiveGraceDays,
  resolveRollingPlanningHorizonWeeks,
  resolveSwapWindow,
  validateStudioSettingsPatch,
} from "shared/tenantSettings";
import { updateTenantSettings } from "../api/tenantSettings";
import NumberStepInput from "./NumberStepInput";

function FieldLabelWithTooltip({ children, tooltip }: { children: ReactNode; tooltip: string }) {
  const hintId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="studio-field-label-block">
      <span className="dialog-field-label studio-field-label">
        {children}
        <button
          type="button"
          className="studio-field-hint"
          title={tooltip}
          aria-expanded={open}
          aria-controls={hintId}
          aria-label={`Hilfe: ${tooltip}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
        >
          ?
        </button>
      </span>
      {open && (
        <span id={hintId} role="note" className="studio-field-hint-popover">
          {tooltip}
        </span>
      )}
    </span>
  );
}

type StudioSettingsSectionProps = {
  tenant: Tenant;
  onSaved: (tenant: Tenant) => void;
};

export default function StudioSettingsSection({ tenant, onSaved }: StudioSettingsSectionProps) {
  const swapDefaults = resolveSwapWindow(tenant.settings);
  const graceDefault = resolveInactiveGraceDays(tenant.settings);
  const horizonDefault = resolveRollingPlanningHorizonWeeks(tenant.settings);
  const cutoffDefault = resolveCancellationSwapCutoffMinutes(tenant.settings);

  const [name, setName] = useState(tenant.name);
  const [inactiveGraceDays, setInactiveGraceDays] = useState(String(graceDefault));
  const [minOffsetDays, setMinOffsetDays] = useState(String(swapDefaults.minOffsetDays));
  const [maxOffsetDays, setMaxOffsetDays] = useState(String(swapDefaults.maxOffsetDays));
  const [rollingPlanningHorizonWeeks, setRollingPlanningHorizonWeeks] = useState(String(horizonDefault));
  const [cancellationSwapCutoffMinutes, setCancellationSwapCutoffMinutes] = useState(String(cutoffDefault));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const swap = resolveSwapWindow(tenant.settings);
    setName(tenant.name);
    setInactiveGraceDays(String(resolveInactiveGraceDays(tenant.settings)));
    setMinOffsetDays(String(swap.minOffsetDays));
    setMaxOffsetDays(String(swap.maxOffsetDays));
    setRollingPlanningHorizonWeeks(String(resolveRollingPlanningHorizonWeeks(tenant.settings)));
    setCancellationSwapCutoffMinutes(String(resolveCancellationSwapCutoffMinutes(tenant.settings)));
    setError(null);
    setSuccess(null);
  }, [tenant]);

  const handleSave = async () => {
    const patch = {
      name: name.trim(),
      inactiveGraceDaysAfterCourseEnd: Number.parseInt(inactiveGraceDays, 10),
      minOffsetDays: Number.parseInt(minOffsetDays, 10),
      maxOffsetDays: Number.parseInt(maxOffsetDays, 10),
      rollingPlanningHorizonWeeks: Number.parseInt(rollingPlanningHorizonWeeks, 10),
      cancellationSwapCutoffMinutesBeforeStart: Number.parseInt(cancellationSwapCutoffMinutes, 10),
    };
    const validationError = validateStudioSettingsPatch(patch);
    if (validationError) {
      setError(validationError);
      setSuccess(null);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateTenantSettings(patch);
      onSaved(updated);
      setSuccess("Studio-Einstellungen gespeichert.");
    } catch (err) {
      console.error("Failed to save studio settings", err);
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-panel studio-settings-section" aria-labelledby="studio-settings-heading">
      <details className="studio-settings-details">
        <summary className="studio-settings-summary">
          <h3 id="studio-settings-heading" className="studio-settings-summary-title">
            Studio-Einstellungen
          </h3>
        </summary>

        <p className="muted small" style={{ marginTop: 0 }}>
          Einstellungen für das Studio ({window.location.hostname}).
        </p>

        <h4 id="studio-settings-general-heading" className="studio-settings-subsection-heading">
          Allgemein
        </h4>
        <div className="studio-settings-grid" role="group" aria-labelledby="studio-settings-general-heading">
          <label className="dialog-field">
            <span className="dialog-field-label">Studioname</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoComplete="organization"
            />
          </label>

          <label className="dialog-field">
            <FieldLabelWithTooltip tooltip="Bis zu dieser Frist können Mitglieder den Termin absagen und einen Tausch starten. Danach ist nur noch eine kurzfristige Absage möglich; der Platz bleibt belegt.">
              Absagefrist für Mitglieder (Minuten vor Terminbeginn)
            </FieldLabelWithTooltip>
            <NumberStepInput
              min={0}
              max={1440}
              step={15}
              value={cancellationSwapCutoffMinutes}
              onChange={setCancellationSwapCutoffMinutes}
              disabled={saving}
            />
          </label>
        </div>

        <hr className="studio-settings-divider" />

        <details className="studio-settings-subdetails">
          <summary className="studio-settings-summary studio-settings-summary--sub">
            <h4 id="studio-settings-rolling-heading" className="studio-settings-summary-title">
              Durchlaufende Kurse
            </h4>
          </summary>
          <p className="muted small" style={{ marginTop: 0 }}>
            Nachlauf und Tauschfenster gelten nur für durchlaufende Kurse. Kursblöcke nutzen das Endedatum am
            Kurs.
          </p>
          <div
            className="studio-settings-grid"
            role="group"
            aria-labelledby="studio-settings-rolling-heading"
          >
            <label className="dialog-field">
              <FieldLabelWithTooltip tooltip="Nur für durchlaufende Kurse: legt studio-weit fest, welche Termine ab heute Mitglieder sehen und tauschen dürfen und innerhalb welcher Frist bei aktivem Kurs nur Absage statt Ausschließen möglich ist. Vergrößerung ist jederzeit möglich. Beim Verkleinern werden weniger Termine sichtbar; Speichern ist nur möglich, wenn im betroffenen Zeitraum keine offenen Tauschanfragen und keine gebuchten Rollkurs-Termine mehr liegen — diese vorher abschließen oder abbrechen.">
                Planungs- und Sichtfenster (Wochen)
              </FieldLabelWithTooltip>
              <NumberStepInput
                min={1}
                max={52}
                value={rollingPlanningHorizonWeeks}
                onChange={setRollingPlanningHorizonWeeks}
                disabled={saving}
                aria-label="Planungs- und Sichtfenster für durchlaufende Kurse in Wochen"
              />
            </label>

            <label className="dialog-field">
              <FieldLabelWithTooltip tooltip="Nur für durchlaufende Kurse: Tage nach Kursende, in denen Mitglieder noch tauschen dürfen. Sollte zur spätesten Tausch-Offset-Zahl passen (oft gleiche Anzahl Tage). Kursblöcke nutzen das Endedatum am Kurs.">
                Nachlauf nach Kursende (Tage)
              </FieldLabelWithTooltip>
              <NumberStepInput
                min={0}
                max={90}
                value={inactiveGraceDays}
                onChange={setInactiveGraceDays}
                disabled={saving}
              />
            </label>

            <label className="dialog-field">
              <FieldLabelWithTooltip tooltip="Nur für durchlaufende Kurse: Tage relativ zum gewählten Kurstermin — frühestens so viele Tage vor dem Termin ist ein Tausch möglich. Kursblöcke nutzen das Endedatum am Kurs.">
                Tauschfenster: frühestens (Tage)
              </FieldLabelWithTooltip>
              <NumberStepInput
                min={-90}
                max={90}
                value={minOffsetDays}
                onChange={setMinOffsetDays}
                disabled={saving}
              />
            </label>

            <label className="dialog-field">
              <FieldLabelWithTooltip tooltip="Nur für durchlaufende Kurse: Tage relativ zum gewählten Kurstermin — spätestens so viele Tage vor dem Termin (negativ = nach dem Termin). Kursblöcke nutzen das Endedatum am Kurs.">
                Tauschfenster: spätestens (Tage)
              </FieldLabelWithTooltip>
              <NumberStepInput
                min={-90}
                max={90}
                value={maxOffsetDays}
                onChange={setMaxOffsetDays}
                disabled={saving}
              />
            </label>
          </div>
        </details>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="muted small" role="status">
            {success}
          </p>
        )}

        <div style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Speichern…" : "Studio-Einstellungen speichern"}
          </button>
        </div>
      </details>
    </section>
  );
}
