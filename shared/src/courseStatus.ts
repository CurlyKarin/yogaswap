import type { Course, TenantSettings } from "./types";

/** Default-Nachlauf in Tagen (fachlich an `DEFAULT_SWAP_MAX_OFFSET_DAYS` gekoppelt). */
export const DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END = 7;

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Lokaler Kursbeginn (gleiche Logik wie `getCourseDates` in der App). */
export function buildCourseOccurrenceLocal(isoDate: string, time: string): Date | null {
  if (!ISO_DATE_ONLY.test(isoDate.trim()) || !TIME_HHMM.test(time.trim())) return null;
  const [hours, minutes] = time.split(":").map(Number);
  const base = new Date(isoDate);
  if (Number.isNaN(base.getTime())) return null;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hours, minutes);
}

/** Termin (Datum + Uhrzeit) liegt in der Vergangenheit. */
export function isOccurrenceInPast(
  isoDate: string,
  courseTime: string,
  now: Date = new Date(),
): boolean {
  const occurrence = buildCourseOccurrenceLocal(isoDate, courseTime);
  return occurrence != null && occurrence < now;
}

/** Mindestens ein Termin liegt in der Zukunft (Datum + Uhrzeit). */
export function hasUpcomingCourseOccurrences(
  dateIsos: string[],
  time: string,
  now: Date = new Date(),
): boolean {
  for (const iso of dateIsos) {
    const occurrence = buildCourseOccurrenceLocal(iso, time);
    if (occurrence && occurrence >= now) return true;
  }
  return false;
}

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
 * `plannedEndDate` (Rollkurs), sonst seriesEndDate, visibleUntil, max aus `dates`.
 */
export function courseEndDateIso(
  course: Pick<Course, "plannedEndDate" | "seriesEndDate" | "visibleUntil" | "dates" | "planningMode">,
): string | undefined {
  const planned = course.plannedEndDate?.trim();
  if (planned && ISO_DATE_ONLY.test(planned)) return planned;
  const series = course.seriesEndDate?.trim();
  if (series && ISO_DATE_ONLY.test(series) && (course.planningMode ?? "bounded_series") === "bounded_series") {
    return series;
  }
  const visible = course.visibleUntil?.trim();
  if (visible && ISO_DATE_ONLY.test(visible)) return visible;
  const raw = course.dates ?? [];
  const valid = raw.filter((d) => typeof d === "string" && ISO_DATE_ONLY.test(d.trim()));
  if (valid.length === 0) return undefined;
  const trimmed = valid.map((d) => d.trim());
  trimmed.sort((a, b) => b.localeCompare(a));
  return trimmed[0];
}

/** Letzter geplanter Termin nur aus `dates` (ohne seriesEndDate-Fallback). */
export function lastScheduledOccurrenceIso(
  course: Pick<Course, "dates">,
): string | undefined {
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
  return isWithinPostCourseEndGrace(course, settings, now);
}

/**
 * Nach Kursende (letzter Termin vorbei), innerhalb des Nachlaufs — auch wenn Status noch `active`
 * (z. B. vor getCourses-Reconcile).
 */
export function isWithinPostCourseEndGrace(
  course: Pick<Course, "dates" | "time" | "seriesEndDate" | "visibleUntil" | "status">,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  const endIso = courseEndDateIso(course);
  if (!endIso) return false;
  if (hasUpcomingCourseOccurrences(course.dates ?? [], course.time, now)) return false;
  const graceDays = settings?.inactiveGraceDaysAfterCourseEnd ?? DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
  const lastGraceInclusiveIso = addCalendarDaysIsoUtc(endIso, graceDays);
  return toIsoDateUtc(now) <= lastGraceInclusiveIso;
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
