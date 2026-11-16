import { useEffect, useId, useState } from "react";
import type { UserRole } from "shared/types";
import { resolveMyCoursesToggle } from "../lib/weekMyCoursesFilter";
import { updateParticipant } from "../api/participants";
import { apiErrorMessage } from "../lib/apiErrorMessage";
import FieldLabelWithTooltip from "./FieldLabelWithTooltip";

export type UserSettingsWeekFilterFormProps = {
  nickname: string;
  role: UserRole;
  weekFilterOnlyMyCoursesDefault?: boolean | null;
  onWeekFilterDefaultSaved?: (value: boolean) => void;
};

export default function UserSettingsWeekFilterForm({
  nickname,
  role,
  weekFilterOnlyMyCoursesDefault,
  onWeekFilterDefaultSaved,
}: UserSettingsWeekFilterFormProps) {
  const headingId = useId();
  const roleDefault = resolveMyCoursesToggle(role).defaultOnlyMy;
  const effective =
    typeof weekFilterOnlyMyCoursesDefault === "boolean"
      ? weekFilterOnlyMyCoursesDefault
      : roleDefault;
  const [draft, setDraft] = useState(effective);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setDraft(effective);
    setError(null);
    setSuccess(null);
  }, [effective]);

  const dirty = draft !== effective;
  const canSave = !saving && dirty;

  const handleSave = async () => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await updateParticipant(nickname, {
        settings: { weekFilterOnlyMyCoursesDefault: draft },
      });
      const savedRaw = result.settings?.weekFilterOnlyMyCoursesDefault;
      const saved = typeof savedRaw === "boolean" ? savedRaw : draft;
      setDraft(saved);
      onWeekFilterDefaultSaved?.(saved);
      setSuccess("Wochenfilter-Default gespeichert.");
    } catch (err) {
      console.error("Failed to save week filter default:", err);
      setError(apiErrorMessage(err, "Wochenfilter-Default konnte nicht gespeichert werden."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-settings-grid" role="group" aria-labelledby={headingId}>
      <p id={headingId} className="muted small" style={{ gridColumn: "1 / -1", margin: 0 }}>
        Startzustand des User-Icons in der Wochenansicht. Du kannst den Filter dort weiterhin
        umschalten. Rollen-Vorschlag:{" "}
        {roleDefault ? "nur meine Kurse" : "alle Kurse"}.
      </p>

      <label className="dialog-field studio-settings-checkbox-field" style={{ gridColumn: "1 / -1" }}>
        <FieldLabelWithTooltip tooltip="Wirkt beim nächsten Öffnen der Wochenansicht bzw. wenn du den Filter dort noch nicht umgeschaltet hast.">
          <input
            type="checkbox"
            checked={draft}
            disabled={saving}
            onChange={(event) => setDraft(event.target.checked)}
          />{" "}
          Wochenansicht standardmäßig auf „nur meine Kurse“
        </FieldLabelWithTooltip>
      </label>

      <div style={{ gridColumn: "1 / -1" }}>
        <button
          type="button"
          className="modal-action-btn"
          onClick={() => void handleSave()}
          disabled={!canSave}
        >
          {saving ? "Speichern…" : "Wochenfilter-Default speichern"}
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
