export const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Sunday: 0,
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
};

function parseDateOnlyUtc(value: string | undefined): Date | null {
  if (!value || !ISO_DATE_ONLY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function intersectWindow(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
): { start: Date; end: Date } | null {
  const start = leftStart > rightStart ? leftStart : rightStart;
  const end = leftEnd < rightEnd ? leftEnd : rightEnd;
  if (start > end) return null;
  return { start, end };
}

function generateWeekdayDates(start: Date, end: Date, weekdayIndex: number): string[] {
  const result: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDaysUtc(cursor, 1)) {
    if (cursor.getUTCDay() === weekdayIndex) {
      result.push(toDateOnlyUtc(cursor));
    }
  }
  return result;
}

function normalizeDateList(values: string[]): string[] {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => !!value && ISO_DATE_ONLY.test(value))
    .sort((a, b) => a.localeCompare(b));
}

export type DeriveVisibleDatesInput = {
  planningMode?: string;
  visibilityMode?: string;
  weekday: string;
  seriesStartDate?: string;
  seriesEndDate?: string;
  plannedEndDate?: string;
  visibleFrom?: string;
  visibleUntil?: string;
  rollingPlanningHorizonWeeks?: number;
  excludedDates: string[];
  includedDates: string[];
  fallbackDates: string[];
  now?: Date;
};

export function deriveVisibleDates(input: DeriveVisibleDatesInput): string[] {
  const fallbackDates = normalizeDateList(input.fallbackDates);
  const planningMode = input.planningMode;
  const weekdayIndex = WEEKDAY_INDEX[input.weekday];
  if (!planningMode || weekdayIndex == null) return fallbackDates;

  const now = input.now ?? new Date();
  const todayUtc = startOfTodayUtc(now);

  let baseWindowStart: Date | null = null;
  let baseWindowEnd: Date | null = null;

  if (planningMode === "bounded_series") {
    const seriesStart = parseDateOnlyUtc(input.seriesStartDate);
    const seriesEnd = parseDateOnlyUtc(input.seriesEndDate);
    if (!seriesStart || !seriesEnd) return fallbackDates;
    baseWindowStart = seriesStart;
    baseWindowEnd = seriesEnd;
  } else if (planningMode === "rolling_continuous") {
    const horizonWeeks =
      Number.isInteger(input.rollingPlanningHorizonWeeks) && (input.rollingPlanningHorizonWeeks ?? 0) > 0
        ? Number(input.rollingPlanningHorizonWeeks)
        : 5;
    baseWindowStart = todayUtc;
    baseWindowEnd = addDaysUtc(todayUtc, horizonWeeks * 7);
    const plannedEnd = parseDateOnlyUtc(input.plannedEndDate);
    if (plannedEnd && plannedEnd < baseWindowEnd) {
      baseWindowEnd = plannedEnd;
    }
  } else {
    return fallbackDates;
  }

  let finalWindowStart = baseWindowStart;
  let finalWindowEnd = baseWindowEnd;

  if (input.visibilityMode === "fixed_window") {
    const fixedStart = parseDateOnlyUtc(input.visibleFrom);
    const fixedEnd = parseDateOnlyUtc(input.visibleUntil);
    if (fixedStart && fixedEnd) {
      const overlap = intersectWindow(baseWindowStart, baseWindowEnd, fixedStart, fixedEnd);
      if (!overlap) return [];
      finalWindowStart = overlap.start;
      finalWindowEnd = overlap.end;
    }
  }

  const generated = generateWeekdayDates(finalWindowStart, finalWindowEnd, weekdayIndex);
  const excluded = new Set(normalizeDateList(input.excludedDates));
  const included = normalizeDateList(input.includedDates);
  const visibleSet = new Set(generated.filter((date) => !excluded.has(date)));

  for (const includeDate of included) {
    const includeUtc = parseDateOnlyUtc(includeDate);
    if (!includeUtc) continue;
    if (includeUtc >= finalWindowStart && includeUtc <= finalWindowEnd && !excluded.has(includeDate)) {
      visibleSet.add(includeDate);
    }
  }

  return Array.from(visibleSet).sort((a, b) => a.localeCompare(b));
}
