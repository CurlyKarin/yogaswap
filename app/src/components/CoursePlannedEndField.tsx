import { useMemo, useState } from "react";
import { Calendar } from "lucide-react";
import {
  formatPlannedEndLabel,
  getMinPlannedEndDateIso,
  isPlannedEndDateAllowed,
  PLANNED_END_CONSEQUENCE_HINT,
} from "shared/courseEditPolicy";
import {
  buildSeriesCalendarCells,
  compareIsoDate,
  formatIsoDateForDisplay,
  monthKeyFromIsoDate,
  shiftMonthKey,
  toMonthKey,
} from "./courseDatesDialogUtils";

type CoursePlannedEndFieldProps = {
  weekday: string;
  plannedEndDate: string | null;
  rollingPlanningHorizonWeeks: number;
  saving: boolean;
  onChange: (plannedEndDate: string | null) => void;
};

function addYearsToMonthKey(monthKey: string, years: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year + years}-${String(month).padStart(2, "0")}`;
}

export default function CoursePlannedEndField({
  weekday,
  plannedEndDate,
  rollingPlanningHorizonWeeks,
  saving,
  onChange,
}: CoursePlannedEndFieldProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() =>
    (plannedEndDate ? monthKeyFromIsoDate(plannedEndDate) : null) ?? toMonthKey(new Date()),
  );

  const minEndIso = useMemo(
    () => getMinPlannedEndDateIso(rollingPlanningHorizonWeeks),
    [rollingPlanningHorizonWeeks],
  );
  const maxEndIso = useMemo(() => {
    const farMonth = addYearsToMonthKey(toMonthKey(new Date()), 3);
    return `${farMonth}-28`;
  }, []);

  const calendarCells = useMemo(
    () =>
      buildSeriesCalendarCells(calendarMonth, weekday, minEndIso, maxEndIso, []),
    [calendarMonth, weekday, minEndIso, maxEndIso],
  );

  const calendarMonthLabel = useMemo(() => {
    const parsed = new Date(`${calendarMonth}-01T12:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return calendarMonth;
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(
      parsed,
    );
  }, [calendarMonth]);

  const toggleEndDate = (isoDate: string) => {
    if (!isPlannedEndDateAllowed(isoDate, rollingPlanningHorizonWeeks)) return;
    onChange(plannedEndDate === isoDate ? null : isoDate);
  };

  return (
    <div className="course-editor-subsection">
      <div className="course-editor-inline-row">
        <span className="dialog-field-label">Kursende</span>
        <strong>{formatPlannedEndLabel(plannedEndDate)}</strong>
      </div>
      <div className="course-editor-inline-row">
        <button
          type="button"
          className="modal-action-btn course-editor-icon-btn"
          onClick={() => setCalendarOpen((open) => !open)}
          disabled={saving}
          title={calendarOpen ? "Kalender ausblenden" : "Kursende planen"}
          aria-expanded={calendarOpen}
          aria-label="Kalender für geplantes Kursende"
        >
          <Calendar size={16} aria-hidden="true" />
        </button>
        <span className="course-editor-note">
          Ab {formatIsoDateForDisplay(minEndIso)} wählbar. Termin erneut tippen = unbefristet.
        </span>
      </div>

      {plannedEndDate && (
        <p className="course-editor-inline-hint">{PLANNED_END_CONSEQUENCE_HINT}</p>
      )}

      {calendarOpen && (
        <div className="course-editor-calendar-block" role="group" aria-label="Kalender Kursende">
          <div className="course-editor-calendar-nav">
            <button
              type="button"
              className="modal-action-btn course-editor-inline-action"
              onClick={() => setCalendarMonth((month) => shiftMonthKey(month, -1))}
              disabled={saving}
            >
              Vorheriger Monat
            </button>
            <strong>{calendarMonthLabel}</strong>
            <button
              type="button"
              className="modal-action-btn course-editor-inline-action"
              onClick={() => setCalendarMonth((month) => shiftMonthKey(month, 1))}
              disabled={saving}
            >
              Nächster Monat
            </button>
          </div>
          <div className="course-editor-calendar-weekdays" aria-hidden="true">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="course-editor-calendar-grid">
            {calendarCells.map((cell) => {
              const inLock =
                compareIsoDate(cell.isoDate, minEndIso) < 0;
              const isSelected = plannedEndDate === cell.isoDate;
              const cellClassName = [
                "course-editor-calendar-cell",
                cell.inCurrentMonth ? "" : "is-outside-month",
                cell.isSeriesDate ? "is-series-date" : "",
                isSelected ? "is-planned-end-date" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={`planned-end-${cell.isoDate}`}
                  type="button"
                  className={cellClassName}
                  aria-label={
                    isSelected ? `Kursende ${cell.isoDate} entfernen` : `Kursende ${cell.isoDate} setzen`
                  }
                  aria-pressed={isSelected}
                  onClick={() => toggleEndDate(cell.isoDate)}
                  disabled={!cell.isSeriesDate || saving || inLock}
                  title={
                    inLock
                      ? "Innerhalb der Planungssperre nicht wählbar"
                      : isSelected
                        ? "Kursende entfernen (unbefristet)"
                        : cell.isSeriesDate
                          ? "Als Kursende setzen"
                          : "Nur passende Wochentage wählbar"
                  }
                >
                  {cell.dayOfMonth}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
