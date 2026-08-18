import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { Calendar } from "lucide-react";
import type { Course, CourseDateOverride, CourseEnrollment, Swap, TenantSettings } from "shared/types";
import { resolveRollingPlanningHorizonWeeks } from "shared/tenantSettings";
import { resolveEffectiveTermOccupancy, resolveStemForDate } from "shared/courseEnrollment";
import { cancelCourseDate, updateCourse } from "../api/courses";
import CourseModalFrame from "./CourseModalFrame";
import {
  WEEKDAY_ORDER,
  buildSeriesCalendarCells,
  compareIsoDate,
  createDatesState,
  dedupeAndSortDates,
  formatIsoDateForDisplay,
  formatMonthLabel,
  generatePreviewDates,
  getRollingAdminPlanningRangeIso,
  getRollingWindowRangeIso,
  ROLLING_ADMIN_PLANNING_PREVIEW_WEEKS,
  isValidIsoDateOnly,
  monthKeyFromIsoDate,
  parseIsoDateOnlyUtc,
  planningModeLabel,
  shiftMonthKey,
  type CalendarCell,
  type CourseDatesEditorState,
} from "./courseDatesDialogUtils";
import {
  getBoundedSeriesRangeEditBounds,
  validateBoundedSeriesRangeEdit,
  type BoundedSeriesRangeEditError,
} from "shared/courseStatus";
import { resolveWarningMessages } from "../i18n";
import { courseApiPathKey } from "../lib/courseUid";

type CourseDatesDialogProps = {
  course: Course | null;
  overrides: CourseDateOverride[];
  enrollments?: CourseEnrollment[];
  swaps: Swap[];
  canManageCourses: boolean;
  tenantSettings?: TenantSettings;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type ActiveCalendarAction =
  | { type: "cancel"; isoDate: string }
  | { type: "exclude"; isoDate: string };

const RANGE_EDIT_ERROR_DE: Record<BoundedSeriesRangeEditError, string> = {
  start_locked: "Das Startdatum kann nicht mehr geändert werden, weil der erste Termin nicht mehr in der Zukunft liegt.",
  start_before_today: "Das Startdatum darf nicht vor heute liegen.",
  start_after_first_term: "Das Startdatum darf nicht nach dem ersten Termin liegen.",
  end_before_last_term: "Das Endedatum darf nicht vor dem letzten Termin liegen.",
  start_after_end: "Bitte einen gültigen Zeitraum mit Start- und Enddatum wählen.",
};

function CourseEditorMonthCalendar({
  ariaLabel,
  monthLabel,
  cells,
  saving,
  onPrevMonth,
  onNextMonth,
  onClose,
  onSelect,
  isCellDisabled,
  isSelected,
  cellAriaPrefix,
  legend,
}: {
  ariaLabel: string;
  monthLabel: string;
  cells: CalendarCell[];
  saving: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onClose: () => void;
  onSelect: (isoDate: string) => void;
  isCellDisabled: (isoDate: string) => boolean;
  isSelected: (isoDate: string) => boolean;
  cellAriaPrefix: string;
  legend: string;
}) {
  return (
    <div className="course-editor-calendar-block" role="group" aria-label={ariaLabel}>
      <div className="course-editor-calendar-nav">
        <button
          type="button"
          className="modal-action-btn course-editor-inline-action"
          onClick={onPrevMonth}
          disabled={saving}
        >
          Vorheriger Monat
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          className="modal-action-btn course-editor-inline-action"
          onClick={onNextMonth}
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
        {cells.map((cell) => {
          const disabled = saving || isCellDisabled(cell.isoDate);
          const selected = isSelected(cell.isoDate);
          const cellClassName = [
            "course-editor-calendar-cell",
            cell.inCurrentMonth ? "" : "is-outside-month",
            cell.inSeriesRange ? "is-in-range" : "",
            selected ? "is-range-start" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={`${cellAriaPrefix}-${cell.isoDate}`}
              type="button"
              className={cellClassName}
              aria-label={`${cellAriaPrefix} ${cell.isoDate}`}
              onClick={() => onSelect(cell.isoDate)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSelect(cell.isoDate);
                }
              }}
              disabled={disabled}
            >
              {cell.dayOfMonth}
            </button>
          );
        })}
      </div>
      <div className="course-editor-calendar-legend">
        <span><em className="legend-dot range" /> {legend}</span>
        <span><em className="legend-dot boundary" /> ausgewählt</span>
      </div>
      <div className="course-editor-calendar-actions">
        <button
          type="button"
          className="modal-action-btn course-editor-inline-action"
          onClick={onClose}
          disabled={saving}
        >
          Kalender schließen
        </button>
      </div>
    </div>
  );
}

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

function isIsoDateInFuture(isoDate: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return isoDate > today;
}

export default function CourseDatesDialog({
  course,
  overrides,
  enrollments = [],
  swaps,
  canManageCourses,
  tenantSettings,
  onClose,
  onSaved,
}: CourseDatesDialogProps) {
  const rollingPlanningHorizonWeeks = useMemo(
    () => resolveRollingPlanningHorizonWeeks(tenantSettings),
    [tenantSettings],
  );
  const [datesState, setDatesState] = useState<CourseDatesEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotices, setFormNotices] = useState<string[]>([]);
  const [selectedCancellationDate, setSelectedCancellationDate] = useState<string | null>(null);
  const [activeCalendarAction, setActiveCalendarAction] = useState<ActiveCalendarAction | null>(null);
  const [impactDialogOpen, setImpactDialogOpen] = useState(false);
  const [rollbackSuccessfulSwaps, setRollbackSuccessfulSwaps] = useState(false);
  const [rollbackPendingWaitlistSwaps, setRollbackPendingWaitlistSwaps] = useState(true);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const initialExcludedDatesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!course) {
      setDatesState(null);
      setFormError(null);
      setFormNotices([]);
      return;
    }
    const nextState = createDatesState(course);
    initialExcludedDatesRef.current = [...nextState.excludedDates];
    setDatesState(nextState);
    setFormError(null);
    setFormNotices([]);
    setSelectedCancellationDate(null);
    setActiveCalendarAction(null);
    setImpactDialogOpen(false);
    setRollbackSuccessfulSwaps(false);
    setRollbackPendingWaitlistSwaps(true);
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
  const isActiveCancellationMode = course?.status === "active";
  const isRollingActiveMode = isActiveCancellationMode && datesState?.planningMode === "rolling_continuous";
  const isActiveBounded = isActiveCancellationMode && datesState?.planningMode === "bounded_series";
  const isRollingDraftPlanning =
    course?.status === "draft" && datesState?.planningMode === "rolling_continuous";
  const showExcludedDatesEditor =
    !isActiveCancellationMode &&
    (datesState?.planningMode !== "rolling_continuous" || isRollingDraftPlanning);
  const rangeEditBounds = useMemo(
    () => (course ? getBoundedSeriesRangeEditBounds(course) : null),
    [course],
  );
  const rangeDirty =
    !!course &&
    !!datesState &&
    (datesState.seriesStartDate !== (course.seriesStartDate ?? course.visibleFrom) ||
      datesState.seriesEndDate !== (course.seriesEndDate ?? course.visibleUntil));

  const canSaveDatesConfig =
    canManageCourses &&
    !saving &&
    !!datesState &&
    (
      (datesState.planningMode === "bounded_series" && datesSeriesRangeValid && (!isActiveCancellationMode || isActiveBounded)) ||
      (datesState.planningMode === "rolling_continuous" && !isActiveCancellationMode)
    );
  const canSaveActiveRange =
    !!isActiveBounded && canSaveDatesConfig && rangeDirty && datesSeriesRangeValid;

  const datesPreview = useMemo(() => {
    if (!datesState) return [];
    return generatePreviewDates(datesState, rollingPlanningHorizonWeeks);
  }, [datesState, rollingPlanningHorizonWeeks]);

  const fullPlannedDatesForActiveCancellation = useMemo(() => {
    if (!datesState || !isActiveCancellationMode) return [];
    if (datesState.planningMode === "rolling_continuous" && canManageCourses) {
      return generatePreviewDates({ ...datesState, excludedDates: [] }, ROLLING_ADMIN_PLANNING_PREVIEW_WEEKS);
    }
    return generatePreviewDates({ ...datesState, excludedDates: [] }, rollingPlanningHorizonWeeks);
  }, [datesState, isActiveCancellationMode, canManageCourses, rollingPlanningHorizonWeeks]);

  const activePreviewDates = useMemo(() => {
    if (!datesState || !isActiveCancellationMode) return [];
    return generatePreviewDates(datesState, rollingPlanningHorizonWeeks);
  }, [datesState, isActiveCancellationMode, rollingPlanningHorizonWeeks]);
  const rollingExcludeDraftSummary = useMemo(() => {
    if (!datesState || !isRollingActiveMode) return null;
    const initialExcludedSet = new Set(initialExcludedDatesRef.current);
    const currentExcludedSet = new Set(datesState.excludedDates);
    const addedDates = datesState.excludedDates.filter((entry) => !initialExcludedSet.has(entry));
    const removedDates = initialExcludedDatesRef.current.filter((entry) => !currentExcludedSet.has(entry));
    return {
      addedDates,
      removedDates,
      hasChanges: addedDates.length > 0 || removedDates.length > 0,
    };
  }, [datesState, isRollingActiveMode]);

  const displayLocale =
    typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language
      ? navigator.language
      : "de-DE";

  const rollingParticipantVisibilityRange = useMemo(() => {
    if (!datesState || datesState.planningMode !== "rolling_continuous") return null;
    return getRollingWindowRangeIso(rollingPlanningHorizonWeeks);
  }, [datesState, rollingPlanningHorizonWeeks]);

  const rollingAdminPlanningRange = useMemo(() => {
    if (!datesState || datesState.planningMode !== "rolling_continuous" || !canManageCourses) return null;
    return getRollingAdminPlanningRangeIso();
  }, [datesState, canManageCourses]);

  const effectiveRange = useMemo(() => {
    if (!datesState) return null;
    if (datesState.planningMode === "rolling_continuous") {
      return rollingAdminPlanningRange ?? rollingParticipantVisibilityRange;
    }
    return {
      start: datesState.seriesStartDate,
      end: datesState.seriesEndDate,
    };
  }, [datesState, rollingAdminPlanningRange, rollingParticipantVisibilityRange]);

  const rollingPlanningLockRange = rollingParticipantVisibilityRange;

  const rangeCalendarCells = useMemo(() => {
    if (!datesState || !effectiveRange) return [];
    const calendarRange = effectiveRange;
    return buildSeriesCalendarCells(
      datesState.rangeCalendarMonth,
      datesState.weekday,
      calendarRange.start,
      calendarRange.end,
      datesState.excludedDates,
    );
  }, [datesState, effectiveRange]);

  const rangeCalendarMonthLabel = useMemo(() => {
    if (!datesState) return "";
    return formatMonthLabel(datesState.rangeCalendarMonth, displayLocale);
  }, [datesState, displayLocale]);

  const startPickerCells = useMemo(() => {
    if (!datesState || !rangeEditBounds?.canEditStart) return [];
    const maxStart = rangeEditBounds.maxStartIso ?? datesState.seriesEndDate;
    if (compareIsoDate(rangeEditBounds.minStartIso, maxStart) > 0) return [];
    return buildSeriesCalendarCells(
      datesState.rangeCalendarMonth,
      datesState.weekday,
      rangeEditBounds.minStartIso,
      maxStart,
      [],
    );
  }, [datesState, rangeEditBounds]);

  const endPickerCells = useMemo(() => {
    if (!datesState || !rangeEditBounds) return [];
    const minEnd = rangeEditBounds.minEndIso;
    const maxEnd = "2099-12-31";
    if (compareIsoDate(minEnd, maxEnd) > 0) return [];
    return buildSeriesCalendarCells(
      datesState.rangeCalendarMonth,
      datesState.weekday,
      minEnd,
      maxEnd,
      [],
    );
  }, [datesState, rangeEditBounds]);

  const excludedCalendarCells = useMemo(() => {
    if (!datesState) return [];
    const exclusionRange = effectiveRange;
    if (!exclusionRange) return [];
    return buildSeriesCalendarCells(
      datesState.excludedCalendarMonth,
      datesState.weekday,
      exclusionRange.start,
      exclusionRange.end,
      datesState.excludedDates,
    );
  }, [datesState, effectiveRange]);

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
  const cancellationImpact = useMemo(() => {
    if (!course || !selectedCancellationDate) return null;
    const overrideForDate =
      overrides.find((entry) => entry.courseId === course.id && entry.date === selectedCancellationDate) ?? null;
    const bookedParticipants = [
      ...resolveEffectiveTermOccupancy(
        course,
        overrideForDate,
        enrollments,
        selectedCancellationDate,
      ).participants,
    ];
    const swappedInParticipants = [...(overrideForDate?.swapped ?? [])];
    const waitlistParticipants = [...(overrideForDate?.waitlist ?? [])];
    const bookedSetNormalized = new Set(bookedParticipants.map((userId) => userId.toLowerCase()));
    const stemOnDate = resolveStemForDate(course, enrollments, selectedCancellationDate);
    const alreadyCancelledParticipants = stemOnDate.filter(
      (userId) => !bookedSetNormalized.has(userId.toLowerCase()),
    );
    const cancelledSetNormalized = new Set(alreadyCancelledParticipants.map((userId) => userId.toLowerCase()));
    const successfulSwapsFromCancelledParticipants = swaps
      .filter(
        (swap) =>
          swap.fromCourseId === course.id &&
          swap.fromDate === selectedCancellationDate &&
          swap.status === "active" &&
          isIsoDateInFuture(swap.toDate) &&
          cancelledSetNormalized.has(swap.user.toLowerCase()),
      )
      .map((swap) => swap.user);
    const outgoingSwapsFromCancelledParticipants = swaps
      .filter(
        (swap) =>
          swap.fromCourseId === course.id &&
          swap.fromDate === selectedCancellationDate &&
          swap.status === "pending" &&
          cancelledSetNormalized.has(swap.user.toLowerCase()),
      )
      .map((swap) => swap.user);
    const pendingSwapsWithOriginOnCancelledDate = swaps.filter(
      (swap) =>
        swap.fromCourseId === course.id &&
        swap.fromDate === selectedCancellationDate &&
        swap.status === "pending",
    );
    return {
      bookedParticipants,
      swappedInParticipants,
      waitlistParticipants,
      alreadyCancelledParticipants,
      successfulSwapsFromCancelledParticipants: dedupeAndSortUsers(successfulSwapsFromCancelledParticipants),
      outgoingSwapsFromCancelledParticipants: dedupeAndSortUsers(outgoingSwapsFromCancelledParticipants),
      pendingSwapsWithOriginCount: pendingSwapsWithOriginOnCancelledDate.length,
    };
  }, [course, overrides, enrollments, selectedCancellationDate, swaps]);

  const toggleRangeDatePicker = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            rangeDatePickerOpen: !prev.rangeDatePickerOpen,
            excludedDatePickerOpen: false,
            startDatePickerOpen: false,
            endDatePickerOpen: false,
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

  const closeBoundaryDatePickers = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            startDatePickerOpen: false,
            endDatePickerOpen: false,
          }
        : prev,
    );
  };

  const toggleStartDatePicker = () => {
    if (saving || !rangeEditBounds?.canEditStart) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const nextOpen = !prev.startDatePickerOpen;
      return {
        ...prev,
        startDatePickerOpen: nextOpen,
        endDatePickerOpen: false,
        rangeDatePickerOpen: false,
        excludedDatePickerOpen: false,
        rangeCalendarMonth: nextOpen
          ? (monthKeyFromIsoDate(prev.seriesStartDate) ?? prev.rangeCalendarMonth)
          : prev.rangeCalendarMonth,
      };
    });
  };

  const toggleEndDatePicker = () => {
    if (saving) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const nextOpen = !prev.endDatePickerOpen;
      return {
        ...prev,
        endDatePickerOpen: nextOpen,
        startDatePickerOpen: false,
        rangeDatePickerOpen: false,
        excludedDatePickerOpen: false,
        rangeCalendarMonth: nextOpen
          ? (monthKeyFromIsoDate(prev.seriesEndDate) ?? prev.rangeCalendarMonth)
          : prev.rangeCalendarMonth,
      };
    });
  };

  const setSeriesStartDate = (isoDate: string) => {
    if (saving || !rangeEditBounds?.canEditStart) return;
    if (!isValidIsoDateOnly(isoDate)) return;
    if (isoDate < rangeEditBounds.minStartIso) return;
    if (rangeEditBounds.maxStartIso && isoDate > rangeEditBounds.maxStartIso) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const nextEnd = compareIsoDate(isoDate, prev.seriesEndDate) > 0 ? isoDate : prev.seriesEndDate;
      return { ...prev, seriesStartDate: isoDate, seriesEndDate: nextEnd };
    });
    setFormError(null);
    setFormNotices([]);
  };

  const setSeriesEndDate = (isoDate: string) => {
    if (saving || !rangeEditBounds) return;
    if (!isValidIsoDateOnly(isoDate)) return;
    if (isoDate < rangeEditBounds.minEndIso) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const nextStart = compareIsoDate(isoDate, prev.seriesStartDate) < 0 ? isoDate : prev.seriesStartDate;
      return { ...prev, seriesStartDate: nextStart, seriesEndDate: isoDate };
    });
    setFormError(null);
    setFormNotices([]);
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
    if (saving) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const currentRange =
        prev.planningMode === "rolling_continuous"
          ? (rollingAdminPlanningRange ?? getRollingWindowRangeIso(rollingPlanningHorizonWeeks))
          : { start: prev.seriesStartDate, end: prev.seriesEndDate };
      const inSeriesRange =
        compareIsoDate(isoDate, currentRange.start) >= 0 && compareIsoDate(isoDate, currentRange.end) <= 0;
      const weekdayIndex = WEEKDAY_ORDER[prev.weekday];
      const date = parseIsoDateOnlyUtc(isoDate);
      const isSeriesWeekday =
        !!date && !!weekdayIndex && weekdayIndex >= 1 && weekdayIndex <= 7 && date.getUTCDay() === weekdayIndex % 7;
      const rollingLocked =
        isActiveCancellationMode &&
        prev.planningMode === "rolling_continuous" &&
        !!rollingPlanningLockRange &&
        compareIsoDate(isoDate, rollingPlanningLockRange.start) >= 0 &&
        compareIsoDate(isoDate, rollingPlanningLockRange.end) <= 0;
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
    if (!fullPlannedDatesForActiveCancellation.includes(isoDate)) return;
    const rollingLocked =
      datesState?.planningMode === "rolling_continuous" &&
      !!rollingPlanningLockRange &&
      compareIsoDate(isoDate, rollingPlanningLockRange.start) >= 0 &&
      compareIsoDate(isoDate, rollingPlanningLockRange.end) <= 0;
    const isExcluded = datesState?.excludedDates.includes(isoDate) ?? false;
    if (rollingLocked || datesState?.planningMode === "bounded_series") {
      if (isExcluded) return;
      setSelectedCancellationDate((prev) => (prev === isoDate ? null : isoDate));
      setActiveCalendarAction((prev) =>
        prev?.type === "cancel" && prev.isoDate === isoDate ? null : { type: "cancel", isoDate },
      );
      setDatesState((prev) =>
        prev
          ? {
              ...prev,
              rangeDatePickerOpen: false,
            }
          : prev,
      );
    } else {
      const currentState = datesState;
      if (!currentState) return;
      setSelectedCancellationDate(null);
      const nextExcludedDates = isExcluded
        ? currentState.excludedDates.filter((entry) => entry !== isoDate)
        : dedupeAndSortDates([...currentState.excludedDates, isoDate]);
      setDatesState((prev) =>
        prev
          ? {
              ...prev,
              excludedDates: nextExcludedDates,
            }
          : prev,
      );
      setActiveCalendarAction({ type: "exclude", isoDate });
    }
    setFormError(null);
  };

  const openImpactDialog = () => {
    if (activeCalendarAction?.type !== "cancel") return;
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
      const response = await cancelCourseDate(courseApiPathKey(course), selectedCancellationDate, {
        rollbackSuccessfulSwapsFromCancelledParticipants: rollbackSuccessfulSwaps,
        rollbackPendingWaitlistSwapsFromOriginDate: rollbackPendingWaitlistSwaps,
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
    if (!course || !datesState || !canManageCourses) return;
    if (isActiveCancellationMode && !isActiveBounded) return;
    if (datesState.planningMode === "bounded_series") {
      if (!datesSeriesRangeValid) {
        setFormError("Bitte einen gültigen Zeitraum mit Start- und Enddatum wählen.");
        return;
      }
      if (isActiveBounded) {
        const rangeError = validateBoundedSeriesRangeEdit({
          currentDates: course.dates ?? [],
          currentStart: course.seriesStartDate ?? course.visibleFrom,
          nextStart: datesState.seriesStartDate,
          nextEnd: datesState.seriesEndDate,
        });
        if (rangeError) {
          setFormError(RANGE_EDIT_ERROR_DE[rangeError]);
          return;
        }
      }
    } else if (datesState.planningMode !== "rolling_continuous") {
      setFormError("Unbekannter Planungsmodus.");
      return;
    }

    setSaving(true);
    setFormError(null);
    setFormNotices([]);
    try {
      if (datesState.planningMode === "rolling_continuous") {
        await updateCourse(courseApiPathKey(course), {
          planningMode: "rolling_continuous",
          visibilityMode: "rolling_horizon",
          excludedDates: datesState.excludedDates,
          includedDates: [],
        });
      } else {
        await updateCourse(courseApiPathKey(course), {
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

  const handleActivePrimaryAction = async () => {
    if (!activeCalendarAction) return;
    if (activeCalendarAction.type === "cancel") {
      openImpactDialog();
      return;
    }
    if (!course || !datesState || !canManageCourses) return;
    setSaving(true);
    setFormError(null);
    setFormNotices([]);
    try {
      await updateCourse(courseApiPathKey(course), {
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        excludedDates: datesState.excludedDates,
        includedDates: [],
      });
      initialExcludedDatesRef.current = [...datesState.excludedDates];
      setActiveCalendarAction(null);
      await onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to update course dates configuration", err);
      setFormError(err instanceof Error ? err.message : "Terminkonfiguration konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

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
        {isActiveCancellationMode && (
          <p className="course-editor-note">
            {isActiveBounded
              ? "Kurs ist aktiv. Zeitraum (Saisonstart und -ende) kann noch angepasst werden. Einzelne Termine nur per Absage."
              : "Kurs ist aktiv. Terminplanung innerhalb des Sichtfensters nur per Absage bzw. Ausschluss."}
          </p>
        )}
        <div className="dialog-stack">
          <div className="course-editor-subsection">
            <strong className="course-editor-list-title">
              {datesState.planningMode === "rolling_continuous"
                ? `Vorschau Termine für Teilnehmer (${isActiveCancellationMode ? activePreviewDates.length : datesPreview.length})`
                : `Vorschau Termine (${isActiveCancellationMode ? activePreviewDates.length : datesPreview.length})`}
            </strong>
            {(isActiveCancellationMode ? activePreviewDates.length : datesPreview.length) === 0 ? (
              <p className="course-editor-note">Keine Termine im gewählten Zeitraum.</p>
            ) : (
              <p className="course-editor-comma-list">
                {(isActiveCancellationMode
                  ? activePreviewDates.map((entry) => formatIsoDateForDisplay(entry, displayLocale))
                  : formattedPreviewDates).join(", ")}
              </p>
            )}
          </div>

          {datesState.planningMode === "rolling_continuous" && rollingParticipantVisibilityRange && (
            <div className="course-editor-subsection">
              <strong className="course-editor-list-title">Sichtfenster für Teilnehmer</strong>
              <p className="course-editor-note">
                Von heute ({formatIsoDateForDisplay(rollingParticipantVisibilityRange.start, displayLocale)}) bis{" "}
                {formatIsoDateForDisplay(rollingParticipantVisibilityRange.end, displayLocale)} —{" "}
                {rollingPlanningHorizonWeeks} Wochen (Studio-Einstellungen).
              </p>
              {canManageCourses && effectiveRange && (
                <p className="course-editor-note">
                  Admin- und Kursleiter-Planung bis{" "}
                  {formatIsoDateForDisplay(effectiveRange.end, displayLocale)}. Innerhalb der{" "}
                  {rollingPlanningHorizonWeeks} Wochen nur Absage; danach Termine ausschließen möglich.
                </p>
              )}
            </div>
          )}

          {datesState.planningMode === "bounded_series" && (
            <div className="course-editor-subsection">
              <strong className="course-editor-list-title">Zeitraum</strong>
              <p className="course-editor-note">
                Start: <strong aria-label="Startdatum Wert">{formattedSeriesStart}</strong> | Ende:{" "}
                <strong aria-label="Enddatum Wert">{formattedSeriesEnd}</strong>
              </p>
              <p className="course-editor-note">
                Das Endedatum ist der letzte Tag für Teilnahme und Tausch (Saisonende) und darf nach dem
                letzten Unterrichtstag liegen.
              </p>
              {isActiveBounded ? (
                <>
                  <p className="course-editor-note">
                    {rangeEditBounds?.canEditStart
                      ? "Startdatum nur ändern, solange der erste Termin in der Zukunft liegt; frühestens heute."
                      : "Startdatum ist fest, weil der erste Termin nicht mehr in der Zukunft liegt."}
                  </p>
                  <p className="course-editor-note">
                    Endedatum nicht vor dem letzten Termin
                    {rangeEditBounds?.lastTermIso
                      ? ` (${formatIsoDateForDisplay(rangeEditBounds.lastTermIso, displayLocale)})`
                      : ""}
                    .
                  </p>
                  <div className="course-editor-inline-row">
                    <button
                      type="button"
                      className="modal-action-btn course-editor-icon-btn"
                      onClick={toggleStartDatePicker}
                      disabled={saving || !rangeEditBounds?.canEditStart}
                      title={datesState.startDatePickerOpen ? "Startkalender ausblenden" : "Startkalender öffnen"}
                      aria-label="Kalender für Startdatum öffnen"
                    >
                      <Calendar size={16} aria-hidden="true" />
                    </button>
                    <span className="course-editor-note">Start</span>
                    <button
                      type="button"
                      className="modal-action-btn course-editor-icon-btn"
                      onClick={toggleEndDatePicker}
                      disabled={saving}
                      title={datesState.endDatePickerOpen ? "Endkalender ausblenden" : "Endkalender öffnen"}
                      aria-label="Kalender für Endedatum öffnen"
                    >
                      <Calendar size={16} aria-hidden="true" />
                    </button>
                    <span className="course-editor-note">Ende</span>
                  </div>
                  {datesState.startDatePickerOpen && (
                    <CourseEditorMonthCalendar
                      ariaLabel="Kalender Startdatum"
                      monthLabel={rangeCalendarMonthLabel}
                      cells={startPickerCells}
                      saving={saving}
                      onPrevMonth={() => shiftRangeCalendarMonth(-1)}
                      onNextMonth={() => shiftRangeCalendarMonth(1)}
                      onClose={closeBoundaryDatePickers}
                      onSelect={setSeriesStartDate}
                      isCellDisabled={(isoDate) =>
                        !rangeEditBounds?.canEditStart ||
                        isoDate < (rangeEditBounds?.minStartIso ?? isoDate) ||
                        (!!rangeEditBounds?.maxStartIso && isoDate > rangeEditBounds.maxStartIso)
                      }
                      isSelected={(isoDate) => isoDate === datesState.seriesStartDate}
                      cellAriaPrefix="Startdatum"
                      legend="erlaubter Start"
                    />
                  )}
                  {datesState.endDatePickerOpen && (
                    <CourseEditorMonthCalendar
                      ariaLabel="Kalender Endedatum"
                      monthLabel={rangeCalendarMonthLabel}
                      cells={endPickerCells}
                      saving={saving}
                      onPrevMonth={() => shiftRangeCalendarMonth(-1)}
                      onNextMonth={() => shiftRangeCalendarMonth(1)}
                      onClose={closeBoundaryDatePickers}
                      onSelect={setSeriesEndDate}
                      isCellDisabled={(isoDate) => isoDate < (rangeEditBounds?.minEndIso ?? isoDate)}
                      isSelected={(isoDate) => isoDate === datesState.seriesEndDate}
                      cellAriaPrefix="Endedatum"
                      legend="erlaubtes Ende"
                    />
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}

          {isActiveCancellationMode ? (
            <div className="course-editor-subsection">
              <strong className="course-editor-list-title">
                {isRollingActiveMode
                  ? "Terminkalender zur Übersicht, Absage und zum Ausschluss von Terminen"
                  : "Terminkalender zur Übersicht und Absage"}
              </strong>
              <p className="course-editor-note">
                {isRollingActiveMode
                  ? `Es werden alle geplanten Serientermine angezeigt. Innerhalb der nächsten ${rollingPlanningHorizonWeeks} Wochen nur Absage; danach auch Ausschließen möglich.`
                  : "Es werden alle geplanten Serientermine angezeigt. Ausgeschlossene Termine sind markiert und nicht auswählbar."}
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
                      const rollingLocked =
                        datesState.planningMode === "rolling_continuous" &&
                        !!rollingPlanningLockRange &&
                        compareIsoDate(cell.isoDate, rollingPlanningLockRange.start) >= 0 &&
                        compareIsoDate(cell.isoDate, rollingPlanningLockRange.end) <= 0;
                      const isSelectable =
                        cell.isSeriesDate &&
                        (!isCancelledDate || (isRollingActiveMode && !rollingLocked));
                      const isSelected = selectedCancellationDate === cell.isoDate || activeCalendarAction?.isoDate === cell.isoDate;
                      const cellClassName = [
                        "course-editor-calendar-cell",
                        cell.inCurrentMonth ? "" : "is-outside-month",
                        cell.isSeriesDate ? "is-series-date" : "",
                        rollingLocked ? "is-locked-date" : "",
                        isSelectable && !rollingLocked ? "is-in-range" : "",
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
                              ? (
                                  isRollingActiveMode && !rollingLocked
                                    ? "Ausschluss rückgängig machen"
                                    : "Termin ist bereits ausgeschlossen oder abgesagt"
                                )
                              : isSelectable
                                ? (rollingLocked
                                  ? "Nur Absage möglich"
                                  : (datesState.planningMode === "rolling_continuous"
                                    ? "Termin ausschließen"
                                    : "Termin für Absage auswählen"))
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
                    <span><em className="legend-dot range" /> ausschließbar</span>
                    {isRollingActiveMode && <span><em className="legend-dot lock" /> nur Absage (gesperrt für Ausschluss)</span>}
                    <span><em className="legend-dot excluded" /> ausgeschlossen</span>
                    <span><em className="legend-dot boundary" /> ausgewählt</span>
                  </div>
                </div>
              )}
              <p className="course-editor-note">
                Ausgewählte Aktion:{" "}
                <strong>
                  {activeCalendarAction?.type === "cancel"
                    ? `Absage · ${formatIsoDateForDisplay(activeCalendarAction.isoDate, displayLocale)}`
                    : isRollingActiveMode && rollingExcludeDraftSummary?.hasChanges
                      ? `Ausschlüsse in Bearbeitung · hinzugefügt: ${rollingExcludeDraftSummary.addedDates.length}, zurückgenommen: ${rollingExcludeDraftSummary.removedDates.length}`
                      : "Keine Auswahl"}
                </strong>
              </p>
            </div>
          ) : null}

          {showExcludedDatesEditor && (
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
                  ? "Serientermine im Planungszeitraum können ausgeschlossen werden (Entwurf)."
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
                        isActiveCancellationMode &&
                        datesState.planningMode === "rolling_continuous" &&
                        !!rollingPlanningLockRange &&
                        compareIsoDate(cell.isoDate, rollingPlanningLockRange.start) >= 0 &&
                        compareIsoDate(cell.isoDate, rollingPlanningLockRange.end) <= 0;
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
                          disabled={!cell.isSeriesDate || saving || rollingLocked}
                          title={
                            rollingLocked
                              ? `Im Planungsfenster (${rollingPlanningHorizonWeeks} Wochen) nur Absage möglich`
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

          {showExcludedDatesEditor && (
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
                checked={rollbackSuccessfulSwaps}
                onChange={(event) => setRollbackSuccessfulSwaps(event.target.checked)}
                disabled={saving}
              />{" "}
              Erfolgreiche Tauschs in andere Termine zurückrollen
              ({cancellationImpact.successfulSwapsFromCancelledParticipants.length})
            </label>
            <p className="course-editor-note" style={{ marginTop: 0 }}>
              Nur relevant für zukünftige, bereits erfolgreiche Tauschs von bereits abgemeldeten Teilnehmern.
            </p>
            <label className="course-editor-note" style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={rollbackPendingWaitlistSwaps}
                onChange={(event) => setRollbackPendingWaitlistSwaps(event.target.checked)}
                disabled={saving}
              />{" "}
              Tauschanfragen auf Wartelisten in andere Termine zurückrollen
              ({cancellationImpact.pendingSwapsWithOriginCount})
            </label>
            <p className="course-editor-note" style={{ marginTop: 0 }}>
              Bei Haken werden alle offenen Wartelisten-Tauschanfragen mit diesem Ursprungstermin zurückgerollt und
              Ziel-Wartelisten bereinigt.
            </p>
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
              {isActiveBounded && (
                <button
                  type="button"
                  className="btn-primary modal-action-btn"
                  onClick={saveDatesConfig}
                  disabled={!canSaveActiveRange || impactDialogOpen}
                >
                  {saving ? "Speichere..." : "Zeitraum übernehmen"}
                </button>
              )}
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={handleActivePrimaryAction}
                disabled={
                  !activeCalendarAction ||
                  saving ||
                  impactDialogOpen ||
                  (activeCalendarAction.type === "cancel" && !cancellationImpact)
                }
              >
                {saving
                  ? "Speichere..."
                  : activeCalendarAction?.type === "exclude"
                    ? "Ausschluss übernehmen"
                    : "Absage überprüfen"}
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
