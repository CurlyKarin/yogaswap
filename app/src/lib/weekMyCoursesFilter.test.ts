import { describe, expect, it } from "vitest";
import type { Course, Swap } from "shared/types";
import {
  hasInstructorAssignment,
  isPersonallyInvolvedInCourse,
  narrowWeekOccurrencesForOnlyMyCourses,
  personalSwapDateIsosForCourse,
  resolveMyCoursesToggle,
} from "./weekMyCoursesFilter";

const course = (overrides: Partial<Course> & Pick<Course, "id">): Course => ({
  tenantId: "default-tenant",
  name: `Course ${overrides.id}`,
  weekday: "Monday",
  time: "10:00",
  capacity: 10,
  participants: [],
  dates: ["2099-06-16"],
  ...overrides,
});

const swap = (overrides: Partial<Swap> & Pick<Swap, "fromCourseId" | "toCourseId">): Swap => ({
  participantId: "maya",
  fromDate: "2099-06-16",
  toDate: "2099-06-17",
  status: "pending",
  ...overrides,
});

describe("resolveMyCoursesToggle", () => {
  it("activates only-my default for participants", () => {
    expect(resolveMyCoursesToggle("participant", false)).toEqual({
      canToggle: true,
      defaultOnlyMy: true,
    });
  });

  it("disables toggle for admin/instructor without assignment", () => {
    expect(resolveMyCoursesToggle("admin", false)).toEqual({
      canToggle: false,
      defaultOnlyMy: false,
    });
    expect(resolveMyCoursesToggle("instructor", false)).toEqual({
      canToggle: false,
      defaultOnlyMy: false,
    });
  });

  it("enables only-my default when admin/instructor has assignment", () => {
    expect(resolveMyCoursesToggle("admin", true)).toEqual({
      canToggle: true,
      defaultOnlyMy: true,
    });
    expect(resolveMyCoursesToggle("instructor", true)).toEqual({
      canToggle: true,
      defaultOnlyMy: true,
    });
  });
});

describe("hasInstructorAssignment", () => {
  it("detects instructor nickname case-insensitively", () => {
    const courses = [course({ id: 1, instructors: ["Maya"] }), course({ id: 2 })];
    expect(hasInstructorAssignment(courses, "maya")).toBe(true);
    expect(hasInstructorAssignment(courses, "other")).toBe(false);
  });
});

describe("isPersonallyInvolvedInCourse", () => {
  const maya = { nickname: "maya" };

  it("matches instructor assignment", () => {
    expect(
      isPersonallyInvolvedInCourse(course({ id: 1, instructors: ["maya"] }), maya, []),
    ).toBe(true);
  });

  it("matches stem participation", () => {
    expect(
      isPersonallyInvolvedInCourse(course({ id: 1, participants: ["maya"] }), maya, []),
    ).toBe(true);
  });

  it("matches swaps from or to the course", () => {
    const origin = course({ id: 1 });
    const target = course({ id: 2 });
    const swaps = [swap({ participantId: "maya", fromCourseId: 1, toCourseId: 2 })];
    expect(isPersonallyInvolvedInCourse(origin, maya, swaps)).toBe(true);
    expect(isPersonallyInvolvedInCourse(target, maya, swaps)).toBe(true);
    expect(isPersonallyInvolvedInCourse(course({ id: 3 }), maya, swaps)).toBe(false);
  });

  it("ignores other users' swaps", () => {
    const swaps = [swap({ participantId: "other", fromCourseId: 1, toCourseId: 2 })];
    expect(isPersonallyInvolvedInCourse(course({ id: 1 }), maya, swaps)).toBe(false);
  });
});

describe("narrowWeekOccurrencesForOnlyMyCourses (#298)", () => {
  const maya = { nickname: "maya" };
  const weekOcc = [
    { dateIso: "2099-06-16", kind: "scheduled" as const },
    { dateIso: "2099-06-18", kind: "scheduled" as const },
    { dateIso: "2099-06-20", kind: "excluded" as const },
  ];

  it("keeps all occurrences for stem participants", () => {
    const stem = course({ id: 2, participants: ["maya"] });
    const swaps = [
      swap({
        participantId: "maya",
        fromCourseId: 1,
        toCourseId: 2,
        toDate: "2099-06-16",
        status: "active",
      }),
    ];
    expect(narrowWeekOccurrencesForOnlyMyCourses(stem, weekOcc, maya, swaps)).toEqual(weekOcc);
  });

  it("keeps all occurrences for instructors", () => {
    const taught = course({ id: 2, instructors: ["maya"] });
    expect(narrowWeekOccurrencesForOnlyMyCourses(taught, weekOcc, maya, [])).toEqual(weekOcc);
  });

  it("keeps only swap target dates for pure swap-in courses", () => {
    const target = course({ id: 2 });
    const swaps = [
      swap({
        participantId: "maya",
        fromCourseId: 1,
        fromDate: "2099-06-10",
        toCourseId: 2,
        toDate: "2099-06-16",
        status: "active",
      }),
    ];
    expect(narrowWeekOccurrencesForOnlyMyCourses(target, weekOcc, maya, swaps)).toEqual([
      { dateIso: "2099-06-16", kind: "scheduled" },
    ]);
  });

  it("includes pending swap dates", () => {
    const target = course({ id: 2 });
    const swaps = [
      swap({
        participantId: "maya",
        fromCourseId: 1,
        toCourseId: 2,
        toDate: "2099-06-18",
        status: "pending",
      }),
    ];
    expect(narrowWeekOccurrencesForOnlyMyCourses(target, weekOcc, maya, swaps).map((o) => o.dateIso)).toEqual([
      "2099-06-18",
    ]);
  });

  it("returns empty when no swap date falls in the week", () => {
    const target = course({ id: 2 });
    const swaps = [
      swap({
        participantId: "maya",
        fromCourseId: 1,
        toCourseId: 2,
        toDate: "2099-07-01",
        status: "active",
      }),
    ];
    expect(narrowWeekOccurrencesForOnlyMyCourses(target, weekOcc, maya, swaps)).toEqual([]);
  });

  it("keeps origin swap dates on non-stem origin courses", () => {
    const origin = course({ id: 1 });
    const swaps = [
      swap({
        participantId: "maya",
        fromCourseId: 1,
        fromDate: "2099-06-20",
        toCourseId: 2,
        toDate: "2099-06-21",
        status: "active",
      }),
    ];
    expect(narrowWeekOccurrencesForOnlyMyCourses(origin, weekOcc, maya, swaps)).toEqual([
      { dateIso: "2099-06-20", kind: "excluded" },
    ]);
  });
});

describe("personalSwapDateIsosForCourse", () => {
  it("collects from and to dates for the actor", () => {
    const dates = personalSwapDateIsosForCourse(2, { nickname: "maya" }, [
      swap({
        participantId: "maya",
        fromCourseId: 1,
        fromDate: "2099-06-10",
        toCourseId: 2,
        toDate: "2099-06-16",
      }),
      swap({
        participantId: "other",
        fromCourseId: 3,
        toCourseId: 2,
        toDate: "2099-06-18",
      }),
    ]);
    expect(Array.from(dates).sort()).toEqual(["2099-06-16"]);
  });
});
