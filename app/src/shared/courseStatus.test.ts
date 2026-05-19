import { describe, it, expect } from "vitest";
import {
  courseEndDateIso,
  getInactiveGraceLastDayIso,
  hasUpcomingCourseOccurrences,
  isCourseInInactiveGracePeriod,
  isWithinPostCourseEndGrace,
  looksLikeAutomaticallyInactive,
  wouldAutoDeactivateBoundedSeries,
} from "shared/courseStatus";
import type { Course } from "shared/types";

const baseCourse: Course = {
  id: 1,
  name: "Test",
  weekday: "Mon",
  time: "10:00",
  capacity: 10,
  participants: [],
  dates: [],
  planningMode: "bounded_series",
};

describe("courseStatus", () => {
  it("ermittelt Kursende aus seriesEndDate", () => {
    expect(courseEndDateIso({ ...baseCourse, seriesEndDate: "2026-05-10" })).toBe("2026-05-10");
  });

  it("prüft Nachlauf für inaktive Kurse", () => {
    const inactive = {
      ...baseCourse,
      status: "inactive" as const,
      seriesEndDate: "2026-05-10",
    };
    const within = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    const after = new Date(Date.UTC(2026, 4, 20, 12, 0, 0));
    expect(isCourseInInactiveGracePeriod(inactive, undefined, within)).toBe(true);
    expect(isCourseInInactiveGracePeriod(inactive, undefined, after)).toBe(false);
    expect(getInactiveGraceLastDayIso(inactive)).toBe("2026-05-17");
  });

  it("prüft upcoming occurrences mit Uhrzeit", () => {
    const term = ["2026-05-18"];
    // UTC-Zeiten: CI läuft in UTC; ISO-Datum + lokale Uhrzeit würden sonst vom Offset abweichen.
    const before = new Date(Date.UTC(2026, 4, 18, 10, 0, 0));
    const after = new Date(Date.UTC(2026, 4, 18, 19, 0, 0));
    expect(hasUpcomingCourseOccurrences(term, "18:00", before)).toBe(true);
    expect(hasUpcomingCourseOccurrences(term, "18:00", after)).toBe(false);
    expect(
      isWithinPostCourseEndGrace(
        { ...baseCourse, dates: term, time: "18:00", seriesEndDate: "2026-05-18" },
        undefined,
        after,
      ),
    ).toBe(true);
  });

  it("erkennt auto-inaktiv-Heuristik und pending deactivation", () => {
    const inactive = { ...baseCourse, status: "inactive" as const };
    const active = { ...baseCourse, status: "active" as const };
    expect(looksLikeAutomaticallyInactive(inactive, false)).toBe(true);
    expect(looksLikeAutomaticallyInactive(active, false)).toBe(false);
    expect(wouldAutoDeactivateBoundedSeries(active, false)).toBe(true);
    expect(wouldAutoDeactivateBoundedSeries(active, true)).toBe(false);
  });
});
