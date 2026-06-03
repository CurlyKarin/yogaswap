import { describe, expect, it } from "vitest";
import type { Course, CourseDateOverride } from "shared/types";
import {
  canRequestSwapFromPastCancelledOrigin,
  canShowCourseInPastWeek,
  computeEarliestWeekAnchor,
  isCourseInParticipantGrace,
  isOccurrenceInPast,
} from "./courseTermActions";
import { startOfWeekMonday } from "./courseWeek";

const endedCourse: Course = {
  id: 1,
  name: "Yoga",
  weekday: "Mon",
  time: "10:00",
  capacity: 8,
  participants: ["maya"],
  dates: ["2026-05-18"],
  seriesEndDate: "2026-05-18",
  status: "active",
};

describe("isCourseInParticipantGrace", () => {
  it("is true while within grace days after course end", () => {
    const now = new Date(2026, 4, 22, 12, 0, 0);
    expect(isCourseInParticipantGrace(endedCourse, { inactiveGraceDaysAfterCourseEnd: 7 }, now)).toBe(
      true,
    );
  });

  it("is false after grace expired", () => {
    const now = new Date(2026, 5, 10, 12, 0, 0);
    expect(isCourseInParticipantGrace(endedCourse, { inactiveGraceDaysAfterCourseEnd: 7 }, now)).toBe(
      false,
    );
  });

  it("is false for active course with upcoming dates", () => {
    const now = new Date(2026, 4, 10, 12, 0, 0);
    const rolling: Course = {
      ...endedCourse,
      dates: ["2026-05-18", "2026-06-15"],
      status: "active",
    };
    expect(isCourseInParticipantGrace(rolling, { inactiveGraceDaysAfterCourseEnd: 7 }, now)).toBe(
      false,
    );
  });

  it("is true for inactive course in grace even with stale future dates in list", () => {
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const inactive: Course = {
      ...endedCourse,
      status: "inactive",
      dates: ["2026-05-18", "2099-01-01"],
    };
    expect(isCourseInParticipantGrace(inactive, { inactiveGraceDaysAfterCourseEnd: 7 }, now)).toBe(
      true,
    );
  });
});

describe("canShowCourseInPastWeek", () => {
  it("hides course outside grace in a past week", () => {
    const pastWeek = startOfWeekMonday(new Date(2026, 4, 11));
    const now = new Date(2026, 5, 10, 12, 0, 0);
    expect(canShowCourseInPastWeek(endedCourse, pastWeek, { inactiveGraceDaysAfterCourseEnd: 7 }, now)).toBe(
      false,
    );
  });

  it("shows course in grace in a past week", () => {
    const pastWeek = startOfWeekMonday(new Date(2026, 4, 11));
    const now = new Date(2026, 4, 18, 12, 0, 0);
    const courseInWeek: Course = {
      ...endedCourse,
      dates: ["2026-05-12"],
      seriesEndDate: "2026-05-12",
    };
    expect(
      canShowCourseInPastWeek(courseInWeek, pastWeek, { inactiveGraceDaysAfterCourseEnd: 7 }, now),
    ).toBe(true);
  });

  it("shows course in past week during calendar grace even with stale future dates", () => {
    const pastWeek = startOfWeekMonday(new Date(2026, 4, 18));
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const withStaleFuture: Course = {
      ...endedCourse,
      status: "active",
      dates: ["2026-05-18", "2099-01-01"],
    };
    expect(
      isCourseInParticipantGrace(withStaleFuture, { inactiveGraceDaysAfterCourseEnd: 7 }, now),
    ).toBe(false);
    expect(
      canShowCourseInPastWeek(withStaleFuture, pastWeek, { inactiveGraceDaysAfterCourseEnd: 7 }, now),
    ).toBe(true);
  });

  it("hides past week when the occurrence is older than grace for ongoing course", () => {
    const pastWeek = startOfWeekMonday(new Date(2026, 4, 11));
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const notEndedYet: Course = {
      ...endedCourse,
      dates: ["2026-05-12", "2026-06-15"],
      seriesEndDate: "2026-06-30",
      status: "active",
    };
    expect(
      canShowCourseInPastWeek(notEndedYet, pastWeek, { inactiveGraceDaysAfterCourseEnd: 7 }, now),
    ).toBe(false);
  });

  it("hides week occurrence that is older than grace window", () => {
    const oldWeek = startOfWeekMonday(new Date(2026, 4, 4));
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const oldCourse: Course = {
      ...endedCourse,
      dates: ["2026-05-05"],
      seriesEndDate: "2026-05-05",
      status: "inactive",
    };
    expect(canShowCourseInPastWeek(oldCourse, oldWeek, { inactiveGraceDaysAfterCourseEnd: 5 }, now)).toBe(
      false,
    );
  });
});

describe("computeEarliestWeekAnchor", () => {
  it("uses the earlier of course-end week and grace lookback from today", () => {
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const earliest = computeEarliestWeekAnchor(
      [endedCourse],
      { inactiveGraceDaysAfterCourseEnd: 7 },
      now,
    );
    expect(earliest.getTime()).toBe(startOfWeekMonday(new Date(2026, 4, 12)).getTime());
  });

  it("allows one grace window step back at the start of the current week", () => {
    const now = new Date(2026, 4, 19, 9, 0, 0);
    const earliest = computeEarliestWeekAnchor(
      [endedCourse],
      { inactiveGraceDaysAfterCourseEnd: 7 },
      now,
    );
    expect(earliest.getTime()).toBe(startOfWeekMonday(new Date(2026, 4, 12)).getTime());
    expect(earliest.getTime()).toBeLessThan(startOfWeekMonday(now).getTime());
  });

  it("allows previous week when lookback falls in the same calendar week as today", () => {
    const courseEndedMonday: Course = {
      ...endedCourse,
      dates: ["2026-05-26"],
      seriesEndDate: "2026-05-26",
    };
    const now = new Date(2026, 4, 27, 12, 0, 0);
    const todayWeek = startOfWeekMonday(now);
    const earliest = computeEarliestWeekAnchor(
      [courseEndedMonday],
      { inactiveGraceDaysAfterCourseEnd: 3 },
      now,
    );
    expect(earliest.getTime()).toBeLessThan(todayWeek.getTime());
  });

  it("enables back navigation for calendar grace even with stale future dates in dates", () => {
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const withStaleFuture: Course = {
      ...endedCourse,
      status: "active",
      dates: ["2026-05-18", "2099-01-01"],
    };
    const earliest = computeEarliestWeekAnchor(
      [withStaleFuture],
      { inactiveGraceDaysAfterCourseEnd: 7 },
      now,
    );
    expect(earliest.getTime()).toBeLessThan(startOfWeekMonday(now).getTime());
  });

  it("keeps previous-week navigation available for ongoing weekly courses", () => {
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const ongoing: Course = {
      ...endedCourse,
      dates: ["2026-05-20", "2026-05-27"],
      seriesEndDate: "2026-06-30",
      status: "active",
    };
    const earliest = computeEarliestWeekAnchor(
      [ongoing],
      { inactiveGraceDaysAfterCourseEnd: 7 },
      now,
    );
    expect(earliest.getTime()).toBeLessThan(startOfWeekMonday(now).getTime());
  });
});

describe("canRequestSwapFromPastCancelledOrigin", () => {
  const override: CourseDateOverride = {
    courseId: 1,
    date: "2026-05-18",
    participants: [],
    swapped: [],
    waitlist: [],
  };

  it("allows swap only for regular cancellation on past term", () => {
    const now = new Date(2026, 4, 20, 12, 0, 0);
    expect(
      canRequestSwapFromPastCancelledOrigin({
        isoDate: "2026-05-18",
        courseTime: "10:00",
        override,
        userName: "maya",
        participants: [],
        originallyParticipant: true,
        now,
      }),
    ).toBe(true);
  });

  it("denies swap on past term without cancellation", () => {
    const now = new Date(2026, 4, 20, 12, 0, 0);
    expect(
      canRequestSwapFromPastCancelledOrigin({
        isoDate: "2026-05-18",
        courseTime: "10:00",
        userName: "maya",
        participants: ["maya"],
        originallyParticipant: true,
        now,
      }),
    ).toBe(false);
  });

  it("denies swap when past term is outside grace window", () => {
    const now = new Date(2026, 4, 25, 12, 0, 0);
    expect(
      canRequestSwapFromPastCancelledOrigin({
        isoDate: "2026-05-18",
        courseTime: "10:00",
        tenantSettings: { inactiveGraceDaysAfterCourseEnd: 5 },
        override,
        userName: "maya",
        participants: [],
        originallyParticipant: true,
        now,
      }),
    ).toBe(false);
  });
});

describe("isOccurrenceInPast", () => {
  it("detects past occurrence", () => {
    expect(isOccurrenceInPast("2020-01-01", "10:00", new Date(2026, 0, 1))).toBe(true);
  });
});
