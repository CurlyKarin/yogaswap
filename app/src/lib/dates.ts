// lib/dates.ts
import { CourseDateOverride, Course } from "@shared/types";
import type { User, SwapSettings } from "../types";

export function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function buildCourseTime(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
}

export function sameInstant(a: Date | string, b: Date | string): boolean {
  return sameDayUTC(new Date(a), new Date(b));
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD"
}


/** interne Helferfunktion: liefert alle potenziellen Kurs-Termine inkl. Flags */
function collectCourseDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date
) {
  const now = new Date();

  const windowStart = new Date(referenceDate);
  windowStart.setDate(windowStart.getDate() + settings.minOffsetDays);

  const windowEnd = new Date(referenceDate);
  windowEnd.setDate(windowEnd.getDate() + settings.maxOffsetDays);

  return allCourses.flatMap((course) => {
    return course.dates
      .map((d) => buildCourseTime(new Date(d), course.time))
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

        const isFull = participants.length >= course.capacity;
        const userAlreadyInThisCourse =
          participants.includes(currentUser.nickname) ||
          course.participants.includes(currentUser.nickname);

        return {
          course,
          date: courseTime,
          time: course.time,
          isFull,
          userAlreadyInThisCourse,
        };
      });
  });
}

/** freie Termine */
export function getAvailableDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date
) {
  return collectCourseDates(
    allCourses,
    overrides,
    currentUser,
    settings,
    referenceDate
  )
    .filter((x) => !x.isFull && !x.userAlreadyInThisCourse)
    .map(({ course, date, time }) => ({ course, date, time }));
}

/** volle Termine → Warteliste */
export function getWaitlistDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date
) {
  return collectCourseDates(
    allCourses,
    overrides,
    currentUser,
    settings,
    referenceDate
  )
    .filter((x) => x.isFull && !x.userAlreadyInThisCourse)
    .map(({ course, date, time }) => ({ course, date, time }));
}
