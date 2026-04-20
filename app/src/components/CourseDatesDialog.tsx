import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Calendar } from "lucide-react";
import type { Course, CoursePlanningMode } from "shared/types";
import { updateCourse } from "../api/courses";

type CourseDatesDialogProps = {
  course: Course | null;
  canManageCourses: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type CourseDatesEditorState = {
  courseId: number;
  weekday: string;
  planningMode: CoursePlanningMode;
  seriesStartDate: string;
  seriesEndDate: string;
  excludedDates: string[];
  rangeCalendarMonth: string;
  excludedCalendarMonth: string;
  rangeDatePickerOpen: boolean;
  excludedDatePickerOpen: boolean;
  rangeSelectionTarget: "start" | "end";
};

type CalendarCell = {
  isoDate: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  inSeriesRange: boolean;
  isSeriesDate: boolean;
  isExcluded: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
};

const WEEKDAY_ORDER: Record<string, number> = {
  Mon: 1,
  Monday: 1,
  Tue: 2,
  Tuesday: 2,
  Wed: 3,
  Wednesday: 3,
  Thu: 4,
  Thursday: 4,
  Fri: 5,
  Friday: 5,
  Sat: 6,
  Saturday: 6,
  Sun: 7,
  Sunday: 7,
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

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isValidIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function dedupeAndSortDates(values: string[]): string[] {
  return Array.from(new Set(values.filter(isValidIsoDateOnly))).sort(compareIsoDate);
}

function buildDefaultSeriesWindow(): { start: string; end: string } {
  const today = new Date();
  return {
    start: toIsoDateOnly(today),
    end: toIsoDateOnly(addDays(today, 84)),
  };
}

function parseIsoDateOnlyUtc(value: string): Date | null {
  if (!isValidIsoDateOnly(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDateOnly(parsed) === value ? parsed : null;
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromIsoDate(value: string): string | null {
  const parsed = parseIsoDateOnlyUtc(value);
  if (!parsed) return null;
  return toMonthKey(parsed);
}

function parseMonthKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}-01T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function shiftMonthKey(value: string, monthDelta: number): string {
  const parsed = parseMonthKey(value);
  if (!parsed) return value;
  parsed.setUTCMonth(parsed.getUTCMonth() + monthDelta);
  return toMonthKey(parsed);
}

function formatMonthLabel(monthKey: string, locale?: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function formatIsoDateForDisplay(isoDate: string, locale?: string): string {
  const parsed = parseIsoDateOnlyUtc(isoDate);
  if (!parsed) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

function buildSeriesCalendarCells(
  monthKey: string,
  weekday: string,
  rangeStartIso: string,
  rangeEndIso: string,
  excludedDates: string[],
): CalendarCell[] {
  const monthStart = parseMonthKey(monthKey);
  const rangeStart = parseIsoDateOnlyUtc(rangeStartIso);
  const rangeEnd = parseIsoDateOnlyUtc(rangeEndIso);
  if (!monthStart || !rangeStart || !rangeEnd) return [];
  const normalizedRangeStart = toIsoDateOnly(rangeStart);
  const normalizedRangeEnd = toIsoDateOnly(rangeEnd);
  if (compareIsoDate(normalizedRangeStart, normalizedRangeEnd) > 0) return [];

  const weekdayIndex = WEEKDAY_ORDER[weekday];
  if (!weekdayIndex || weekdayIndex < 1 || weekdayIndex > 7) return [];
  const jsWeekday = weekdayIndex % 7;

  monthStart.setUTCDate(1);
  const offsetToMonday = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = addDaysUtc(monthStart, -offsetToMonday);
  const currentMonth = toMonthKey(monthStart);
  const excludedSet = new Set(dedupeAndSortDates(excludedDates));

  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = addDaysUtc(gridStart, index);
    const isoDate = toIsoDateOnly(current);
    const inSeriesRange =
      compareIsoDate(isoDate, normalizedRangeStart) >= 0 && compareIsoDate(isoDate, normalizedRangeEnd) <= 0;
    const isSeriesDate = inSeriesRange && current.getUTCDay() === jsWeekday;
    cells.push({
      isoDate,
      dayOfMonth: current.getUTCDate(),
      inCurrentMonth: toMonthKey(current) === currentMonth,
      inSeriesRange,
      isSeriesDate,
      isExcluded: excludedSet.has(isoDate),
      isRangeStart: isoDate === normalizedRangeStart,
      isRangeEnd: isoDate === normalizedRangeEnd,
    });
  }
  return cells;
}

function generateSeriesPreviewDates(weekday: string, startDate: string, endDate: string, excludedDates: string[]): string[] {
  if (!isValidIsoDateOnly(startDate) || !isValidIsoDateOnly(endDate) || compareIsoDate(startDate, endDate) > 0) {
    return [];
  }
  const weekdayIndex = WEEKDAY_ORDER[weekday];
  if (!weekdayIndex || weekdayIndex < 1 || weekdayIndex > 7) return [];
  const jsWeekday = weekdayIndex % 7;
  const excluded = new Set(dedupeAndSortDates(excludedDates));

  const start = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  const preview: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (cursor.getUTCDay() !== jsWeekday) continue;
    const iso = toIsoDateOnly(cursor);
    if (!excluded.has(iso)) {
      preview.push(iso);
    }
  }
  return preview;
}

function planningModeLabel(mode: CoursePlanningMode | undefined): string {
  if (mode === "rolling_continuous") return "Durchlaufend (rollend)";
  return "Kursblock (fixes Fenster)";
}

function createDatesState(course: Course): CourseDatesEditorState {
  const defaults = buildDefaultSeriesWindow();
  const initialStart = course.seriesStartDate ?? defaults.start;
  return {
    courseId: course.id,
    weekday: course.weekday,
    planningMode: course.planningMode ?? "bounded_series",
    seriesStartDate: initialStart,
    seriesEndDate: course.seriesEndDate ?? defaults.end,
    excludedDates: dedupeAndSortDates(course.excludedDates ?? []),
    rangeCalendarMonth: monthKeyFromIsoDate(initialStart) ?? toMonthKey(new Date()),
    excludedCalendarMonth: monthKeyFromIsoDate(initialStart) ?? toMonthKey(new Date()),
    rangeDatePickerOpen: false,
    excludedDatePickerOpen: false,
    rangeSelectionTarget: "start",
  };
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

  const canSaveDatesConfig =
    canManageCourses &&
    !saving &&
    !!datesState &&
    datesState.planningMode === "bounded_series" &&
    datesSeriesRangeValid;

  const datesPreview = useMemo(() => {
    if (!datesState) return [];
    return generateSeriesPreviewDates(
      datesState.weekday,
      datesState.seriesStartDate,
      datesState.seriesEndDate,
      datesState.excludedDates,
    );
  }, [datesState]);

  const displayLocale =
    typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language
      ? navigator.language
      : "de-DE";

  const rangeCalendarCells = useMemo(() => {
    if (!datesState) return [];
    return buildSeriesCalendarCells(
      datesState.rangeCalendarMonth,
      datesState.weekday,
      datesState.seriesStartDate,
      datesState.seriesEndDate,
      datesState.excludedDates,
    );
  }, [datesState]);

  const rangeCalendarMonthLabel = useMemo(() => {
    if (!datesState) return "";
    return formatMonthLabel(datesState.rangeCalendarMonth, displayLocale);
  }, [datesState, displayLocale]);

  const excludedCalendarCells = useMemo(() => {
    if (!datesState) return [];
    return buildSeriesCalendarCells(
      datesState.excludedCalendarMonth,
      datesState.weekday,
      datesState.seriesStartDate,
      datesState.seriesEndDate,
      datesState.excludedDates,
    );
  }, [datesState]);

  const excludedCalendarMonthLabel = useMemo(() => {
    if (!datesState) return "";
    return formatMonthLabel(datesState.excludedCalendarMonth, displayLocale);
  }, [datesState, displayLocale]);

  const formattedSeriesStart = datesState ? formatIsoDateForDisplay(datesState.seriesStartDate, displayLocale) : "";
  const formattedSeriesEnd = datesState ? formatIsoDateForDisplay(datesState.seriesEndDate, displayLocale) : "";
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

  const setSeriesRangeDate = (isoDate: string) => {
    if (saving) return;
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
    if (saving) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const inSeriesRange =
        compareIsoDate(isoDate, prev.seriesStartDate) >= 0 && compareIsoDate(isoDate, prev.seriesEndDate) <= 0;
      const weekdayIndex = WEEKDAY_ORDER[prev.weekday];
      const date = parseIsoDateOnlyUtc(isoDate);
      const isSeriesWeekday =
        !!date && !!weekdayIndex && weekdayIndex >= 1 && weekdayIndex <= 7 && date.getUTCDay() === weekdayIndex % 7;
      if (!inSeriesRange || !isSeriesWeekday) {
        return prev;
      }
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
    if (!datesState || !canManageCourses) return;
    if (datesState.planningMode !== "bounded_series") {
      setFormError("Terminverwaltung v1 unterstützt aktuell nur Serienplanung.");
      return;
    }
    if (!datesSeriesRangeValid) {
      setFormError("Bitte einen gültigen Zeitraum mit Start- und Enddatum wählen.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
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
        {datesState.planningMode !== "bounded_series" ? (
          <p className="course-editor-note">
            Terminverwaltung v1 unterstützt aktuell nur Serienplanung. Bitte den Planungsmodus in den
            Kurs-Einstellungen auf Serienplanung setzen.
          </p>
        ) : (
          <div className="dialog-stack">
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
                <span className="course-editor-note">Wähle einen Zeitraum.</span>
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
                          disabled={saving}
                          title="Klick: Start/Ende setzen"
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
                <span className="course-editor-note">Nur Serientermine im Zeitraum sind wählbar.</span>
              </div>
              <p className="course-editor-mobile-hint">
                Mobile: Tippen auf Serientermin setzt/entfernt eine Ausnahme.
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
                          disabled={!cell.isSeriesDate || saving}
                          title={cell.isSeriesDate ? "Als Ausnahme setzen/entfernen" : "Nur Serientermine auswählbar"}
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
        )}
        {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
        <div className="modal-actions">
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
        </div>
      </div>
    </div>
  );
}
