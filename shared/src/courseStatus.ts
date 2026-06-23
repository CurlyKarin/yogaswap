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

function maxIsoDateUtc(a: string, b: string): string {
  return a.localeCompare(b) >= 0 ? a : b;
}

/**
 * Ende des Kursblocks fuer Auto-Inaktiv: `seriesEndDate` (bounded), sonst `plannedEndDate` (Rollkurs).
 * Rollkurse ohne `plannedEndDate` liefern kein Blockende — kein Auto-Inaktiv.
 */
export function courseBlockEndIso(
  course: Pick<Course, "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate">,
): string | undefined {
  const mode = course.planningMode ?? "bounded_series";
  if (mode === "rolling_continuous") {
    const planned = course.plannedEndDate?.trim();
    return planned && ISO_DATE_ONLY.test(planned) ? planned : undefined;
  }
  const series = course.seriesEndDate?.trim();
  if (series && ISO_DATE_ONLY.test(series)) return series;
  const visible = course.visibleUntil?.trim();
  if (visible && ISO_DATE_ONLY.test(visible)) return visible;
  return undefined;
}

/** Kursmodus mit definiertem Blockende — Auto-Inaktiv nach Frist moeglich. */
export function supportsAutoInactiveTransition(
  course: Pick<Course, "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate">,
): boolean {
  return courseBlockEndIso(course) != null;
}

/**
 * Letzter Kalendertag (UTC), an dem der Kurs noch aktiv bleiben darf:
 * max(blockEnd, letzterTermin + Nachlauf).
 */
export function effectiveAutoInactiveDeadlineIso(
  course: Pick<
    Course,
    "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate" | "dates"
  >,
  settings?: TenantSettings,
): string | undefined {
  const blockEnd = courseBlockEndIso(course);
  if (!blockEnd) return undefined;
  const graceDays = settings?.inactiveGraceDaysAfterCourseEnd ?? DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
  const lastTerm = lastScheduledOccurrenceIso(course);
  if (!lastTerm) return blockEnd;
  return maxIsoDateUtc(blockEnd, addCalendarDaysIsoUtc(lastTerm, graceDays));
}

/** Auto-Inaktiv: aktiver Kurs, Blockende definiert, heutiger UTC-Tag liegt nach der Frist. */
export function shouldAutoDeactivateCourse(
  course: Pick<
    Course,
    "status" | "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate" | "dates"
  >,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  if ((course.status ?? "active") !== "active") return false;
  const deadline = effectiveAutoInactiveDeadlineIso(course, settings);
  if (!deadline) return false;
  return toIsoDateUtc(now) > deadline;
}

type ParticipantAccessCourse = Pick<
  Course,
  "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate" | "dates"
>;

/**
 * Letzter inklusiver UTC-Tag für Teilnehmer-Sichtbarkeit und Wind-down (#204).
 * Gleiche Frist wie Auto-Inaktiv (`effectiveAutoInactiveDeadlineIso`), sonst Fallback
 * `courseEndDateIso` + Nachlauf (z. B. manuell inaktiver Rollkurs ohne Blockende).
 */
export function participantCourseAccessDeadlineIso(
  course: ParticipantAccessCourse,
  settings?: TenantSettings,
): string | undefined {
  const aligned = effectiveAutoInactiveDeadlineIso(course, settings);
  if (aligned) return aligned;
  const endIso = courseEndDateIso(course);
  if (!endIso) return undefined;
  const graceDays = settings?.inactiveGraceDaysAfterCourseEnd ?? DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
  return addCalendarDaysIsoUtc(endIso, graceDays);
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
  course: ParticipantAccessCourse,
  settings?: TenantSettings,
): string | undefined {
  return participantCourseAccessDeadlineIso(course, settings);
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
 * Teilnehmer-Wind-down: letzter Termin vorbei (bei `active`) bzw. `inactive`, noch innerhalb
 * der Zugriffsfrist — dieselbe Schwelle wie Auto-Inaktiv (#204).
 */
export function isWithinPostCourseEndGrace(
  course: Pick<
    Course,
    | "dates"
    | "time"
    | "seriesEndDate"
    | "visibleUntil"
    | "plannedEndDate"
    | "planningMode"
    | "status"
  >,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  const deadline = participantCourseAccessDeadlineIso(course, settings);
  if (!deadline) return false;
  if (toIsoDateUtc(now) > deadline) return false;
  const status = course.status ?? "active";
  if (status === "inactive") return true;
  return !hasUpcomingCourseOccurrences(course.dates ?? [], course.time, now);
}

/**
 * Admin-Hinweis: Kurs wuerde beim naechsten Reconcile/Speichern inaktiv.
 * `hasUpcomingDates` wird ignoriert (#204: Zugriffsfrist statt Zukunftstermine).
 */
export function wouldAutoDeactivateOnReconcile(
  course: Course,
  hasUpcomingDates: boolean,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  void hasUpcomingDates;
  return shouldAutoDeactivateCourse(course, settings, now);
}

/**
 * Admin-Hinweis: inaktiver Kurs mit definiertem Blockende, typisch auto-reconciled.
 * `hasUpcomingDates` schliesst manuelle Inaktivierung bei noch sichtbaren Terminen aus.
 */
export function looksLikeAutomaticallyInactive(
  course: Course,
  hasUpcomingDates: boolean,
): boolean {
  if ((course.status ?? "active") !== "inactive") return false;
  if (!supportsAutoInactiveTransition(course)) return false;
  return !hasUpcomingDates;
}

export function formatCourseIsoDateDe(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${iso}T12:00:00.000Z`),
  );
}
