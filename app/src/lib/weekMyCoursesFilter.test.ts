import { describe, expect, it } from "vitest";
import type { Course, Swap } from "shared/types";
import {
  hasInstructorAssignment,
  isPersonallyInvolvedInCourse,
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
  user: "maya",
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
  it("matches instructor assignment", () => {
    expect(
      isPersonallyInvolvedInCourse(course({ id: 1, instructors: ["maya"] }), "maya", []),
    ).toBe(true);
  });

  it("matches stem participation", () => {
    expect(
      isPersonallyInvolvedInCourse(course({ id: 1, participants: ["maya"] }), "maya", []),
    ).toBe(true);
  });

  it("matches swaps from or to the course", () => {
    const origin = course({ id: 1 });
    const target = course({ id: 2 });
    const swaps = [swap({ user: "maya", fromCourseId: 1, toCourseId: 2 })];
    expect(isPersonallyInvolvedInCourse(origin, "maya", swaps)).toBe(true);
    expect(isPersonallyInvolvedInCourse(target, "maya", swaps)).toBe(true);
    expect(isPersonallyInvolvedInCourse(course({ id: 3 }), "maya", swaps)).toBe(false);
  });

  it("ignores other users' swaps", () => {
    const swaps = [swap({ user: "other", fromCourseId: 1, toCourseId: 2 })];
    expect(isPersonallyInvolvedInCourse(course({ id: 1 }), "maya", swaps)).toBe(false);
  });
});
