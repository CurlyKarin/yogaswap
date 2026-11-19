import { describe, expect, it } from "vitest";
import {
  DEFAULT_COURSE_DURATION_MINUTES,
  MAX_COURSE_DURATION_MINUTES,
  addMinutesToHhMm,
  formatCourseTimeRange,
  isValidCourseDurationMinutes,
  parseCourseDurationMinutesInput,
  resolveCourseDurationMinutes,
} from "shared/courseDuration";

describe("courseDuration", () => {
  it("accepts integers in 15–420 (7h)", () => {
    expect(isValidCourseDurationMinutes(15)).toBe(true);
    expect(isValidCourseDurationMinutes(75)).toBe(true);
    expect(isValidCourseDurationMinutes(240)).toBe(true);
    expect(isValidCourseDurationMinutes(MAX_COURSE_DURATION_MINUTES)).toBe(true);
  });

  it("rejects out of range and non-integers", () => {
    expect(isValidCourseDurationMinutes(14)).toBe(false);
    expect(isValidCourseDurationMinutes(421)).toBe(false);
    expect(isValidCourseDurationMinutes(90.5)).toBe(false);
    expect(isValidCourseDurationMinutes("90")).toBe(false);
    expect(isValidCourseDurationMinutes(undefined)).toBe(false);
  });

  it("resolves missing/invalid to default 90", () => {
    expect(resolveCourseDurationMinutes(undefined)).toBe(DEFAULT_COURSE_DURATION_MINUTES);
    expect(resolveCourseDurationMinutes(null)).toBe(DEFAULT_COURSE_DURATION_MINUTES);
    expect(resolveCourseDurationMinutes(10)).toBe(DEFAULT_COURSE_DURATION_MINUTES);
    expect(resolveCourseDurationMinutes(75)).toBe(75);
  });

  it("parses form input with empty → default", () => {
    expect(parseCourseDurationMinutesInput("")).toBe(90);
    expect(parseCourseDurationMinutesInput(" 75 ")).toBe(75);
    expect(parseCourseDurationMinutesInput("420")).toBe(420);
    expect(parseCourseDurationMinutesInput("14")).toBeNull();
    expect(parseCourseDurationMinutesInput("abc")).toBeNull();
  });

  it("adds minutes to HH:mm including midnight wrap", () => {
    expect(addMinutesToHhMm("10:00", 60)).toBe("11:00");
    expect(addMinutesToHhMm("10:00", 75)).toBe("11:15");
    expect(addMinutesToHhMm("23:00", 90)).toBe("00:30");
    expect(addMinutesToHhMm("bad", 60)).toBeNull();
  });

  it("formats start–end display range", () => {
    expect(formatCourseTimeRange("10:00", 60)).toBe("10:00 – 11:00");
    expect(formatCourseTimeRange("18:00")).toBe("18:00 – 19:30");
  });
});
