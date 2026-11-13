import { useEffect, useId, useState } from "react";
import {
  formatWaitlistBufferDuration,
  MAX_WAITLIST_NO_PROMOTE_MINUTES,
  resolveWaitlistNoPromoteWithinMinutes,
  snapWaitlistBufferMinutes,
  stepWaitlistBufferMinutes,
  waitlistBufferStepMinutes,
} from "shared/waitlistBuffer";
import { updateParticipant } from "../api/participants";
import { apiErrorMessage } from "../lib/apiErrorMessage";
import FieldLabelWithTooltip from "./FieldLabelWithTooltip";
import NumberStepInput from "./NumberStepInput";

export type UserSettingsWaitlistFormProps = {
  nickname: string;
  /** Studio-Absagefrist in Minuten (Untergrenze / Default). */
  studioCutoffMinutes: number;
  waitlistNoPromoteWithinMinutes?: number | null;
  onWaitlistBufferSaved?: (minutes: number) => void;
};

export default function UserSettingsWaitlistForm({
  nickname,
  studioCutoffMinutes,
  waitlistNoPromoteWithinMinutes,
  onWaitlistBufferSaved,
}: UserSettingsWaitlistFormProps) {
  const headingId = useId();
  const min = resolveWaitlistNoPromoteWithinMinutes(undefined, studioCutoffMinutes);
  const resolved = resolveWaitlistNoPromoteWithinMinutes(
    waitlistNoPromoteWithinMinutes,
    studioCutoffMinutes,
  );
  const [draft, setDraft] = useState(String(resolved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(resolved));
    setError(null);
    setSuccess(null);
  }, [resolved]);

  const parsed = Number.parseInt(draft, 10);
  const numeric = Number.isFinite(parsed) ? parsed : min;
  const step = waitlistBufferStepMinutes(numeric);
  const dirty = snapWaitlistBufferMinutes(numeric, min) !== resolved;
  const canSave = !saving && dirty;

  const handleStepChange = (next: string) => {
    const value = Number.parseInt(next, 10);
    if (!Number.isFinite(value)) {
      setDraft(next);
      return;
    }
    // NumberStepInput übergibt bereits ±step; hier zusätzlich adaptive Zonen absichern.
    if (value === numeric + step || value === numeric - step) {
      const direction = value > numeric ? 1 : -1;
      setDraft(String(stepWaitlistBufferMinutes(numeric, direction, min)));
      return;
    }
    setDraft(String(snapWaitlistBufferMinutes(value, min)));
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    const minutes = snapWaitlistBufferMinutes(numeric, min);
    if (minutes < min) {
      setError(
        `Der Puffer darf nicht kürzer als die Studio-Absagefrist (${formatWaitlistBufferDuration(min)}) sein.`,
      );
      return;
    }

    setSaving(true);
    try {
      const result = await updateParticipant(nickname, {
        settings: { waitlistNoPromoteWithinMinutes: minutes },
      });
      const savedRaw = result.settings?.waitlistNoPromoteWithinMinutes;
      const saved =
        typeof savedRaw === "number"
          ? resolveWaitlistNoPromoteWithinMinutes(savedRaw, studioCutoffMinutes)
          : minutes;
      setDraft(String(saved));
      onWaitlistBufferSaved?.(saved);
      setSuccess("Wartelisten-Puffer gespeichert.");
    } catch (err) {
      console.error("Failed to save waitlist buffer:", err);
      setError(apiErrorMessage(err, "Wartelisten-Puffer konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-settings-grid" role="group" aria-labelledby={headingId}>
      <p id={headingId} className="muted small" style={{ gridColumn: "1 / -1", margin: 0 }}>
        Kein automatisches Nachrücken und keine Wartelisten-Anfrage, wenn der Termin näher als dieser
        Zeitraum liegt. Offene Anfragen in diesem Fenster werden zurückgenommen. Minimum und
        Vorschlag: Studio-Absagefrist ({formatWaitlistBufferDuration(min)}).
      </p>

      <label className="dialog-field">
        <FieldLabelWithTooltip tooltip="Nur verlängerbar gegenüber der Absagefrist des Studios. Im Puffer: kein Nachrücken, Anfrage wird von der Warteliste genommen. Schritte: 15 Min. unter 2 Std., 30 Min. unter 6 Std., danach 1 Std.">
          Zeitpuffer vor Terminbeginn
        </FieldLabelWithTooltip>
        <NumberStepInput
          min={min}
          max={MAX_WAITLIST_NO_PROMOTE_MINUTES}
          step={step}
          value={draft}
          onChange={handleStepChange}
          disabled={saving}
          aria-label="Wartelisten-Zeitpuffer in Minuten"
        />
        <span className="muted small" style={{ display: "block", marginTop: "0.35rem" }}>
          {formatWaitlistBufferDuration(snapWaitlistBufferMinutes(numeric, min))}
          {step !== 15 ? ` · Schritte à ${step} Min.` : null}
        </span>
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="modal-action-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving ? "Speichern…" : "Wartelisten-Puffer speichern"}
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
