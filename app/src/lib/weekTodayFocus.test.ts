import { describe, expect, it } from "vitest";
import type { Course, Swap } from "shared/types";
import type { WeekCourseRow } from "./courseWeekOccurrences";
import { pickTodayFocusTarget } from "./weekTodayFocus";

const course = (overrides: Partial<Course> & Pick<Course, "id" | "time">): Course => ({
  tenantId: "default-tenant",
  name: `Course ${overrides.id}`,
  weekday: "Monday",
  capacity: 10,
  participants: [],
  dates: ["2099-06-16"],
  ...overrides,
});

function row(c: Course, dateIso: string, kind: "scheduled" | "excluded" = "scheduled"): WeekCourseRow {
  return { course: c, occurrences: [{ dateIso, kind }] };
}

describe("pickTodayFocusTarget", () => {
  const mondayMorning = new Date(2099, 5, 16, 10, 30, 0); // during 10:00–11:30 if 90min

  it("picks the currently running course among visible rows", () => {
    const rows = [
      row(course({ id: 1, time: "09:00", participants: ["maya"] }), "2099-06-16"),
      row(course({ id: 2, time: "10:00" }), "2099-06-16"),
      row(course({ id: 3, time: "18:00", participants: ["maya"] }), "2099-06-16"),
    ];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], mondayMorning)).toEqual({
      courseId: 2,
      dateIso: "2099-06-16",
    });
  });

  it("prefers personally involved course when several are running", () => {
    const rows = [
      row(course({ id: 1, time: "10:00" }), "2099-06-16"),
      row(course({ id: 2, time: "10:00", instructors: ["maya"] }), "2099-06-16"),
    ];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], mondayMorning)).toEqual({
      courseId: 2,
      dateIso: "2099-06-16",
    });
  });

  it("falls back to the next upcoming course chronologically when none are running", () => {
    const beforeAll = new Date(2099, 5, 16, 8, 0, 0);
    const rows = [
      row(course({ id: 1, time: "10:00" }), "2099-06-16"),
      row(course({ id: 2, time: "18:00", participants: ["maya"] }), "2099-06-16"),
    ];
    // Overview: earliest studio class wins over personal involvement later today
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], beforeAll)).toEqual({
      courseId: 1,
      dateIso: "2099-06-16",
    });
  });

  it("picks earliest upcoming when nobody is involved", () => {
    const beforeAll = new Date(2099, 5, 16, 8, 0, 0);
    const rows = [
      row(course({ id: 2, time: "18:00" }), "2099-06-16"),
      row(course({ id: 1, time: "10:00" }), "2099-06-16"),
    ];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], beforeAll)).toEqual({
      courseId: 1,
      dateIso: "2099-06-16",
    });
  });

  it("ignores excluded occurrences", () => {
    const rows = [
      row(course({ id: 1, time: "10:00" }), "2099-06-16", "excluded"),
      row(course({ id: 2, time: "18:00" }), "2099-06-16"),
    ];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], mondayMorning)).toEqual({
      courseId: 2,
      dateIso: "2099-06-16",
    });
  });

  it("returns null when nothing is running or upcoming", () => {
    const evening = new Date(2099, 5, 16, 20, 0, 0);
    const rows = [row(course({ id: 1, time: "10:00" }), "2099-06-16")];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], evening)).toBeNull();
  });

  it("with only involved rows visible, picks next personal upcoming", () => {
    const beforeAll = new Date(2099, 5, 16, 8, 0, 0);
    const rows = [row(course({ id: 2, time: "18:00", participants: ["maya"] }), "2099-06-16")];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, [], beforeAll)).toEqual({
      courseId: 2,
      dateIso: "2099-06-16",
    });
  });

  it("counts swap involvement as personal for running tie-break", () => {
    const swaps: Swap[] = [
      {
        participantId: "maya",
        fromCourseId: 2,
        fromDate: "2099-06-16",
        toCourseId: 9,
        toDate: "2099-06-17",
        status: "pending",
      },
    ];
    const rows = [
      row(course({ id: 1, time: "10:00" }), "2099-06-16"),
      row(course({ id: 2, time: "10:00" }), "2099-06-16"),
    ];
    expect(pickTodayFocusTarget(rows, { nickname: "maya" }, swaps, mondayMorning)).toEqual({
      courseId: 2,
      dateIso: "2099-06-16",
    });
  });
});
