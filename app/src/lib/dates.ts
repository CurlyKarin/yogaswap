// lib/dates.ts
import { CourseDateOverride, Course, User } from "shared/types";
import { isAtMaxCapacity, isAtRegularCapacity } from "shared/courseCapacity";
import { buildCourseOccurrenceLocal } from "shared/courseStatus";
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
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}


/** interne Helferfunktion: liefert alle potenziellen Kurs-Termine inkl. Flags */
function collectCourseDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date,
  now: Date = new Date()
) {
  if (isNaN(referenceDate.getTime())) return []; // ungültiges Datum → keine Termine

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
      .filter(
        (courseTime) =>
          courseTime >= windowStart &&
          courseTime <= windowEnd &&
          courseTime >= now
      )
      .map((courseTime) => {
        const override = overrides.find(
          (o) => o.courseId === course.id && sameInstant(o.date, courseTime)
        );
        const participants = override ? override.participants : course.participants;

        const count = participants.length;
        const regularFull = isAtRegularCapacity(count, course);
        const maxFull = isAtMaxCapacity(count, course);
        const currentUserLower = currentUser.nickname.toLowerCase();
        const userAlreadyInThisCourse =
          participants.some((p) => p.toLowerCase() === currentUserLower) ||
          course.participants.some((p) => p.toLowerCase() === currentUserLower);

        return {
          course,
          date: courseTime,
          time: course.time,
          regularFull,
          maxFull,
          userAlreadyInThisCourse,
        };
      });
  });
}

/** freie Termine (nur reguläre Kapazität, keine Überplanungs-Slots) */
export function getAvailableDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date,
  now: Date = new Date()
) {
  return collectCourseDates(
    allCourses,
    overrides,
    currentUser,
    settings,
    referenceDate,
    now
  )
    .filter((x) => !x.regularFull && !x.userAlreadyInThisCourse)
    .map(({ course, date, time }) => ({ course, date, time }));
}

/** regulär volle Termine mit Überplanungs-Freiraum → Warteliste; bei maxCapacity ausgeschlossen */
export function getWaitlistDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date,
  now: Date = new Date()
) {
  return collectCourseDates(
    allCourses,
    overrides,
    currentUser,
    settings,
    referenceDate,
    now
  )
    .filter((x) => x.regularFull && !x.maxFull && !x.userAlreadyInThisCourse)
    .map(({ course, date, time }) => ({ course, date, time }));
}
