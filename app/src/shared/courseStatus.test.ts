import { describe, it, expect } from "vitest";
import {
  courseBlockEndIso,
  courseEndDateIso,
  effectiveAutoInactiveDeadlineIso,
  participantCourseAccessDeadlineIso,
  lastScheduledOccurrenceIso,
  getInactiveGraceLastDayIso,
  hasUpcomingCourseOccurrences,
  isCourseInInactiveGracePeriod,
  isWithinPostCourseEndGrace,
  looksLikeAutomaticallyInactive,
  shouldAutoDeactivateCourse,
  supportsAutoInactiveTransition,
  wouldAutoDeactivateOnReconcile,
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

  it("lastScheduledOccurrenceIso nutzt nur dates ohne seriesEndDate", () => {
    expect(lastScheduledOccurrenceIso({ dates: [] })).toBeUndefined();
    expect(
      lastScheduledOccurrenceIso({
        dates: ["2026-05-10", "2026-06-14"],
      }),
    ).toBe("2026-06-14");
  });

  it("prüft Nachlauf für inaktive Kurse", () => {
    const inactive = {
      ...baseCourse,
      status: "inactive" as const,
      seriesEndDate: "2026-05-10",
      dates: ["2026-05-10"],
    };
    const within = new Date(Date.UTC(2026, 4, 15, 12, 0, 0));
    const after = new Date(Date.UTC(2026, 4, 20, 12, 0, 0));
    expect(isCourseInInactiveGracePeriod(inactive, undefined, within)).toBe(true);
    expect(isCourseInInactiveGracePeriod(inactive, undefined, after)).toBe(false);
    expect(getInactiveGraceLastDayIso(inactive)).toBe("2026-05-17");
  });

  it("verlängert Teilnehmer-Zugriffsfrist bei letztem Termin nach Blockende", () => {
    const course = {
      ...baseCourse,
      status: "inactive" as const,
      seriesEndDate: "2026-06-30",
      dates: ["2026-07-05"],
    };
    expect(participantCourseAccessDeadlineIso(course)).toBe("2026-07-12");
    const within = new Date(Date.UTC(2026, 6, 10, 12, 0, 0));
    const after = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    expect(isWithinPostCourseEndGrace(course, undefined, within)).toBe(true);
    expect(isWithinPostCourseEndGrace(course, undefined, after)).toBe(false);
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

  it("ermittelt Blockende fuer Auto-Inaktiv", () => {
    expect(
      courseBlockEndIso({ ...baseCourse, seriesEndDate: "2026-06-30" }),
    ).toBe("2026-06-30");
    expect(
      courseBlockEndIso({
        ...baseCourse,
        planningMode: "rolling_continuous",
        plannedEndDate: "2026-08-01",
      }),
    ).toBe("2026-08-01");
    expect(
      courseBlockEndIso({ ...baseCourse, planningMode: "rolling_continuous" }),
    ).toBeUndefined();
    expect(supportsAutoInactiveTransition({ ...baseCourse, seriesEndDate: "2026-06-30" })).toBe(
      true,
    );
    expect(supportsAutoInactiveTransition({ ...baseCourse, planningMode: "rolling_continuous" })).toBe(
      false,
    );
  });

  it("berechnet effektive Auto-Inaktiv-Frist aus Blockende und letztem Termin", () => {
    const course = {
      ...baseCourse,
      seriesEndDate: "2026-06-30",
      dates: ["2026-03-15", "2026-05-10"],
    };
    expect(effectiveAutoInactiveDeadlineIso(course)).toBe("2026-06-30");
    const lateLastTerm = {
      ...baseCourse,
      seriesEndDate: "2026-06-30",
      dates: ["2026-07-05"],
    };
    expect(participantCourseAccessDeadlineIso(lateLastTerm)).toBe("2026-07-12");
    expect(effectiveAutoInactiveDeadlineIso(lateLastTerm)).toBe("2026-07-12");
  });

  it("prüft shouldAutoDeactivateCourse nach Blockende + Nachlauf", () => {
    const activeInBlock = {
      ...baseCourse,
      status: "active" as const,
      seriesEndDate: "2026-06-30",
      dates: ["2026-03-15"],
    };
    const beforeEnd = new Date(Date.UTC(2026, 3, 1, 12, 0, 0));
    const afterEnd = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    expect(shouldAutoDeactivateCourse(activeInBlock, undefined, beforeEnd)).toBe(false);
    expect(shouldAutoDeactivateCourse(activeInBlock, undefined, afterEnd)).toBe(true);
    expect(wouldAutoDeactivateOnReconcile(activeInBlock, true, undefined, beforeEnd)).toBe(
      false,
    );
    expect(wouldAutoDeactivateOnReconcile(activeInBlock, false, undefined, afterEnd)).toBe(true);
  });

  it("erkennt auto-inaktiv-Heuristik und pending deactivation", () => {
    const inactive = {
      ...baseCourse,
      status: "inactive" as const,
      seriesEndDate: "2020-01-31",
      dates: ["2020-01-06"],
    };
    const inactiveRolling = {
      ...baseCourse,
      status: "inactive" as const,
      planningMode: "rolling_continuous" as const,
      plannedEndDate: "2020-01-31",
      dates: ["2020-01-06"],
    };
    const activePastBlock = {
      ...baseCourse,
      status: "active" as const,
      seriesEndDate: "2020-01-31",
      dates: ["2020-01-06"],
    };
    const activeInBlock = {
      ...baseCourse,
      status: "active" as const,
      seriesEndDate: "2099-12-31",
      dates: ["2020-01-06"],
    };
    const manualInactiveRolling = {
      ...baseCourse,
      status: "inactive" as const,
      planningMode: "rolling_continuous" as const,
      dates: ["2099-06-16"],
    };
    const afterBlock = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
    expect(looksLikeAutomaticallyInactive(inactive, false)).toBe(true);
    expect(looksLikeAutomaticallyInactive(inactiveRolling, false)).toBe(true);
    expect(looksLikeAutomaticallyInactive(manualInactiveRolling, true)).toBe(false);
    expect(looksLikeAutomaticallyInactive(activePastBlock, false)).toBe(false);
    expect(wouldAutoDeactivateOnReconcile(activePastBlock, true, undefined, afterBlock)).toBe(
      true,
    );
    expect(wouldAutoDeactivateOnReconcile(activeInBlock, false, undefined, afterBlock)).toBe(
      false,
    );
  });
});
