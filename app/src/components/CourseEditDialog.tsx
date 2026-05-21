import type { KeyboardEvent, RefObject } from "react";
import type { CoursePlanningMode, CourseStatus } from "shared/types";
import CourseModalFrame from "./CourseModalFrame";

type CourseEditorState = {
  id: number;
  name: string;
  weekday: string;
  time: string;
  capacity: string;
  status: CourseStatus;
  planningMode: CoursePlanningMode;
};

type WeekdayOption = { value: string; label: string };
type StatusOption = { value: CourseStatus; label: string };
type PlanningModeOption = { value: CoursePlanningMode; label: string };

type CourseEditDialogProps = {
  open: boolean;
  saving: boolean;
  formError: string | null;
  state: CourseEditorState | null;
  canSubmit: boolean;
  modalRef: RefObject<HTMLDivElement | null>;
  weekdayOptions: readonly WeekdayOption[];
  statusOptions: readonly StatusOption[];
  planningModeOptions: readonly PlanningModeOption[];
  planningModeHint: (mode: CoursePlanningMode) => string;
  planningModeLocked?: boolean;
  planningModeLockedHint?: string | null;
  rollingInactiveBlocked?: boolean;
  rollingInactiveHint?: string | null;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onSave: () => void;
  onChange: (next: CourseEditorState) => void;
};

export default function CourseEditDialog({
  open,
  saving,
  formError,
  state,
  canSubmit,
  modalRef,
  weekdayOptions,
  statusOptions,
  planningModeOptions,
  planningModeHint,
  planningModeLocked = false,
  planningModeLockedHint = null,
  rollingInactiveBlocked = false,
  rollingInactiveHint = null,
  onKeyDown,
  onClose,
  onSave,
  onChange,
}: CourseEditDialogProps) {
  if (!open || !state) return null;

  return (
    <CourseModalFrame ariaLabel="Kurs bearbeiten" title="Kurs bearbeiten" modalRef={modalRef} onKeyDown={onKeyDown}>
        <p className="course-editor-note" style={{ marginTop: 0 }}>
          Stammdaten bearbeiten. Mitglieder und Termine werden im nächsten Schritt hier ergänzt.
        </p>
        <div className="dialog-stack">
          <input
            type="text"
            aria-label="Kursname bearbeiten"
            value={state.name}
            onChange={(event) => onChange({ ...state, name: event.target.value })}
            disabled={saving}
            className="dialog-field"
          />
          <select
            aria-label="Wochentag bearbeiten"
            value={state.weekday}
            onChange={(event) => onChange({ ...state, weekday: event.target.value })}
            disabled={saving}
            className="dialog-field"
          >
            {weekdayOptions.map((weekday) => (
              <option key={weekday.value} value={weekday.value}>
                {weekday.label}
              </option>
            ))}
          </select>
          <input
            type="time"
            aria-label="Uhrzeit bearbeiten"
            value={state.time}
            onChange={(event) => onChange({ ...state, time: event.target.value })}
            disabled={saving}
            className="dialog-field"
          />
          <input
            type="number"
            aria-label="Kapazität bearbeiten"
            min={0}
            value={state.capacity}
            onChange={(event) => onChange({ ...state, capacity: event.target.value })}
            disabled={saving}
            className="dialog-field"
          />
          <select
            aria-label="Status bearbeiten"
            value={state.status}
            onChange={(event) => onChange({ ...state, status: event.target.value as CourseStatus })}
            disabled={saving}
            className="dialog-field"
          >
            {statusOptions.map((status) => (
              <option
                key={status.value}
                value={status.value}
                disabled={rollingInactiveBlocked && status.value === "inactive"}
              >
                {status.label}
              </option>
            ))}
          </select>
          {rollingInactiveBlocked && rollingInactiveHint && (
            <p className="course-editor-inline-hint">{rollingInactiveHint}</p>
          )}
          <select
            aria-label="Planungsmodus bearbeiten"
            value={state.planningMode}
            onChange={(event) =>
              onChange({
                ...state,
                planningMode: event.target.value as CoursePlanningMode,
              })
            }
            disabled={saving || planningModeLocked}
            className="dialog-field"
          >
            {planningModeOptions.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          {planningModeLocked && planningModeLockedHint && (
            <p className="course-editor-inline-hint">{planningModeLockedHint}</p>
          )}
          <p className="course-editor-inline-hint">{planningModeHint(state.planningMode)}</p>
          {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
        </div>
        <div className="modal-actions dialog-actions">
          <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary modal-action-btn" onClick={onSave} disabled={!canSubmit}>
            {saving ? "Speichere..." : "Speichern"}
          </button>
        </div>
    </CourseModalFrame>
  );
}
