import { describe, expect, it } from "vitest";
import type { Course, Swap } from "shared/types";
import {
  actorMatchesInstructorList,
  hasInstructorAssignment,
  hasRelevantMyCoursesInvolvement,
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
    expect(resolveMyCoursesToggle("participant")).toEqual({
      canToggle: true,
      defaultOnlyMy: true,
    });
  });

  it("always enables toggle for admin/instructor with default all courses (#406)", () => {
    expect(resolveMyCoursesToggle("admin")).toEqual({
      canToggle: true,
      defaultOnlyMy: false,
    });
    expect(resolveMyCoursesToggle("instructor")).toEqual({
      canToggle: true,
      defaultOnlyMy: false,
    });
  });
});

describe("actorMatchesInstructorList (#406)", () => {
  const maya = { nickname: "maya", participantId: "uuid-maya" };

  it("matches nickname case-insensitively", () => {
    expect(actorMatchesInstructorList(["Maya"], maya)).toBe(true);
  });

  it("matches participantId", () => {
    expect(actorMatchesInstructorList(["uuid-maya"], { nickname: "Maya" })).toBe(false);
    expect(actorMatchesInstructorList(["uuid-maya"], maya)).toBe(true);
  });

  it("matches extra aliases such as membership.userId", () => {
    expect(
      actorMatchesInstructorList(["studio-login"], { nickname: "Maya" }, ["studio-login"]),
    ).toBe(true);
  });

  it("does not match other instructors", () => {
    expect(actorMatchesInstructorList(["ines", "other"], maya)).toBe(false);
    expect(actorMatchesInstructorList([], maya)).toBe(false);
    expect(actorMatchesInstructorList(undefined, maya)).toBe(false);
  });
});

describe("hasInstructorAssignment", () => {
  it("detects instructor nickname case-insensitively", () => {
    const courses = [course({ id: 1, instructors: ["Maya"] }), course({ id: 2 })];
    expect(hasInstructorAssignment(courses, "maya")).toBe(true);
    expect(hasInstructorAssignment(courses, "other")).toBe(false);
  });

  it("matches instructor via participantId alias (#406)", () => {
    const courses = [course({ id: 1, instructors: ["uuid-maya"] })];
    expect(
      hasInstructorAssignment(courses, { nickname: "Maya", participantId: "uuid-maya" }),
    ).toBe(true);
    expect(hasInstructorAssignment(courses, { nickname: "Maya" })).toBe(false);
  });
});

describe("isPersonallyInvolvedInCourse", () => {
  const maya = { nickname: "maya" };

  it("matches instructor assignment", () => {
    expect(
      isPersonallyInvolvedInCourse(course({ id: 1, instructors: ["maya"] }), maya, []),
    ).toBe(true);
  });

  it("does not match other instructors on the course (#406)", () => {
    expect(
      isPersonallyInvolvedInCourse(
        course({ id: 1, instructors: ["ines", "other"] }),
        maya,
        [],
      ),
    ).toBe(false);
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

describe("hasRelevantMyCoursesInvolvement (#406)", () => {
  const maya = { nickname: "maya" };

  it("is true for instructor assignment on any course", () => {
    expect(
      hasRelevantMyCoursesInvolvement(
        [course({ id: 1, instructors: ["maya"] }), course({ id: 2, instructors: ["ines"] })],
        maya,
        [],
      ),
    ).toBe(true);
  });

  it("is true for stem or swap involvement without instructor assignment", () => {
    expect(
      hasRelevantMyCoursesInvolvement(
        [course({ id: 1, participants: ["maya"] })],
        maya,
        [],
      ),
    ).toBe(true);
    expect(
      hasRelevantMyCoursesInvolvement(
        [course({ id: 1 }), course({ id: 2 })],
        maya,
        [swap({ participantId: "maya", fromCourseId: 1, toCourseId: 2 })],
      ),
    ).toBe(true);
  });

  it("is false when there is no personal involvement", () => {
    expect(
      hasRelevantMyCoursesInvolvement(
        [course({ id: 1, instructors: ["ines"] }), course({ id: 2 })],
        maya,
        [swap({ participantId: "other", fromCourseId: 1, toCourseId: 2 })],
      ),
    ).toBe(false);
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
