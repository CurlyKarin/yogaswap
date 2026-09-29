import type { Course, CoursePlanningMode } from "shared/types";
import {
  DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS as SHARED_DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS,
} from "shared/tenantSettings";
import { deriveVisibleDates } from "../lib/courseSchedule";

export type CourseDatesEditorState = {
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
  startDatePickerOpen: boolean;
  endDatePickerOpen: boolean;
  rangeSelectionTarget: "start" | "end";
  /**
   * #331: Wiederbeplanung eines beendeten Kursblocks (Draft, seriesEnd vor heute).
   * Alte Range nicht als Selection; Ausnahmen geleert.
   */
  replanMode?: boolean;
  /** Hinweis, dass Ausnahmen beim Einstieg zurückgesetzt wurden. */
  replanExclusionsCleared?: boolean;
};

export const REPLAN_EXCLUSIONS_CLEARED_NOTICE =
  "Bisherige Ausnahmen wurden für die Neuplanung zurückgesetzt.";

export type CalendarCell = {
  isoDate: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  inSeriesRange: boolean;
  isSeriesDate: boolean;
  isExcluded: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
};

export const WEEKDAY_ORDER: Record<string, number> = {
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

export function isValidIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function dedupeAndSortDates(values: string[]): string[] {
  return Array.from(new Set(values.filter(isValidIsoDateOnly))).sort(compareIsoDate);
}

/** Fallback; Studio-Wert kommt aus `resolveRollingPlanningHorizonWeeks(tenantSettings)`. */
export const DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS = SHARED_DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS;

/** Langfristige Admin-/Kursleiter-Planung (~3 Jahre), unabhängig vom Teilnehmer-Sichtfenster. */
export const ROLLING_ADMIN_PLANNING_PREVIEW_WEEKS = 156;

function normalizeRollingPlanningHorizonWeeks(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS;
  return Number(value);
}

function normalizeAdminPlanningWeeks(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return ROLLING_ADMIN_PLANNING_PREVIEW_WEEKS;
  return Number(value);
}

function buildDefaultSeriesWindow(): { start: string; end: string } {
  const today = new Date();
  return {
    start: toIsoDateOnly(today),
    end: toIsoDateOnly(addDays(today, 84)),
  };
}

export function parseIsoDateOnlyUtc(value: string): Date | null {
  if (!isValidIsoDateOnly(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDateOnly(parsed) === value ? parsed : null;
}

export function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyFromIsoDate(value: string): string | null {
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

export function shiftMonthKey(value: string, monthDelta: number): string {
  const parsed = parseMonthKey(value);
  if (!parsed) return value;
  parsed.setUTCMonth(parsed.getUTCMonth() + monthDelta);
  return toMonthKey(parsed);
}

export function formatMonthLabel(monthKey: string, locale?: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

export function formatIsoDateForDisplay(isoDate: string, locale?: string): string {
  const parsed = parseIsoDateOnlyUtc(isoDate);
  if (!parsed) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}

export function buildSeriesCalendarCells(
  monthKey: string,
  weekday: string,
  rangeStartIso: string,
  rangeEndIso: string,
  excludedDates: string[],
): CalendarCell[] {
  const monthStart = parseMonthKey(monthKey);
  if (!monthStart) return [];

  const hasRange = isValidIsoDateOnly(rangeStartIso) && isValidIsoDateOnly(rangeEndIso);
  const rangeStart = hasRange ? parseIsoDateOnlyUtc(rangeStartIso) : null;
  const rangeEnd = hasRange ? parseIsoDateOnlyUtc(rangeEndIso) : null;
  if (hasRange && (!rangeStart || !rangeEnd)) return [];

  const normalizedRangeStart = rangeStart ? toIsoDateOnly(rangeStart) : "";
  const normalizedRangeEnd = rangeEnd ? toIsoDateOnly(rangeEnd) : "";
  if (
    hasRange &&
    compareIsoDate(normalizedRangeStart, normalizedRangeEnd) > 0
  ) {
    return [];
  }

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
      hasRange &&
      compareIsoDate(isoDate, normalizedRangeStart) >= 0 &&
      compareIsoDate(isoDate, normalizedRangeEnd) <= 0;
    const isSeriesDate = inSeriesRange && current.getUTCDay() === jsWeekday;
    cells.push({
      isoDate,
      dayOfMonth: current.getUTCDate(),
      inCurrentMonth: toMonthKey(current) === currentMonth,
      inSeriesRange,
      isSeriesDate,
      isExcluded: excludedSet.has(isoDate),
      isRangeStart: hasRange && isoDate === normalizedRangeStart,
      isRangeEnd: hasRange && isoDate === normalizedRangeEnd,
    });
  }
  return cells;
}

export function generateSeriesPreviewDates(
  weekday: string,
  startDate: string,
  endDate: string,
  excludedDates: string[],
): string[] {
  if (!isValidIsoDateOnly(startDate) || !isValidIsoDateOnly(endDate)) return [];
  return deriveVisibleDates({
    planningMode: "bounded_series",
    visibilityMode: "fixed_window",
    weekday,
    seriesStartDate: startDate,
    seriesEndDate: endDate,
    visibleFrom: startDate,
    visibleUntil: endDate,
    excludedDates,
    includedDates: [],
    fallbackDates: [],
  });
}

export function getRollingWindowRangeIso(
  rollingPlanningHorizonWeeks: number,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + normalizeRollingPlanningHorizonWeeks(rollingPlanningHorizonWeeks) * 7);
  return {
    start: toIsoDateOnly(start),
    end: toIsoDateOnly(end),
  };
}

export function getRollingAdminPlanningRangeIso(
  previewWeeks: number = ROLLING_ADMIN_PLANNING_PREVIEW_WEEKS,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + normalizeAdminPlanningWeeks(previewWeeks) * 7);
  return {
    start: toIsoDateOnly(start),
    end: toIsoDateOnly(end),
  };
}

export function generatePreviewDates(
  state: Pick<
    CourseDatesEditorState,
    "planningMode" | "weekday" | "seriesStartDate" | "seriesEndDate" | "excludedDates"
  >,
  rollingPlanningHorizonWeeks: number = DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS,
): string[] {
  if (state.planningMode === "rolling_continuous") {
    return deriveVisibleDates({
      planningMode: "rolling_continuous",
      visibilityMode: "rolling_horizon",
      weekday: state.weekday,
      rollingPlanningHorizonWeeks,
      excludedDates: state.excludedDates,
      includedDates: [],
      fallbackDates: [],
    });
  }
  return generateSeriesPreviewDates(
    state.weekday,
    state.seriesStartDate,
    state.seriesEndDate,
    state.excludedDates,
  );
}

export function planningModeLabel(mode: CoursePlanningMode | undefined): string {
  if (mode === "rolling_continuous") return "Durchlaufend (rollend)";
  return "Kursblock (fixes Fenster)";
}

function todayIsoLocal(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveSeriesEndIso(
  course: Pick<Course, "seriesEndDate" | "visibleUntil" | "dates">,
): string {
  const fromFields = course.seriesEndDate?.trim() || course.visibleUntil?.trim() || "";
  if (isValidIsoDateOnly(fromFields)) return fromFields;
  const dates = dedupeAndSortDates(course.dates ?? []);
  return dates.length > 0 ? dates[dates.length - 1]! : "";
}

/**
 * Wiederbeplanung (#331): Draft-Kursblock mit `replanPending` (nach inactive→draft)
 * oder mit bereits beendetem Serienfenster (`seriesEnd` vor heute).
 */
export function isCourseBlockReplanContext(
  course: Pick<
    Course,
    | "status"
    | "planningMode"
    | "seriesEndDate"
    | "visibleUntil"
    | "dates"
    | "replanPending"
  >,
  now: Date = new Date(),
): boolean {
  if ((course.planningMode ?? "bounded_series") !== "bounded_series") return false;
  if ((course.status ?? "active") !== "draft") return false;
  if (course.replanPending === true) return true;
  const todayIso = todayIsoLocal(now);
  const endIso = resolveSeriesEndIso(course);
  return isValidIsoDateOnly(endIso) && endIso < todayIso;
}

export function createDatesState(course: Course, now: Date = new Date()): CourseDatesEditorState {
  const defaults = buildDefaultSeriesWindow();
  const currentMonth = toMonthKey(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12)),
  );
  const replanMode = isCourseBlockReplanContext(course, now);

  if (replanMode) {
    const hadExclusions = (course.excludedDates ?? []).length > 0;
    return {
      courseId: course.id,
      weekday: course.weekday,
      planningMode: "bounded_series",
      seriesStartDate: "",
      seriesEndDate: "",
      excludedDates: [],
      rangeCalendarMonth: currentMonth,
      excludedCalendarMonth: currentMonth,
      rangeDatePickerOpen: false,
      excludedDatePickerOpen: false,
      startDatePickerOpen: false,
      endDatePickerOpen: false,
      rangeSelectionTarget: "start",
      replanMode: true,
      replanExclusionsCleared: hadExclusions,
    };
  }

  const initialStart =
    course.planningMode === "rolling_continuous"
      ? defaults.start
      : (course.seriesStartDate ?? course.visibleFrom ?? defaults.start);
  const initialEnd =
    course.planningMode === "rolling_continuous"
      ? defaults.end
      : (course.seriesEndDate ?? course.visibleUntil ?? defaults.end);
  return {
    courseId: course.id,
    weekday: course.weekday,
    planningMode: course.planningMode ?? "bounded_series",
    seriesStartDate: initialStart,
    seriesEndDate: initialEnd,
    excludedDates: dedupeAndSortDates(course.excludedDates ?? []),
    rangeCalendarMonth: monthKeyFromIsoDate(initialStart) ?? currentMonth,
    excludedCalendarMonth: monthKeyFromIsoDate(initialStart) ?? currentMonth,
    rangeDatePickerOpen: false,
    excludedDatePickerOpen: false,
    startDatePickerOpen: false,
    endDatePickerOpen: false,
    rangeSelectionTarget: "start",
  };
}
