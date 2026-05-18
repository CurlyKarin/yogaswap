import { describe, it, expect } from "vitest";
import {
  courseEndDateIso,
  getInactiveGraceLastDayIso,
  isCourseInInactiveGracePeriod,
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

  it("erkennt auto-inaktiv-Heuristik und pending deactivation", () => {
    const inactive = { ...baseCourse, status: "inactive" as const };
    const active = { ...baseCourse, status: "active" as const };
    expect(looksLikeAutomaticallyInactive(inactive, false)).toBe(true);
    expect(looksLikeAutomaticallyInactive(active, false)).toBe(false);
    expect(wouldAutoDeactivateBoundedSeries(active, false)).toBe(true);
    expect(wouldAutoDeactivateBoundedSeries(active, true)).toBe(false);
  });
});
