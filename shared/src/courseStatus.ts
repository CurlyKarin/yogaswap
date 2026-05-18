import type { Course, TenantSettings } from "./types";

/** Default-Nachlauf in Tagen (an app swapSettings.maxOffsetDays angeglichen). */
export const DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END = 7;

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addCalendarDaysIsoUtc(iso: string, days: number): string {
  const [y, m, day] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Letztes Kursende (YYYY-MM-DD) fuer Nachlauf bei inaktiven Kursen:
 * seriesEndDate, sonst visibleUntil, sonst groesstes gueltiges Datum in `dates`.
 */
export function courseEndDateIso(
  course: Pick<Course, "seriesEndDate" | "visibleUntil" | "dates">,
): string | undefined {
  const series = course.seriesEndDate?.trim();
  if (series && ISO_DATE_ONLY.test(series)) return series;
  const visible = course.visibleUntil?.trim();
  if (visible && ISO_DATE_ONLY.test(visible)) return visible;
  const raw = course.dates ?? [];
  const valid = raw.filter((d) => typeof d === "string" && ISO_DATE_ONLY.test(d.trim()));
  if (valid.length === 0) return undefined;
  const trimmed = valid.map((d) => d.trim());
  trimmed.sort((a, b) => b.localeCompare(a));
  return trimmed[0];
}

export function getInactiveGraceLastDayIso(
  course: Pick<Course, "seriesEndDate" | "visibleUntil" | "dates" | "status">,
  settings?: TenantSettings,
): string | undefined {
  const endIso = courseEndDateIso(course);
  if (!endIso) return undefined;
  const graceDays = settings?.inactiveGraceDaysAfterCourseEnd ?? DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
  return addCalendarDaysIsoUtc(endIso, graceDays);
}

/** Teilnehmer-Nachlauf: heute (UTC) liegt noch im Fenster nach Kursende. */
export function isCourseInInactiveGracePeriod(
  course: Course,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  if ((course.status ?? "active") !== "inactive") return false;
  const lastGraceIso = getInactiveGraceLastDayIso(course, settings);
  if (!lastGraceIso) return false;
  return toIsoDateUtc(now) <= lastGraceIso;
}

/**
 * Entspricht der Backend-Regel in updateCourse (bounded_series ohne Zukunftstermine).
 * `hasUpcomingDates` kommt vom Aufrufer (z. B. getCourseDates.length > 0).
 */
export function wouldAutoDeactivateBoundedSeries(
  course: Course,
  hasUpcomingDates: boolean,
): boolean {
  const status = course.status ?? "active";
  const planningMode = course.planningMode ?? "bounded_series";
  return status === "active" && planningMode === "bounded_series" && !hasUpcomingDates;
}

/**
 * Heuristik ohne DB-Feld: inaktiver Kursblock ohne Zukunftstermine (typisch auto-gesetzt).
 */
export function looksLikeAutomaticallyInactive(
  course: Course,
  hasUpcomingDates: boolean,
): boolean {
  if ((course.status ?? "active") !== "inactive") return false;
  const planningMode = course.planningMode ?? "bounded_series";
  return planningMode === "bounded_series" && !hasUpcomingDates;
}

export function formatCourseIsoDateDe(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00.000Z`),
  );
}
