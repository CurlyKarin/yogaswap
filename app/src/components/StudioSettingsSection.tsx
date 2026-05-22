import { useEffect, useId, useState, type ReactNode } from "react";
import type { Tenant } from "shared/types";
import {
  resolveInactiveGraceDays,
  resolveRollingPlanningHorizonWeeks,
  resolveSwapWindow,
  validateStudioSettingsPatch,
} from "shared/tenantSettings";
import { updateTenantSettings } from "../api/tenantSettings";

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

  const [name, setName] = useState(tenant.name);
  const [inactiveGraceDays, setInactiveGraceDays] = useState(String(graceDefault));
  const [minOffsetDays, setMinOffsetDays] = useState(String(swapDefaults.minOffsetDays));
  const [maxOffsetDays, setMaxOffsetDays] = useState(String(swapDefaults.maxOffsetDays));
  const [rollingPlanningHorizonWeeks, setRollingPlanningHorizonWeeks] = useState(String(horizonDefault));
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
      <h3 id="studio-settings-heading" style={{ marginTop: 0 }}>
        Studio-Einstellungen
      </h3>
      <p className="muted small" style={{ marginTop: 0 }}>
        Gilt für das aktuelle Studio ({tenant.tenantId}). Weitere Optionen kommen schrittweise dazu.
      </p>

      <div className="studio-settings-grid">
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
          <FieldLabelWithTooltip tooltip="Tage nach Kursende, in denen Teilnehmer noch tauschen dürfen. Sollte zur spätesten Tausch-Offset-Zahl passen (oft gleiche Anzahl Tage).">
            Nachlauf nach Kursende (Tage)
          </FieldLabelWithTooltip>
          <input
            type="number"
            min={0}
            max={90}
            value={inactiveGraceDays}
            onChange={(e) => setInactiveGraceDays(e.target.value)}
            disabled={saving}
          />
        </label>

        <label className="dialog-field">
          <FieldLabelWithTooltip tooltip="Tage relativ zum gewählten Kurstermin: frühestens so viele Tage vor dem Termin ist ein Tausch möglich.">
            Tauschfenster: frühestens (Tage)
          </FieldLabelWithTooltip>
          <input
            type="number"
            min={-90}
            max={90}
            value={minOffsetDays}
            onChange={(e) => setMinOffsetDays(e.target.value)}
            disabled={saving}
          />
        </label>

        <label className="dialog-field">
          <FieldLabelWithTooltip tooltip="Tage relativ zum gewählten Kurstermin: spätestens so viele Tage vor dem Termin (negativ = nach dem Termin).">
            Tauschfenster: spätestens (Tage)
          </FieldLabelWithTooltip>
          <input
            type="number"
            min={-90}
            max={90}
            value={maxOffsetDays}
            onChange={(e) => setMaxOffsetDays(e.target.value)}
            disabled={saving}
          />
        </label>

        <label className="dialog-field">
          <FieldLabelWithTooltip tooltip="Für durchlaufende Kurse: legt studio-weit fest, welche Termine ab heute Teilnehmer sehen und tauschen dürfen und innerhalb welcher Frist bei aktivem Kurs nur Absage statt Ausschließen möglich ist. Vergrößerung ist jederzeit möglich. Beim Verkleinern werden weniger Termine sichtbar; Speichern ist nur möglich, wenn im betroffenen Zeitraum keine offenen Tauschanfragen und keine gebuchten Rollkurs-Termine mehr liegen — diese vorher abschließen oder abbrechen.">
            Planungs- und Sichtfenster für Durchlaufende Kurse (Wochen)
          </FieldLabelWithTooltip>
          <input
            type="number"
            min={1}
            max={52}
            value={rollingPlanningHorizonWeeks}
            onChange={(e) => setRollingPlanningHorizonWeeks(e.target.value)}
            disabled={saving}
            aria-label="Planungs- und Sichtfenster für Durchlaufende Kurse in Wochen"
          />
        </label>
      </div>

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
    </section>
  );
}
