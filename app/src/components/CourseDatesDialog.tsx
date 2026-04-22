import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Calendar } from "lucide-react";
import type { Course } from "shared/types";
import { updateCourse } from "../api/courses";
import {
  DEFAULT_ROLLING_HORIZON_WEEKS,
  DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS,
  WEEKDAY_ORDER,
  buildSeriesCalendarCells,
  compareIsoDate,
  createDatesState,
  dedupeAndSortDates,
  formatIsoDateForDisplay,
  formatMonthLabel,
  generatePreviewDates,
  getRollingExcludeLockRangeIso,
  getRollingWindowRangeIso,
  isValidIsoDateOnly,
  parseIsoDateOnlyUtc,
  planningModeLabel,
  shiftMonthKey,
  type CourseDatesEditorState,
} from "./courseDatesDialogUtils";

type CourseDatesDialogProps = {
  course: Course | null;
  canManageCourses: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function focusFirstElement(node: HTMLElement): void {
  const focusables = getFocusableElements(node);
  if (focusables.length > 0) {
    focusables[0].focus();
    return;
  }
  node.focus();
}

export default function CourseDatesDialog({ course, canManageCourses, onClose, onSaved }: CourseDatesDialogProps) {
  const [datesState, setDatesState] = useState<CourseDatesEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!course) {
      setDatesState(null);
      setFormError(null);
      return;
    }
    setDatesState(createDatesState(course));
    setFormError(null);
  }, [course]);

  useEffect(() => {
    if (!course) return;
    if (!modalRef.current) return;
    focusFirstElement(modalRef.current);
  }, [course]);

  useEffect(() => {
    if (!course) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [course, saving, onClose]);

  const handleFocusTrap = (event: KeyboardEvent<HTMLDivElement>, modalNodeRef: RefObject<HTMLDivElement | null>) => {
    if (event.key !== "Tab") return;
    const modalNode = modalNodeRef.current;
    if (!modalNode) return;
    event.preventDefault();
    const focusables = getFocusableElements(modalNode);
    if (focusables.length === 0) {
      modalNode.focus();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? focusables.indexOf(active) : -1;
    if (currentIndex === -1) {
      focusables[0].focus();
      return;
    }
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusables.length) % focusables.length
      : (currentIndex + 1) % focusables.length;
    focusables[nextIndex].focus();
  };

  const datesSeriesRangeValid =
    !!datesState &&
    isValidIsoDateOnly(datesState.seriesStartDate) &&
    isValidIsoDateOnly(datesState.seriesEndDate) &&
    compareIsoDate(datesState.seriesStartDate, datesState.seriesEndDate) <= 0;
  const rollingHorizonValid =
    !!datesState &&
    Number.isInteger(datesState.visibilityHorizonWeeks) &&
    datesState.visibilityHorizonWeeks > 0;
  const isActiveReadOnly =
    course?.status === "active" && datesState?.planningMode === "bounded_series";

  const canSaveDatesConfig =
    canManageCourses &&
    !isActiveReadOnly &&
    !saving &&
    !!datesState &&
    (
      (datesState.planningMode === "bounded_series" && datesSeriesRangeValid) ||
      (datesState.planningMode === "rolling_continuous" && rollingHorizonValid)
    );

  const datesPreview = useMemo(() => {
    if (!datesState) return [];
    return generatePreviewDates(datesState);
  }, [datesState]);

  const displayLocale =
    typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language
      ? navigator.language
      : "de-DE";

  const effectiveRange = useMemo(() => {
    if (!datesState) return null;
    if (datesState.planningMode === "rolling_continuous") {
      return getRollingWindowRangeIso(datesState.visibilityHorizonWeeks);
    }
    return {
      start: datesState.seriesStartDate,
      end: datesState.seriesEndDate,
    };
  }, [datesState]);

  const rangeCalendarCells = useMemo(() => {
    if (!datesState || !effectiveRange) return [];
    return buildSeriesCalendarCells(
      datesState.rangeCalendarMonth,
      datesState.weekday,
      effectiveRange.start,
      effectiveRange.end,
      datesState.excludedDates,
    );
  }, [datesState, effectiveRange]);

  const rangeCalendarMonthLabel = useMemo(() => {
    if (!datesState) return "";
    return formatMonthLabel(datesState.rangeCalendarMonth, displayLocale);
  }, [datesState, displayLocale]);

  const excludedCalendarCells = useMemo(() => {
    if (!datesState || !effectiveRange) return [];
    return buildSeriesCalendarCells(
      datesState.excludedCalendarMonth,
      datesState.weekday,
      effectiveRange.start,
      effectiveRange.end,
      datesState.excludedDates,
    );
  }, [datesState, effectiveRange]);

  const rollingExcludeLockRange = useMemo(() => {
    if (!datesState || datesState.planningMode !== "rolling_continuous") return null;
    return getRollingExcludeLockRangeIso(DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS);
  }, [datesState]);

  const excludedCalendarMonthLabel = useMemo(() => {
    if (!datesState) return "";
    return formatMonthLabel(datesState.excludedCalendarMonth, displayLocale);
  }, [datesState, displayLocale]);

  const formattedSeriesStart = datesState ? formatIsoDateForDisplay(datesState.seriesStartDate, displayLocale) : "";
  const formattedSeriesEnd = datesState ? formatIsoDateForDisplay(datesState.seriesEndDate, displayLocale) : "";
  const formattedEffectiveRangeStart = effectiveRange
    ? formatIsoDateForDisplay(effectiveRange.start, displayLocale)
    : "";
  const formattedEffectiveRangeEnd = effectiveRange
    ? formatIsoDateForDisplay(effectiveRange.end, displayLocale)
    : "";
  const formattedExcludedDates = useMemo(() => {
    if (!datesState) return [];
    return datesState.excludedDates.map((entry) => formatIsoDateForDisplay(entry, displayLocale));
  }, [datesState, displayLocale]);
  const formattedPreviewDates = useMemo(
    () => datesPreview.map((entry) => formatIsoDateForDisplay(entry, displayLocale)),
    [datesPreview, displayLocale],
  );

  const toggleRangeDatePicker = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            rangeDatePickerOpen: !prev.rangeDatePickerOpen,
            excludedDatePickerOpen: false,
          }
        : prev,
    );
  };

  const closeRangeDatePicker = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            rangeDatePickerOpen: false,
          }
        : prev,
    );
  };

  const toggleExcludedDatePicker = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            excludedDatePickerOpen: !prev.excludedDatePickerOpen,
            rangeDatePickerOpen: false,
          }
        : prev,
    );
  };

  const closeExcludedDatePicker = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            excludedDatePickerOpen: false,
          }
        : prev,
    );
  };

  const setRollingHorizonWeeks = (value: string) => {
    if (saving || isActiveReadOnly) return;
    const numericValue = Number.parseInt(value, 10);
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            visibilityHorizonWeeks:
              Number.isInteger(numericValue) && numericValue > 0
                ? numericValue
                : DEFAULT_ROLLING_HORIZON_WEEKS,
          }
        : prev,
    );
    setFormError(null);
  };

  const setSeriesRangeDate = (isoDate: string) => {
    if (saving || isActiveReadOnly) return;
    if (!isValidIsoDateOnly(isoDate)) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const target = prev.rangeSelectionTarget;
      let nextStart = prev.seriesStartDate;
      let nextEnd = prev.seriesEndDate;
      if (target === "start") {
        nextStart = isoDate;
        nextEnd = isoDate;
      } else {
        nextEnd = isoDate;
        if (compareIsoDate(nextStart, nextEnd) > 0) {
          const previousStart = nextStart;
          nextStart = nextEnd;
          nextEnd = previousStart;
        }
      }
      return {
        ...prev,
        seriesStartDate: nextStart,
        seriesEndDate: nextEnd,
        rangeSelectionTarget: target === "start" ? "end" : "start",
      };
    });
    setFormError(null);
  };

  const shiftRangeCalendarMonth = (monthDelta: number) => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            rangeCalendarMonth: shiftMonthKey(prev.rangeCalendarMonth, monthDelta),
          }
        : prev,
    );
  };

  const shiftExcludedCalendarMonth = (monthDelta: number) => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            excludedCalendarMonth: shiftMonthKey(prev.excludedCalendarMonth, monthDelta),
          }
        : prev,
    );
  };

  const toggleExcludedDateFromCalendar = (isoDate: string) => {
    if (saving || isActiveReadOnly) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const currentRange =
        prev.planningMode === "rolling_continuous"
          ? getRollingWindowRangeIso(prev.visibilityHorizonWeeks)
          : { start: prev.seriesStartDate, end: prev.seriesEndDate };
      const inSeriesRange =
        compareIsoDate(isoDate, currentRange.start) >= 0 && compareIsoDate(isoDate, currentRange.end) <= 0;
      const weekdayIndex = WEEKDAY_ORDER[prev.weekday];
      const date = parseIsoDateOnlyUtc(isoDate);
      const isSeriesWeekday =
        !!date && !!weekdayIndex && weekdayIndex >= 1 && weekdayIndex <= 7 && date.getUTCDay() === weekdayIndex % 7;
      const rollingLocked =
        prev.planningMode === "rolling_continuous" &&
        !!rollingExcludeLockRange &&
        compareIsoDate(isoDate, rollingExcludeLockRange.start) >= 0 &&
        compareIsoDate(isoDate, rollingExcludeLockRange.end) <= 0;
      if (!inSeriesRange || !isSeriesWeekday) {
        return prev;
      }
      if (rollingLocked) return prev;
      const hasExcludedDate = prev.excludedDates.includes(isoDate);
      return {
        ...prev,
        excludedDates: hasExcludedDate
          ? prev.excludedDates.filter((entry) => entry !== isoDate)
          : dedupeAndSortDates([...prev.excludedDates, isoDate]),
      };
    });
    setFormError(null);
  };

  const saveDatesConfig = async () => {
    if (!datesState || !canManageCourses || isActiveReadOnly) return;
    if (datesState.planningMode === "bounded_series") {
      if (!datesSeriesRangeValid) {
        setFormError("Bitte einen gültigen Zeitraum mit Start- und Enddatum wählen.");
        return;
      }
    } else if (datesState.planningMode === "rolling_continuous") {
      if (!rollingHorizonValid) {
        setFormError("Bitte eine gültige Anzahl Wochen für die Sichtbarkeit eingeben.");
        return;
      }
    } else {
      setFormError("Unbekannter Planungsmodus.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (datesState.planningMode === "rolling_continuous") {
        await updateCourse(datesState.courseId, {
          planningMode: "rolling_continuous",
          visibilityMode: "rolling_horizon",
          visibilityHorizonWeeks: datesState.visibilityHorizonWeeks,
          excludedDates: datesState.excludedDates,
          includedDates: [],
        });
      } else {
        await updateCourse(datesState.courseId, {
          planningMode: "bounded_series",
          visibilityMode: "fixed_window",
          seriesStartDate: datesState.seriesStartDate,
          seriesEndDate: datesState.seriesEndDate,
          visibleFrom: datesState.seriesStartDate,
          visibleUntil: datesState.seriesEndDate,
          excludedDates: datesState.excludedDates,
          includedDates: [],
        });
      }
      onClose();
      await onSaved();
    } catch (err) {
      console.error("Failed to update course dates configuration", err);
      setFormError(err instanceof Error ? err.message : "Terminkonfiguration konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  if (!course || !datesState) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Kurstermine bearbeiten"
      onKeyDown={(event) => {
        handleFocusTrap(event, modalRef);
      }}
    >
      <div className="modal modal-compact" ref={modalRef} tabIndex={-1}>
        <h4>Termine verwalten</h4>
        <p className="course-editor-note">
          Kurs: <strong>{course.name}</strong>
        </p>
        <p className="course-editor-note">
          Planungsmodus: <strong>{planningModeLabel(course.planningMode)}</strong>
        </p>
        {isActiveReadOnly && (
          <p className="course-editor-note">
            Kurs ist aktiv. Terminplanung ist gesperrt. Änderungen erfolgen über Terminabsage.
          </p>
        )}
        <div className="dialog-stack">
          {datesState.planningMode === "bounded_series" ? (
            <div className="course-editor-subsection">
              <strong className="course-editor-list-title">Zeitraum</strong>
              <p className="course-editor-note">
                Start: <strong aria-label="Startdatum Wert">{formattedSeriesStart}</strong> | Ende:{" "}
                <strong aria-label="Enddatum Wert">{formattedSeriesEnd}</strong>
              </p>
              <div className="course-editor-inline-row">
                <button
                  type="button"
                  className="modal-action-btn course-editor-icon-btn"
                  onClick={toggleRangeDatePicker}
                  disabled={saving}
                  title={datesState.rangeDatePickerOpen ? "Kalender ausblenden" : "Kalender öffnen"}
                  aria-label="Kalender für Zeitraum öffnen"
                >
                  <Calendar size={16} aria-hidden="true" />
                </button>
                <span className="course-editor-note">
                  {isActiveReadOnly ? "Kalenderansicht (nur lesen)." : "Wähle einen Zeitraum."}
                </span>
              </div>
              {datesState.rangeDatePickerOpen && (
                <div className="course-editor-calendar-block" role="group" aria-label="Kalender Zeitraum">
                  <div className="course-editor-calendar-nav">
                    <button
                      type="button"
                      className="modal-action-btn course-editor-inline-action"
                      onClick={() => shiftRangeCalendarMonth(-1)}
                      disabled={saving}
                    >
                      Vorheriger Monat
                    </button>
                    <strong>{rangeCalendarMonthLabel}</strong>
                    <button
                      type="button"
                      className="modal-action-btn course-editor-inline-action"
                      onClick={() => shiftRangeCalendarMonth(1)}
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
                    {rangeCalendarCells.map((cell) => {
                      const cellClassName = [
                        "course-editor-calendar-cell",
                        cell.inCurrentMonth ? "" : "is-outside-month",
                        cell.inSeriesRange ? "is-in-range" : "",
                        cell.isRangeStart ? "is-range-start" : "",
                        cell.isRangeEnd ? "is-range-end" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          key={cell.isoDate}
                          type="button"
                          className={cellClassName}
                          aria-label={`Datum ${cell.isoDate}`}
                          onClick={() => setSeriesRangeDate(cell.isoDate)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              setSeriesRangeDate(cell.isoDate);
                            }
                          }}
                          disabled={saving || isActiveReadOnly}
                          title={isActiveReadOnly ? "Nur Ansicht im aktiven Kurs" : "Klick: Start/Ende setzen"}
                        >
                          {cell.dayOfMonth}
                        </button>
                      );
                    })}
                  </div>
                  <div className="course-editor-calendar-legend">
                    <span><em className="legend-dot range" /> Zeitraum</span>
                    <span><em className="legend-dot boundary" /> Start/Ende</span>
                  </div>
                  <div className="course-editor-calendar-actions">
                    <button
                      type="button"
                      className="modal-action-btn course-editor-inline-action"
                      onClick={closeRangeDatePicker}
                      disabled={saving}
                    >
                      Kalender schließen
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="course-editor-subsection">
              <strong className="course-editor-list-title">Sichtfenster</strong>
              <p className="course-editor-note">
                Von heute ({formattedEffectiveRangeStart}) bis {formattedEffectiveRangeEnd}
              </p>
              <div className="course-editor-inline-row">
                <label htmlFor="rolling-horizon-weeks" className="course-editor-note">
                  Sichtbarkeit in Wochen
                </label>
                <input
                  id="rolling-horizon-weeks"
                  type="number"
                  min={1}
                  step={1}
                  value={datesState.visibilityHorizonWeeks}
                  onChange={(event) => setRollingHorizonWeeks(event.target.value)}
                  aria-label="Sichtfenster Wochen"
                  disabled={saving || isActiveReadOnly}
                  className="dialog-field"
                  style={{ width: 96 }}
                />
              </div>
            </div>
          )}

          <div className="course-editor-subsection">
            <strong className="course-editor-list-title">Ausgeschlossene Termin</strong>
            <div className="course-editor-inline-row">
              <button
                type="button"
                className="modal-action-btn course-editor-icon-btn"
                onClick={toggleExcludedDatePicker}
                disabled={saving}
                title={datesState.excludedDatePickerOpen ? "Kalender ausblenden" : "Kalender öffnen"}
                aria-label="Kalender für Ausnahmetermin öffnen"
              >
                <Calendar size={16} aria-hidden="true" />
              </button>
              <span className="course-editor-note">
                {datesState.planningMode === "rolling_continuous"
                  ? `Nur Termine außerhalb der nächsten ${DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS} Wochen sind als Ausnahme wählbar.`
                  : "Nur Serientermine im Zeitraum sind wählbar."}
              </span>
            </div>
              <p className="course-editor-mobile-hint">
                Mobile: Tippen auf markierten Termin setzt/entfernt eine Ausnahme.
              </p>
              {datesState.excludedDatePickerOpen && (
                <div className="course-editor-calendar-block" role="group" aria-label="Kalender Ausnahmetermine">
                  <div className="course-editor-calendar-nav">
                    <button
                      type="button"
                      className="modal-action-btn course-editor-inline-action"
                      onClick={() => shiftExcludedCalendarMonth(-1)}
                      disabled={saving}
                    >
                      Vorheriger Monat
                    </button>
                    <strong>{excludedCalendarMonthLabel}</strong>
                    <button
                      type="button"
                      className="modal-action-btn course-editor-inline-action"
                      onClick={() => shiftExcludedCalendarMonth(1)}
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
                    {excludedCalendarCells.map((cell) => {
                      const rollingLocked =
                        datesState.planningMode === "rolling_continuous" &&
                        !!rollingExcludeLockRange &&
                        compareIsoDate(cell.isoDate, rollingExcludeLockRange.start) >= 0 &&
                        compareIsoDate(cell.isoDate, rollingExcludeLockRange.end) <= 0;
                      const cellClassName = [
                        "course-editor-calendar-cell",
                        cell.inCurrentMonth ? "" : "is-outside-month",
                        cell.isSeriesDate ? "is-series-date" : "",
                        cell.isExcluded ? "is-excluded-date" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          key={`excluded-${cell.isoDate}`}
                          type="button"
                          className={cellClassName}
                          aria-label={`Ausnahme Datum ${cell.isoDate}`}
                          onClick={() => toggleExcludedDateFromCalendar(cell.isoDate)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              toggleExcludedDateFromCalendar(cell.isoDate);
                            }
                          }}
                          disabled={!cell.isSeriesDate || saving || isActiveReadOnly || rollingLocked}
                          title={
                            isActiveReadOnly
                              ? "Nur Ansicht im aktiven Kurs"
                              : rollingLocked
                                ? `Innerhalb der nächsten ${DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS} Wochen nur Absage möglich`
                                : (cell.isSeriesDate ? "Als Ausnahme setzen/entfernen" : "Nur Serientermine auswählbar")
                          }
                        >
                          {cell.dayOfMonth}
                        </button>
                      );
                    })}
                  </div>
                  <div className="course-editor-calendar-legend">
                    <span><em className="legend-dot series" /> Serientermin</span>
                    <span><em className="legend-dot excluded" /> ausgeschlossen</span>
                  </div>
                  <div className="course-editor-calendar-actions">
                    <button
                      type="button"
                      className="modal-action-btn course-editor-inline-action"
                      onClick={closeExcludedDatePicker}
                      disabled={saving}
                    >
                      Kalender schließen
                    </button>
                  </div>
                </div>
              )}
          </div>

          <div className="course-editor-subsection">
            {datesState.excludedDates.length === 0 ? (
              <p className="course-editor-note">Keine ausgeschlossenen Termine.</p>
            ) : (
              <p className="course-editor-comma-list">{formattedExcludedDates.join(", ")}</p>
            )}
          </div>

          <div className="course-editor-subsection">
            <strong className="course-editor-list-title">Vorschau Termine ({datesPreview.length})</strong>
            {datesPreview.length === 0 ? (
              <p className="course-editor-note">Keine Termine im gewählten Zeitraum.</p>
            ) : (
              <p className="course-editor-comma-list">{formattedPreviewDates.join(", ")}</p>
            )}
          </div>
        </div>
        {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
        <div className="modal-actions">
          {isActiveReadOnly ? (
            <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
              Schließen
            </button>
          ) : (
            <>
              <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveDatesConfig}
                disabled={!canSaveDatesConfig}
              >
                {saving ? "Speichere..." : "Termine übernehmen"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
