import { describe, expect, it } from "vitest";
import type { Course } from "shared/types";
import { courseApiPathKey, overrideCourseUidFields, swapCourseUidFields } from "./courseUid";

describe("courseUid helpers", () => {
  it("courseApiPathKey prefers uid over numeric id", () => {
    const course = {
      id: 7,
      courseUid: "550e8400-e29b-41d4-a716-446655440000",
    } as Pick<Course, "id" | "courseUid">;
    expect(courseApiPathKey(course)).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("courseApiPathKey falls back to id without uid", () => {
    const course = { id: 3 } as Pick<Course, "id" | "courseUid">;
    expect(courseApiPathKey(course)).toBe("3");
  });

  it("overrideCourseUidFields omits when missing", () => {
    const course = { courseUid: undefined } as Pick<Course, "courseUid">;
    expect(overrideCourseUidFields(course)).toEqual({});
  });

  it("overrideCourseUidFields trims and returns uid", () => {
    const course = { courseUid: "  550e8400-e29b-41d4-a716-446655440000  " };
    expect(overrideCourseUidFields(course)).toEqual({
      courseUid: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("swapCourseUidFields sets both when present", () => {
    const from = { courseUid: "aaa" };
    const to = { courseUid: "bbb" };
    expect(swapCourseUidFields(from, to)).toEqual({
      fromCourseUid: "aaa",
      toCourseUid: "bbb",
    });
  });
});
