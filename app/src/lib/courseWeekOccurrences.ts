import {
  addCalendarDaysIsoUtc,
  buildCourseOccurrenceLocal,
  DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END,
} from "shared/courseStatus";
import type { Course, TenantSettings } from "shared/types";
import { getCourseDates } from "./dates";

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

/** Termine für Kachel-Dropdown: künftige plus alle Termine der angezeigten Kalenderwoche. */
export function getWeekViewCardDates(
  course: Course,
  weekStart: Date,
  settings?: TenantSettings,
  now: Date = new Date(),
): Date[] {
  const future = getCourseDates(course, now);
  const inWeek = weekOccurrenceDates(course, weekStart);
  const todayIso = toLocalDateIso(now);
  const graceDays =
    typeof settings?.inactiveGraceDaysAfterCourseEnd === "number" &&
    settings.inactiveGraceDaysAfterCourseEnd > 0
      ? settings.inactiveGraceDaysAfterCourseEnd
      : DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
  const pastGrace = (course.dates ?? [])
    .filter((iso) => iso < todayIso && todayIso <= addCalendarDaysIsoUtc(iso, graceDays))
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
export function preferredWeekCardDate(
  course: Course,
  weekStart: Date,
  now: Date = new Date(),
): Date | undefined {
  const inWeek = weekOccurrenceDates(course, weekStart);
  if (inWeek.length > 0) {
    if (isWeekEntirelyInPast(weekStart, now)) {
      return inWeek[inWeek.length - 1];
    }
    const futureInWeek = inWeek.filter((d) => d >= now);
    return futureInWeek[0] ?? inWeek[0];
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
