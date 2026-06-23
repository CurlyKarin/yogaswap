import {
  buildCourseOccurrenceLocal,
  isOccurrenceInPast,
} from "shared/courseStatus";
import type { Course, TenantSettings } from "shared/types";
import { getCourseDates } from "./dates";
import { isTermInParticipantSwapGrace } from "./courseTermActions";

export type WeekOccurrenceKind = "scheduled" | "excluded";

export type WeekOccurrence = {
  dateIso: string;
  kind: WeekOccurrenceKind;
};

export function toLocalDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekRangeKeys(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  return { start: toLocalDateIso(weekStart), end: toLocalDateIso(end) };
}

export function isIsoDateInWeek(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

export function isExcludedCourseDate(
  course: Pick<Course, "excludedDates">,
  dateIso: string,
): boolean {
  return (course.excludedDates ?? []).includes(dateIso);
}

/** Sichtbare und ausgeschlossene Termine der Kalenderwoche (lokales Mo–So). */
export function collectWeekOccurrences(
  course: Pick<Course, "dates" | "excludedDates">,
  weekStart: Date,
): WeekOccurrence[] {
  const { start, end } = weekRangeKeys(weekStart);
  const excluded = new Set(course.excludedDates ?? []);
  const dateSet = new Set<string>();

  for (const iso of course.dates ?? []) {
    if (isIsoDateInWeek(iso, start, end)) dateSet.add(iso);
  }
  for (const iso of course.excludedDates ?? []) {
    if (isIsoDateInWeek(iso, start, end)) dateSet.add(iso);
  }

  return Array.from(dateSet)
    .sort((a, b) => a.localeCompare(b))
    .map((dateIso) => ({
      dateIso,
      kind: excluded.has(dateIso) ? "excluded" : "scheduled",
    }));
}

export type WeekCourseRow = {
  course: Course;
  occurrences: WeekOccurrence[];
};

export type WeekDayGroup = {
  dateIso: string;
  items: Array<{ course: Course; occurrence: WeekOccurrence }>;
};

/** Termine der Kalenderwoche als lokale Date-Objekte (inkl. ausgeschlossener). */
export function weekOccurrenceDates(course: Course, weekStart: Date): Date[] {
  return collectWeekOccurrences(course, weekStart)
    .map((o) => buildCourseOccurrenceLocal(o.dateIso, course.time))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
}

export function isWeekEntirelyInPast(weekStart: Date, now: Date = new Date()): boolean {
  const { end } = weekRangeKeys(weekStart);
  return end < toLocalDateIso(now);
}

function isSelectableWeekViewDate(
  course: Course,
  dateIso: string,
  settings: TenantSettings | undefined,
  now: Date,
): boolean {
  if (isExcludedCourseDate(course, dateIso)) return true;
  if (!isOccurrenceInPast(dateIso, course.time, now)) return true;
  return isTermInParticipantSwapGrace(dateIso, course.time, settings, now);
}

/** Termine für Kachel-Dropdown: künftige plus Nachlauf-Termine (symmetrisch pro Termin). */
export function getWeekViewCardDates(
  course: Course,
  weekStart: Date,
  settings?: TenantSettings,
  now: Date = new Date(),
): Date[] {
  const future = getCourseDates(course, now);
  const inWeek = weekOccurrenceDates(course, weekStart).filter((d) =>
    isSelectableWeekViewDate(course, toLocalDateIso(d), settings, now),
  );
  const pastGrace = (course.dates ?? [])
    .filter((iso) => isTermInParticipantSwapGrace(iso, course.time, settings, now))
    .map((iso) => buildCourseOccurrenceLocal(iso, course.time))
    .filter((d): d is Date => d !== null);
  const merged = new Map<string, Date>();
  for (const d of [...future, ...inWeek, ...pastGrace]) {
    merged.set(toLocalDateIso(d), d);
  }
  return Array.from(merged.values()).sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Vorauswahl passend zur angezeigten KW: bei vergangener Woche letzter Termin dort,
 * sonst erster künftiger Termin in der Woche, sonst erster Termin in der Woche.
 */
function occurrenceDatesSorted(
  occurrences: WeekOccurrence[],
  course: Course,
): Date[] {
  return occurrences
    .map((o) => buildCourseOccurrenceLocal(o.dateIso, course.time))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
}

function pickPreferredFromWeekDates(
  dates: Date[],
  occurrences: WeekOccurrence[],
  weekStart: Date,
  now: Date,
): Date | undefined {
  if (dates.length === 0) return undefined;
  const excludedSet = new Set(
    occurrences.filter((o) => o.kind === "excluded").map((o) => o.dateIso),
  );
  const isScheduled = (d: Date) => !excludedSet.has(toLocalDateIso(d));
  const scheduled = dates.filter(isScheduled);

  if (isWeekEntirelyInPast(weekStart, now)) {
    const pool = scheduled.length > 0 ? scheduled : dates;
    return pool[pool.length - 1];
  }

  const future = dates.filter((d) => d >= now);
  const futureScheduled = future.filter(isScheduled);
  if (futureScheduled.length > 0) return futureScheduled[0];
  if (future.length > 0) return future[0];
  if (scheduled.length > 0) return scheduled[0];
  return dates[0];
}

export function preferredWeekCardDate(
  course: Course,
  weekStart: Date,
  now: Date = new Date(),
): Date | undefined {
  const occurrences = collectWeekOccurrences(course, weekStart);
  if (occurrences.length > 0) {
    return pickPreferredFromWeekDates(
      occurrenceDatesSorted(occurrences, course),
      occurrences,
      weekStart,
      now,
    );
  }
  return getCourseDates(course, now)[0];
}

export function groupWeekRowsByDay(rows: WeekCourseRow[]): WeekDayGroup[] {
  const byDate = new Map<string, WeekDayGroup["items"]>();

  for (const { course, occurrences } of rows) {
    for (const occurrence of occurrences) {
      const list = byDate.get(occurrence.dateIso) ?? [];
      list.push({ course, occurrence });
      byDate.set(occurrence.dateIso, list);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, items]) => ({
      dateIso,
      items: items.sort((a, b) => {
        if (a.course.time !== b.course.time) return a.course.time.localeCompare(b.course.time);
        return a.course.name.localeCompare(b.course.name, "de");
      }),
    }));
}
