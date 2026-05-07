import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Calendar } from "lucide-react";
import type { Course, CourseDateOverride, Swap } from "shared/types";
import { cancelCourseDate, updateCourse } from "../api/courses";
import CourseModalFrame from "./CourseModalFrame";
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
  getRollingExcludeSelectionRangeIso,
  getRollingWindowRangeIso,
  isValidIsoDateOnly,
  parseIsoDateOnlyUtc,
  planningModeLabel,
  shiftMonthKey,
  type CourseDatesEditorState,
} from "./courseDatesDialogUtils";
import { resolveWarningMessages } from "../i18n";

type CourseDatesDialogProps = {
  course: Course | null;
  overrides: CourseDateOverride[];
  swaps: Swap[];
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

function dedupeAndSortUsers(values: string[]): string[] {
  return Array.from(new Set(values.filter((entry) => entry.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

export default function CourseDatesDialog({
  course,
  overrides,
  swaps,
  canManageCourses,
  onClose,
  onSaved,
}: CourseDatesDialogProps) {
  const [datesState, setDatesState] = useState<CourseDatesEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotices, setFormNotices] = useState<string[]>([]);
  const [selectedCancellationDate, setSelectedCancellationDate] = useState<string | null>(null);
  const [impactDialogOpen, setImpactDialogOpen] = useState(false);
  const [rollbackOutgoingSwaps, setRollbackOutgoingSwaps] = useState(false);
  const [notifyAlreadyCancelledParticipants, setNotifyAlreadyCancelledParticipants] = useState(true);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!course) {
      setDatesState(null);
      setFormError(null);
      setFormNotices([]);
      return;
    }
    const nextState = createDatesState(course);
    if (course.status === "active" && nextState.planningMode === "bounded_series") {
      nextState.rangeDatePickerOpen = true;
    }
    setDatesState(nextState);
    setFormError(null);
    setFormNotices([]);
    setSelectedCancellationDate(null);
    setImpactDialogOpen(false);
    setRollbackOutgoingSwaps(false);
    setNotifyAlreadyCancelledParticipants(true);
  }, [course]);

  useLayoutEffect(() => {
    if (!course) return;
    if (!datesState) return;
    if (!modalRef.current) return;
    const active = document.activeElement as Node | null;
    if (active && modalRef.current.contains(active)) return;
    focusFirstElement(modalRef.current);
  }, [course, datesState]);

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
    datesState.visibilityHorizonWeeks >= DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS;
  const isActiveReadOnly =
    course?.status === "active" && datesState?.planningMode === "bounded_series";
  const isActiveCancellationMode = isActiveReadOnly;

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

  const fullSeriesDatesForActive = useMemo(() => {
    if (!datesState || datesState.planningMode !== "bounded_series") return [];
    return generatePreviewDates({ ...datesState, excludedDates: [] });
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

  const rollingExcludeLockRange = useMemo(() => {
    if (!datesState || datesState.planningMode !== "rolling_continuous") return null;
    return getRollingExcludeLockRangeIso(DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS);
  }, [datesState]);

  const rollingExcludeSelectionRange = useMemo(() => {
    if (!datesState || datesState.planningMode !== "rolling_continuous") return null;
    return getRollingExcludeSelectionRangeIso();
  }, [datesState]);

  const excludedCalendarCells = useMemo(() => {
    if (!datesState) return [];
    const exclusionRange =
      datesState.planningMode === "rolling_continuous"
        ? rollingExcludeSelectionRange
        : effectiveRange;
    if (!exclusionRange) return [];
    return buildSeriesCalendarCells(
      datesState.excludedCalendarMonth,
      datesState.weekday,
      exclusionRange.start,
      exclusionRange.end,
      datesState.excludedDates,
    );
  }, [datesState, effectiveRange, rollingExcludeSelectionRange]);

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
  const formattedFullSeriesDates = useMemo(
    () => fullSeriesDatesForActive.map((entry) => formatIsoDateForDisplay(entry, displayLocale)),
    [fullSeriesDatesForActive, displayLocale],
  );

  const cancellationImpact = useMemo(() => {
    if (!course || !selectedCancellationDate) return null;
    const overrideForDate =
      overrides.find((entry) => entry.courseId === course.id && entry.date === selectedCancellationDate) ?? null;
    const bookedParticipants = [...(overrideForDate?.participants ?? course.participants)];
    const swappedInParticipants = [...(overrideForDate?.swapped ?? [])];
    const waitlistParticipants = [...(overrideForDate?.waitlist ?? [])];
    const bookedSet = new Set(bookedParticipants);
    const alreadyCancelledParticipants = course.participants.filter((userId) => !bookedSet.has(userId));
    const cancelledSet = new Set(alreadyCancelledParticipants);
    const outgoingSwapsFromCancelledParticipants = swaps
      .filter(
        (swap) =>
          swap.fromCourseId === course.id &&
          swap.fromDate === selectedCancellationDate &&
          swap.status === "pending" &&
          cancelledSet.has(swap.user),
      )
      .map((swap) => swap.user);
    return {
      bookedParticipants,
      swappedInParticipants,
      waitlistParticipants,
      alreadyCancelledParticipants,
      outgoingSwapsFromCancelledParticipants: dedupeAndSortUsers(outgoingSwapsFromCancelledParticipants),
    };
  }, [course, overrides, selectedCancellationDate, swaps]);

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
                ? Math.max(numericValue, DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS)
                : DEFAULT_ROLLING_HORIZON_WEEKS,
          }
        : prev,
    );
    setFormError(null);
    setFormNotices([]);
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
    setFormNotices([]);
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
          ? getRollingExcludeSelectionRangeIso()
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

  const toggleCancellationDate = (isoDate: string) => {
    if (saving) return;
    if (!fullSeriesDatesForActive.includes(isoDate)) return;
    if (datesState?.excludedDates.includes(isoDate)) return;
    setSelectedCancellationDate((prev) => (prev === isoDate ? null : isoDate));
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            rangeDatePickerOpen: false,
          }
        : prev,
    );
    setFormError(null);
  };

  const openImpactDialog = () => {
    if (!selectedCancellationDate || !cancellationImpact) return;
    setImpactDialogOpen(true);
  };

  const closeImpactDialog = () => {
    if (saving) return;
    setImpactDialogOpen(false);
  };

  const submitCancellation = async () => {
    if (!course || !selectedCancellationDate) return;
    setSaving(true);
    setFormError(null);
    setFormNotices([]);
    try {
      const response = await cancelCourseDate(course.id, selectedCancellationDate, {
        rollbackOutgoingSwapsFromCancelledParticipants: rollbackOutgoingSwaps,
        notifyAlreadyCancelledParticipants,
      });
      setImpactDialogOpen(false);
      setSelectedCancellationDate(null);
      await onSaved();
      if (response.operationWarnings && response.operationWarnings.length > 0) {
        const localizedWarnings = resolveWarningMessages(response.operationWarnings, displayLocale);
        setFormNotices(
          localizedWarnings.length > 0
            ? localizedWarnings
            : ["Termin wurde abgesagt, aber es gab Hinweise bei Nebenoperationen."],
        );
        return;
      }
      onClose();
    } catch (err) {
      console.error("Failed to cancel course date", err);
      setFormError(err instanceof Error ? err.message : "Termin konnte nicht abgesagt werden.");
    } finally {
      setSaving(false);
    }
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
        setFormError(
          `Bitte mindestens ${DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS} Wochen für die Sichtbarkeit eingeben.`,
        );
        return;
      }
    } else {
      setFormError("Unbekannter Planungsmodus.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setFormNotices([]);
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
    <CourseModalFrame
      ariaLabel="Kurstermine bearbeiten"
      title="Termine verwalten"
      modalRef={modalRef}
      onKeyDown={(event) => {
        handleFocusTrap(event, modalRef);
      }}
    >
        <p className="course-editor-note">
          Kurs: <strong>{course.name}</strong>
        </p>
        <p className="course-editor-note">
          Planungsmodus: <strong>{planningModeLabel(course.planningMode)}</strong>
        </p>
        {isActiveReadOnly && (
          <p className="course-editor-note">
            Kurs ist aktiv. Terminplanung ist gesperrt.
          </p>
        )}
        <div className="dialog-stack">
          <div className="course-editor-subsection">
            <strong className="course-editor-list-title">
              Vorschau Termine ({isActiveCancellationMode ? fullSeriesDatesForActive.length : datesPreview.length})
            </strong>
            {(isActiveCancellationMode ? fullSeriesDatesForActive.length : datesPreview.length) === 0 ? (
              <p className="course-editor-note">Keine Termine im gewählten Zeitraum.</p>
            ) : (
              <p className="course-editor-comma-list">
                {(isActiveCancellationMode ? formattedFullSeriesDates : formattedPreviewDates).join(", ")}
              </p>
            )}
          </div>

          {isActiveCancellationMode ? (
            <div className="course-editor-subsection">
              <strong className="course-editor-list-title">Terminkalender zur Übersicht und Absage</strong>
              <p className="course-editor-note">
                Es werden alle geplanten Serientermine angezeigt. Ausgeschlossene Termine sind markiert und nicht
                auswählbar.
              </p>
              <div className="course-editor-inline-row">
                <button
                  type="button"
                  className="modal-action-btn course-editor-icon-btn"
                  onClick={toggleRangeDatePicker}
                  disabled={saving}
                  title={datesState.rangeDatePickerOpen ? "Kalender ausblenden" : "Kalender öffnen"}
                  aria-label="Kalender für Terminabsage öffnen"
                >
                  <Calendar size={16} aria-hidden="true" />
                </button>
                <span className="course-editor-note">Wähle genau einen Termin zur Absage.</span>
              </div>
              {datesState.rangeDatePickerOpen && (
                <div className="course-editor-calendar-block" role="group" aria-label="Kalender Terminabsage">
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
                      const isCancelledDate = datesState.excludedDates.includes(cell.isoDate);
                      const isSelectable = cell.isSeriesDate && !isCancelledDate;
                      const isSelected = selectedCancellationDate === cell.isoDate;
                      const cellClassName = [
                        "course-editor-calendar-cell",
                        cell.inCurrentMonth ? "" : "is-outside-month",
                        cell.isSeriesDate ? "is-series-date" : "",
                        isCancelledDate ? "is-excluded-date" : "",
                        isSelected ? "is-range-start" : "",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <button
                          key={`cancel-${cell.isoDate}`}
                          type="button"
                          className={cellClassName}
                          aria-label={`Absage Datum ${cell.isoDate}`}
                          onClick={() => toggleCancellationDate(cell.isoDate)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              toggleCancellationDate(cell.isoDate);
                            }
                          }}
                          disabled={!isSelectable || saving}
                          title={
                            isCancelledDate
                              ? "Termin ist bereits ausgeschlossen"
                              : isSelectable
                                ? "Termin für Absage auswählen"
                                : "Nur Serientermine auswählbar"
                          }
                        >
                          {cell.dayOfMonth}
                        </button>
                      );
                    })}
                  </div>
                  <div className="course-editor-calendar-legend">
                    <span><em className="legend-dot series" /> geplanter Termin</span>
                    <span><em className="legend-dot excluded" /> ausgeschlossen</span>
                    <span><em className="legend-dot boundary" /> ausgewählt</span>
                  </div>
                </div>
              )}
              <p className="course-editor-note">
                Ausgewählter Termin:{" "}
                <strong>
                  {selectedCancellationDate
                    ? formatIsoDateForDisplay(selectedCancellationDate, displayLocale)
                    : "Keiner ausgewählt"}
                </strong>
              </p>
            </div>
          ) : datesState.planningMode === "bounded_series" ? (
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
                  min={DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS}
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

          {!isActiveCancellationMode && (
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
                  ? `Ausnahmen sind langfristig planbar; innerhalb der nächsten ${DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS} Wochen nur Absage.`
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
          )}

          {!isActiveCancellationMode && (
            <div className="course-editor-subsection">
              {datesState.excludedDates.length === 0 ? (
                <p className="course-editor-note">Keine ausgeschlossenen Termine.</p>
              ) : (
                <p className="course-editor-comma-list">{formattedExcludedDates.join(", ")}</p>
              )}
            </div>
          )}

        </div>
        {formNotices.length > 0 && (
          <div style={{ color: "#8a6d1d", margin: 0 }}>
            <p style={{ margin: 0 }}>
              Termin wurde abgesagt, aber es gab Hinweise bei Nebenoperationen:
            </p>
            <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
              {formNotices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </div>
        )}
        {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
        {isActiveCancellationMode && impactDialogOpen && cancellationImpact && (
          <div className="course-editor-subsection" role="group" aria-label="Auswirkungsprüfung Terminabsage">
            <strong className="course-editor-list-title">
              Auswirkungen für {selectedCancellationDate ? formatIsoDateForDisplay(selectedCancellationDate, displayLocale) : ""}
            </strong>
            <p className="course-editor-note">Bitte prüfe die betroffenen Gruppen vor dem Absagen.</p>
            <p className="course-editor-note">
              Gebucht: <strong>{cancellationImpact.bookedParticipants.length}</strong>
              {" | "}Reingetauscht: <strong>{cancellationImpact.swappedInParticipants.length}</strong>
              {" | "}Warteliste: <strong>{cancellationImpact.waitlistParticipants.length}</strong>
              {" | "}Bereits abgesagt: <strong>{cancellationImpact.alreadyCancelledParticipants.length}</strong>
            </p>
            <label className="course-editor-note" style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={rollbackOutgoingSwaps}
                onChange={(event) => setRollbackOutgoingSwaps(event.target.checked)}
                disabled={saving}
              />{" "}
              Ausgehende Tauschanfragen bereits abgesagter Teilnehmer für diesen Ursprungstermin zurückrollen
              ({cancellationImpact.outgoingSwapsFromCancelledParticipants.length})
            </label>
            <label className="course-editor-note" style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={notifyAlreadyCancelledParticipants}
                onChange={(event) => setNotifyAlreadyCancelledParticipants(event.target.checked)}
                disabled={saving}
              />{" "}
              Bereits abgesagte Teilnehmer zusätzlich informieren
            </label>
            <div className="modal-actions">
              <button type="button" className="modal-action-btn" onClick={closeImpactDialog} disabled={saving}>
                Zurück
              </button>
              <button type="button" className="btn-primary modal-action-btn" onClick={submitCancellation} disabled={saving}>
                {saving ? "Sende..." : "Termin jetzt absagen"}
              </button>
            </div>
          </div>
        )}
        <div className="modal-actions">
          {isActiveCancellationMode ? (
            <>
              <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={openImpactDialog}
                disabled={!selectedCancellationDate || saving || impactDialogOpen || !cancellationImpact}
              >
                Absage überprüfen
              </button>
            </>
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
    </CourseModalFrame>
  );
}
