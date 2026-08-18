// lib/dates.ts
import { CourseDateOverride, Course, CourseEnrollment, User, TenantSettings } from "shared/types";
import { isAtMaxCapacity, isAtRegularCapacity } from "shared/courseCapacity";
import { isSwapTargetInCutoffWindow } from "shared/cancellationSwapCutoff";
import {
  buildCourseOccurrenceLocal,
  courseBlockEndIso,
  isBoundedSeriesPlanningMode,
  isIsoWithinBoundedSeriesRights,
  toIsoDateUtc,
} from "shared/courseStatus";
import { resolveEffectiveTermOccupancy, resolveStemForDate } from "shared/courseEnrollment";
import type { SwapSettings } from "../types";

export function getCourseDates(course: Course, now: Date = new Date()) {
  return (course.dates ?? [])
    .map((d) => {
      const occurrence = buildCourseOccurrenceLocal(d, course.time);
      if (!occurrence) {
        console.warn(`Ungültiges Datum in course.dates: ${d} für course ${course.id}`);
      }
      return occurrence;
    })
    .filter((d): d is Date => d !== null)
    .filter((d) => d >= now);
}

export function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function buildCourseTime(d: Date, hhmm: string): Date | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) {
    console.warn(`Ungültiges Zeitformat: ${hhmm}`);
    return null;
  }
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
}

export function sameInstant(a: Date | string, b: Date | string): boolean {
  return sameDayUTC(new Date(a), new Date(b));
}

export function toDateKey(date: Date): string {
  if (isNaN(date.getTime())) return ""; // ungültiges Datum → kein Crash
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Eindeutiger Select-Wert für Tauschziele (Kurs + lokales Datum). */
export function swapOptionKey(courseId: number, date: Date): string {
  return `${courseId}:${toDateKey(date)}`;
}

export function parseSwapOptionKey(
  value: string,
): { courseId: number; dateKey: string } | null {
  const separator = value.indexOf(":");
  if (separator <= 0) return null;
  const courseId = Number(value.slice(0, separator));
  const dateKey = value.slice(separator + 1);
  if (!Number.isFinite(courseId) || !dateKey) return null;
  return { courseId, dateKey };
}

export function findOverrideForCourseDate(
  overrides: CourseDateOverride[],
  courseId: number,
  dateIso: string,
): CourseDateOverride | undefined {
  return overrides.find(
    (o) => o.courseId === courseId && sameInstant(o.date, dateIso),
  );
}


/** interne Helferfunktion: liefert alle potenziellen Kurs-Termine inkl. Flags */
function collectCourseDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date,
  now: Date = new Date(),
  tenantSettings?: TenantSettings,
  enrollments: CourseEnrollment[] = [],
  originCourse?: Course,
) {
  if (isNaN(referenceDate.getTime())) return []; // ungültiges Datum → keine Termine

  const originBounded = originCourse != null && isBoundedSeriesPlanningMode(originCourse.planningMode);
  if (originBounded) {
    const originEnd = courseBlockEndIso(originCourse);
    if (originEnd && toIsoDateUtc(now) > originEnd) return [];
  }

  const windowStart = new Date(referenceDate);
  windowStart.setDate(windowStart.getDate() + settings.minOffsetDays);

  const windowEnd = new Date(referenceDate);
  windowEnd.setDate(windowEnd.getDate() + settings.maxOffsetDays);

  return allCourses.flatMap((course) => {
    const courseStatus = course.status ?? "active";
    if (courseStatus !== "active") return [];
    return course.dates
      .map((d) => {
        const date = new Date(d);
        if (isNaN(date.getTime())) {
          console.warn(`Ungültiges Datum in course.dates: ${d} für course ${course.id}`);
          return null; // Ungültige Daten überspringen
        }
        const courseTime = buildCourseTime(date, course.time);
        if (!courseTime) return null; // Ungültige Zeit überspringen
        return courseTime;
      })
      .filter((courseTime): courseTime is Date => courseTime !== null) // Type-Guard
      .filter((courseTime) => {
        if (courseTime < now) return false;
        const dateKey = toDateKey(courseTime);
        if (!isIsoWithinBoundedSeriesRights(dateKey, course)) return false;
        if (originBounded) return true;
        return courseTime >= windowStart && courseTime <= windowEnd;
      })
      .map((courseTime) => {
        const override = overrides.find(
          (o) => o.courseId === course.id && sameInstant(o.date, courseTime)
        );
        const dateKey = toDateKey(courseTime);
        const participants = resolveEffectiveTermOccupancy(
          course,
          override,
          enrollments,
          dateKey,
        ).participants;
        const guestCount = override?.anonymousTrialCount ?? 0;

        const count = participants.length;
        const regularFull = isAtRegularCapacity(count, course, guestCount);
        const maxFull = isAtMaxCapacity(count, course, guestCount);
        const targetInCutoff = isSwapTargetInCutoffWindow(
          dateKey,
          course.time,
          tenantSettings,
          now,
        );
        const currentUserLower = currentUser.nickname.toLowerCase();
        const stem = resolveStemForDate(course, enrollments, dateKey);
        const userAlreadyInThisCourse =
          participants.some((p) => p.toLowerCase() === currentUserLower) ||
          stem.some((p) => p.toLowerCase() === currentUserLower);

        return {
          course,
          date: courseTime,
          time: course.time,
          regularFull,
          maxFull,
          targetInCutoff,
          userAlreadyInThisCourse,
        };
      });
  });
}

function isWaitlistSwapTarget(
  entry: {
    regularFull: boolean;
    userAlreadyInThisCourse: boolean;
    targetInCutoff: boolean;
  },
): boolean {
  if (!entry.regularFull || entry.userAlreadyInThisCourse || entry.targetInCutoff) {
    return false;
  }

  // Regulär volle Termine sind Wartelisten-Ziele — auch bei ausgeschöpfter Überplanung.
  // Nachrücken erfolgt erst unter regulärer capacity (canPromoteFromWaitlist).
  return true;
}

/** freie Termine (nur reguläre Kapazität, keine Überplanungs-Slots) */
export function getAvailableDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date,
  now: Date = new Date(),
  tenantSettings?: TenantSettings,
  enrollments: CourseEnrollment[] = [],
  originCourse?: Course,
) {
  return collectCourseDates(
    allCourses,
    overrides,
    currentUser,
    settings,
    referenceDate,
    now,
    tenantSettings,
    enrollments,
    originCourse,
  )
    .filter((x) => !x.regularFull && !x.userAlreadyInThisCourse && !x.targetInCutoff)
    .map(({ course, date, time }) => ({ course, date, time }));
}

/** regulär volle Termine als Wartelisten-Ziel (Nachrücken / Ringtausch-Vorbereitung) */
export function getWaitlistDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date,
  now: Date = new Date(),
  tenantSettings?: TenantSettings,
  enrollments: CourseEnrollment[] = [],
  originCourse?: Course,
) {
  return collectCourseDates(
    allCourses,
    overrides,
    currentUser,
    settings,
    referenceDate,
    now,
    tenantSettings,
    enrollments,
    originCourse,
  )
    .filter((entry) => isWaitlistSwapTarget(entry))
    .map(({ course, date, time }) => ({ course, date, time }));
}
