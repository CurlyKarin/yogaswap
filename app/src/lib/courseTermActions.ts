import {
  canCreateSwapFromOrigin,
  isRegularCancellation,
} from "shared/cancellationSwapCutoff";
import {
  addCalendarDaysIsoUtc,
  courseBlockEndIso,
  courseEndDateIso,
  DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END,
  isBoundedSeriesPlanningMode,
  isOccurrenceInPast,
  isWithinPostCourseEndGrace,
  participantCourseAccessDeadlineIso,
  toIsoDateUtc,
} from "shared/courseStatus";

export { isOccurrenceInPast };
import type { Course, CourseDateOverride, TenantSettings } from "shared/types";
import { addWeeks, startOfWeekMonday } from "./courseWeek";
import { isWeekEntirelyInPast, weekRangeKeys } from "./courseWeekOccurrences";

function resolveGraceDays(settings?: TenantSettings): number {
  const value = settings?.inactiveGraceDaysAfterCourseEnd;
  return typeof value === "number" && value > 0 ? value : DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
}

/** Kalendertage nach Kursende — gleiche Zugriffsfrist wie Auto-Inaktiv (#204). */
export function isWithinParticipantGraceCalendar(
  course: Pick<Course, "dates" | "time" | "seriesEndDate" | "visibleUntil" | "plannedEndDate" | "planningMode" | "status">,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  const deadline = participantCourseAccessDeadlineIso(course, settings);
  if (!deadline) return false;
  return toIsoDateUtc(now) <= deadline;
}

function isIsoWithinStudioTermGraceWindow(
  isoDate: string,
  settings: TenantSettings | undefined,
  now: Date,
): boolean {
  const todayIso = toIsoDateUtc(now);
  if (isoDate > todayIso) return false;
  const lastGraceInclusiveIso = addCalendarDaysIsoUtc(isoDate, resolveGraceDays(settings));
  return todayIso <= lastGraceInclusiveIso;
}

function isIsoWithinSwapLookback(
  isoDate: string,
  course: Pick<Course, "time" | "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate">,
  settings: TenantSettings | undefined,
  now: Date,
): boolean {
  if (isBoundedSeriesPlanningMode(course.planningMode)) {
    const end = courseBlockEndIso(course);
    if (!end) return isIsoWithinStudioTermGraceWindow(isoDate, settings, now);
    const todayIso = toIsoDateUtc(now);
    return isoDate <= todayIso && todayIso <= end;
  }
  return isIsoWithinStudioTermGraceWindow(isoDate, settings, now);
}

/** Termin liegt in der Vergangenheit und ist noch tauschbar (Roll: Nachlauf; Block: bis Saisonende). */
export function isTermInParticipantSwapGrace(
  isoDate: string,
  course: Pick<Course, "time" | "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate">,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  if (!isOccurrenceInPast(isoDate, course.time, now)) return false;
  return isIsoWithinSwapLookback(isoDate, course, settings, now);
}

/**
 * Teilnehmer-Kurskachel im Wind-down: keine vollen Terminaktionen, RC-Nachlauf am
 * Vergangenheitstermin bleibt möglich (#204 Option A).
 */
export function isParticipantCourseWindDown(
  course: Course,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  return isWithinPostCourseEndGrace(course, settings, now);
}

/**
 * Kurs gilt als „im Nachlauf“ für Wochenrückblick: innerhalb Grace-Tage nach Ende,
 * ohne weitere Zukunftstermine (außer `inactive` — dort reicht Kalender-Nachlauf).
 */
export function isCourseInParticipantGrace(
  course: Course,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  if (!isWithinParticipantGraceCalendar(course, settings, now)) return false;
  const status = course.status ?? "active";
  if (status === "inactive") return true;
  return isWithinPostCourseEndGrace(course, settings, now);
}

/** Kalender-Nachlauf für ‹-Navigation und Sichtbarkeit vergangener KWs (vgl. #149). */
export function isCourseInNavigationGrace(
  course: Course,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  const todayIso = toIsoDateUtc(now);
  const validPastDates = (course.dates ?? []).filter((iso) => iso <= todayIso);
  if (validPastDates.some((iso) => isIsoWithinSwapLookback(iso, course, settings, now))) return true;
  return isWithinParticipantGraceCalendar(course, settings, now);
}

/** Vergangene KW: Kurs nur im Nachlauf anzeigen (alle Rollen in der Wochenansicht). */
export function canShowCourseInPastWeek(
  course: Course,
  weekStart: Date,
  settings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  if (!isWeekEntirelyInPast(weekStart, now)) return true;
  const { start, end } = weekRangeKeys(weekStart);
  const weekDates = (course.dates ?? []).filter((iso) => iso >= start && iso <= end);
  if (weekDates.length === 0) return false;
  return weekDates.some((iso) => isIsoWithinSwapLookback(iso, course, settings, now));
}

/**
 * Früheste navigierbare KW für ‹ :
 * - pro Kurs im Nachlauf: Woche des Kursendes
 * - zusätzlich: bis zu `inactiveGraceDaysAfterCourseEnd` Kalendertage zurück ab heute,
 *   damit man zu Wochenanfang noch in die vorige KW wechseln kann, solange Nachlauf läuft
 */
export function computeEarliestWeekAnchor(
  courses: Course[],
  settings?: TenantSettings,
  now: Date = new Date(),
): Date {
  const todayWeek = startOfWeekMonday(now);
  const previousWeek = addWeeks(todayWeek, -1);
  const graceDays = resolveGraceDays(settings);

  const lookback = new Date(now);
  lookback.setDate(lookback.getDate() - graceDays);
  const lookbackWeek = startOfWeekMonday(lookback);

  let earliest: Date | null = null;
  let hasNavigationGrace = false;

  for (const course of courses) {
    if (!isCourseInNavigationGrace(course, settings, now)) continue;
    hasNavigationGrace = true;
    const candidateIsos = (course.dates ?? []).filter((iso) =>
      isIsoWithinSwapLookback(iso, course, settings, now),
    );
    if (candidateIsos.length > 0) {
      for (const iso of candidateIsos) {
        const isoWeek = startOfWeekMonday(new Date(`${iso}T12:00:00.000Z`));
        if (!earliest || isoWeek.getTime() < earliest.getTime()) {
          earliest = isoWeek;
        }
      }
      continue;
    }
    const endIso = courseEndDateIso(course);
    if (endIso) {
      const endWeek = startOfWeekMonday(new Date(`${endIso}T12:00:00.000Z`));
      if (!earliest || endWeek.getTime() < earliest.getTime()) {
        earliest = endWeek;
      }
    }
  }

  if (!hasNavigationGrace) {
    return todayWeek;
  }

  if (!earliest) {
    return previousWeek;
  }

  let result = earliest;
  if (lookbackWeek.getTime() < result.getTime()) {
    result = lookbackWeek;
  }
  // Kursende in dieser KW: lookback kann noch dieselbe KW sein — mindestens eine Woche zurück
  if (previousWeek.getTime() < result.getTime()) {
    result = previousWeek;
  }
  return result;
}

export function earliestAllowedWeekStart(
  courses: Course[],
  settings?: TenantSettings,
  now: Date = new Date(),
): Date {
  return computeEarliestWeekAnchor(courses, settings, now);
}

/** Vergangener Termin: nur Tausch aus rechtzeitiger Absage (RC), nicht Kurzfrist. */
export function canRequestSwapFromPastCancelledOrigin(input: {
  isoDate: string;
  courseTime: string;
  course?: Pick<Course, "time" | "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate">;
  tenantSettings?: TenantSettings;
  override?: CourseDateOverride;
  userName: string;
  participants: string[];
  originallyParticipant: boolean;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  if (!isOccurrenceInPast(input.isoDate, input.courseTime, now)) return false;
  const courseForGrace = input.course ?? { time: input.courseTime };
  if (!isTermInParticipantSwapGrace(input.isoDate, courseForGrace, input.tenantSettings, now)) {
    return false;
  }
  if (
    !isRegularCancellation(
      input.originallyParticipant,
      input.override,
      input.participants,
      input.userName,
    )
  ) {
    return false;
  }
  return canCreateSwapFromOrigin({
    isoDate: input.isoDate,
    courseTime: input.courseTime,
    tenantSettings: input.tenantSettings,
    override: input.override,
    userName: input.userName,
    participants: input.participants,
    originallyParticipant: input.originallyParticipant,
    now,
  });
}
