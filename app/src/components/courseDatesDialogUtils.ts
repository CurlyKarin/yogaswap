import type { Course, CoursePlanningMode } from "shared/types";
import { deriveVisibleDates } from "../lib/courseSchedule";

export type CourseDatesEditorState = {
  courseId: number;
  weekday: string;
  planningMode: CoursePlanningMode;
  visibilityHorizonWeeks: number;
  seriesStartDate: string;
  seriesEndDate: string;
  excludedDates: string[];
  rangeCalendarMonth: string;
  excludedCalendarMonth: string;
  rangeDatePickerOpen: boolean;
  excludedDatePickerOpen: boolean;
  rangeSelectionTarget: "start" | "end";
};

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

export const DEFAULT_ROLLING_HORIZON_WEEKS = 10;
export const DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS = 5;
const DEFAULT_ROLLING_EXCLUDE_SELECTION_WEEKS = 156; // ~3 Jahre für langfristige Planung

function normalizeHorizonWeeks(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return DEFAULT_ROLLING_HORIZON_WEEKS;
  return Math.max(Number(value), DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS);
}

function normalizeExcludeLockWeeks(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS;
  return Number(value);
}

function normalizeExcludeSelectionWeeks(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) return DEFAULT_ROLLING_EXCLUDE_SELECTION_WEEKS;
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

export function generateSeriesPreviewDates(
  weekday: string,
  startDate: string,
  endDate: string,
  excludedDates: string[],
): string[] {
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
  visibilityHorizonWeeks: number,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + normalizeHorizonWeeks(visibilityHorizonWeeks) * 7);
  return {
    start: toIsoDateOnly(start),
    end: toIsoDateOnly(end),
  };
}

export function getRollingExcludeLockRangeIso(
  excludeLockWeeks: number = DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + normalizeExcludeLockWeeks(excludeLockWeeks) * 7);
  return {
    start: toIsoDateOnly(start),
    end: toIsoDateOnly(end),
  };
}

export function getRollingExcludeSelectionRangeIso(
  excludeSelectionWeeks: number = DEFAULT_ROLLING_EXCLUDE_SELECTION_WEEKS,
  now: Date = new Date(),
): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + normalizeExcludeSelectionWeeks(excludeSelectionWeeks) * 7);
  return {
    start: toIsoDateOnly(start),
    end: toIsoDateOnly(end),
  };
}

export function generatePreviewDates(
  state: Pick<
    CourseDatesEditorState,
    "planningMode" | "weekday" | "seriesStartDate" | "seriesEndDate" | "visibilityHorizonWeeks" | "excludedDates"
  >,
): string[] {
  if (state.planningMode === "rolling_continuous") {
    return deriveVisibleDates({
      planningMode: "rolling_continuous",
      visibilityMode: "rolling_horizon",
      weekday: state.weekday,
      visibilityHorizonWeeks: state.visibilityHorizonWeeks,
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

export function createDatesState(course: Course): CourseDatesEditorState {
  const defaults = buildDefaultSeriesWindow();
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
    visibilityHorizonWeeks: normalizeHorizonWeeks(course.visibilityHorizonWeeks),
    seriesStartDate: initialStart,
    seriesEndDate: initialEnd,
    excludedDates: dedupeAndSortDates(course.excludedDates ?? []),
    rangeCalendarMonth: monthKeyFromIsoDate(initialStart) ?? toMonthKey(new Date()),
    excludedCalendarMonth: monthKeyFromIsoDate(initialStart) ?? toMonthKey(new Date()),
    rangeDatePickerOpen: false,
    excludedDatePickerOpen: false,
    rangeSelectionTarget: "start",
  };
}
