import type { KeyboardEvent, RefObject } from "react";
import type { CoursePlanningMode, CourseStatus } from "shared/types";
import CourseModalFrame from "./CourseModalFrame";
import CourseCapacityFields from "./CourseCapacityFields";
import TermDateSelect from "./TermDateSelect";

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
          <TermDateSelect
            aria-label="Wochentag"
            value={state.weekday}
            disabled={saving}
            className="dialog-field"
            options={weekdayOptions.map((weekday) => ({
              value: weekday.value,
              label: weekday.label,
            }))}
            onChange={(weekday) => onChange({ ...state, weekday })}
          />
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
          <TermDateSelect
            aria-label="Status"
            value={state.status}
            disabled={saving}
            className="dialog-field"
            options={statusOptions.map((status) => ({
              value: status.value,
              label: status.label,
            }))}
            onChange={(status) => onChange({ ...state, status: status as CourseStatus })}
          />
          <TermDateSelect
            aria-label="Planungsmodus"
            value={state.planningMode}
            disabled={saving}
            className="dialog-field"
            options={planningModeOptions.map((mode) => ({
              value: mode.value,
              label: mode.label,
            }))}
            onChange={(planningMode) =>
              onChange({
                ...state,
                planningMode: planningMode as CoursePlanningMode,
              })
            }
          />
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
