import { buildCourseOccurrenceLocal } from "@yogaswap/shared";

/** Spiegel der processPromotions-Hilfsfunktion (TZ=Europe/Berlin auf Lambda). */
function isCourseInFuture(
  courseDate: string,
  courseTime: string,
  now: Date,
  bufferMinutes: number,
): boolean {
  const courseStart = buildCourseOccurrenceLocal(courseDate, courseTime);
  if (!courseStart) return false;
  const bufferTime = new Date(now.getTime() + bufferMinutes * 60 * 1000);
  return courseStart >= bufferTime;
}

describe("processPromotions isCourseInFuture / personal buffer", () => {
  it("sperrt Nachrücken wenn persönlicher Puffer 210 und Termin in 160 Min. (Ida-Fall)", () => {
    // 13.11. 15:20 Europe/Berlin, FreitagsYoga 18:00
    const now = new Date(2026, 10, 13, 15, 20);
    expect(isCourseInFuture("2026-11-13", "18:00", now, 210)).toBe(false);
    expect(isCourseInFuture("2026-11-13", "18:00", now, 120)).toBe(true);
  });
});
