// lib/dates.ts
import type { Course, CourseDateOverride, User, SwapSettings } from "../types";


/** Datum d + "HH:MM" aus course.time -> Date mit korrekter Startzeit (lokal) */
function buildCourseTime(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0);
}

/** vergleicht Gleichheit als „gleicher Zeitpunkt“ (UTC-sicher) */
function sameInstant(a: Date | string, b: Date | string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

/*************  ✨ Windsurf Command 🌟  *************/
export function getAvailableDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  referenceDate: Date
) {
  const now = new Date();

  // Zeitfenster um das Referenz-Datum (inkl. Uhrzeit des Referenz-Termins – so ist’s am präzisesten)
  const windowStart = new Date(referenceDate);
  windowStart.setDate(windowStart.getDate() + settings.minOffsetDays);

  const windowEnd = new Date(referenceDate);
  windowEnd.setDate(windowEnd.getDate() + settings.maxOffsetDays);

  return allCourses.flatMap((course) => {

    return course.dates
      // zu jedem Kursdatum die tatsächliche Startzeit aufbauen
      .map((d) => buildCourseTime(new Date(d), course.time))
      // ausschließlich Termine, die:
      // 1) im Zeitfenster liegen (inkl. heute, wenn Startzeit noch >= now),
      // 2) ab jetzt in der Zukunft liegen (heute ist ok, wenn Startzeit noch nicht vorbei ist)
      .filter((courseTime) => {
        return courseTime >= windowStart && courseTime <= windowEnd && courseTime >= now;
      })
      // Teilnehmerlage prüfen (Overrides beachten)
      .map((courseTime) => {
        // Teilnehmerliste für diesen Termin bestimmen
        const override = overrides.find(
          (o) => o.courseId === course.id && sameInstant(o.date, courseTime)
        );
        const participants = override ? override.participants : course.participants;

        const isFull = participants.length >= course.capacity;
        // dem currentUser soll weder ein Termin vorgeschlagen bekommen, zu dem er bereits getauscht hat, noch einen in den er dauerhaft eingeschrieben ist
        const userAlreadyInThisCourse = participants.includes(currentUser.nickname) || course.participants.includes(currentUser.nickname);

        return {
          course,
          date: courseTime,
          time: course.time,
          isFull,
          userAlreadyInThisCourse,
        };
      })
      // nur freie Plätze und wo der User nicht bereits drin ist
      .filter((x) => !x.isFull && !x.userAlreadyInThisCourse)
      // für dein UI: { course, date }
      .map(({ course, date, time }) => ({ course, date, time }));
  });
}
