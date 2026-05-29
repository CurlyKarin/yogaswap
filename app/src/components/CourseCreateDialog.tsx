import type { KeyboardEvent, RefObject } from "react";
import type { CoursePlanningMode, CourseStatus } from "shared/types";
import CourseModalFrame from "./CourseModalFrame";
import CourseCapacityFields from "./CourseCapacityFields";

type CourseCreateState = {
  name: string;
  weekday: string;
  time: string;
  capacity: string;
  overbookLimit: string;
  status: CourseStatus;
  planningMode: CoursePlanningMode;
};

type WeekdayOption = { value: string; label: string };
type StatusOption = { value: CourseStatus; label: string };
type PlanningModeOption = { value: CoursePlanningMode; label: string };

type CourseCreateDialogProps = {
  open: boolean;
  saving: boolean;
  formError: string | null;
  state: CourseCreateState;
  canSubmit: boolean;
  modalRef: RefObject<HTMLDivElement | null>;
  weekdayOptions: readonly WeekdayOption[];
  statusOptions: readonly StatusOption[];
  planningModeOptions: readonly PlanningModeOption[];
  planningModeHint: (mode: CoursePlanningMode) => string;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onSave: () => void;
  onChange: (next: CourseCreateState) => void;
};

export default function CourseCreateDialog({
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
  onKeyDown,
  onClose,
  onSave,
  onChange,
}: CourseCreateDialogProps) {
  if (!open) return null;

  return (
    <CourseModalFrame ariaLabel="Kurs anlegen" title="Kurs anlegen" modalRef={modalRef} onKeyDown={onKeyDown}>
        <p className="course-editor-note">
          Stammdaten jetzt anlegen. Mitglieder-Zuordnung und Terminplanung folgen als eigene Schritte.
        </p>
        <div className="dialog-stack">
          <input
            type="text"
            aria-label="Kursname"
            placeholder="Kursname"
            value={state.name}
            onChange={(event) => onChange({ ...state, name: event.target.value })}
            disabled={saving}
            className="dialog-field"
          />
          <select
            aria-label="Wochentag"
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
            aria-label="Uhrzeit"
            value={state.time}
            onChange={(event) => onChange({ ...state, time: event.target.value })}
            disabled={saving}
            className="dialog-field"
          />
          <CourseCapacityFields
            capacity={state.capacity}
            overbookLimit={state.overbookLimit}
            saving={saving}
            onCapacityChange={(capacity) => onChange({ ...state, capacity })}
            onOverbookLimitChange={(overbookLimit) => onChange({ ...state, overbookLimit })}
          />
          <select
            aria-label="Status"
            value={state.status}
            onChange={(event) => onChange({ ...state, status: event.target.value as CourseStatus })}
            disabled={saving}
            className="dialog-field"
          >
            {statusOptions.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Planungsmodus"
            value={state.planningMode}
            onChange={(event) =>
              onChange({
                ...state,
                planningMode: event.target.value as CoursePlanningMode,
              })
            }
            disabled={saving}
            className="dialog-field"
          >
            {planningModeOptions.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
          <p className="course-editor-inline-hint">{planningModeHint(state.planningMode)}</p>
          {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
        </div>
        <div className="modal-actions dialog-actions">
          <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary modal-action-btn" onClick={onSave} disabled={!canSubmit}>
            {saving ? "Speichere..." : "Anlegen"}
          </button>
        </div>
    </CourseModalFrame>
  );
}
