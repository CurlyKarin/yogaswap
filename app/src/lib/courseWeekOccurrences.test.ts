import { describe, expect, it } from "vitest";
import type { Course } from "shared/types";
import {
  collectWeekOccurrences,
  getWeekViewCardDates,
  groupWeekRowsByDay,
  isIsoDateInWeek,
  isWeekEntirelyInPast,
  preferredWeekCardDate,
  weekRangeKeys,
} from "./courseWeekOccurrences";

const baseCourse: Pick<Course, "dates" | "excludedDates"> = {
  dates: ["2026-05-25", "2026-06-01"],
  excludedDates: ["2026-05-26"],
};

describe("collectWeekOccurrences", () => {
  const weekStart = new Date(2026, 4, 25);

  it("includes visible and excluded dates in the week", () => {
    const occ = collectWeekOccurrences(baseCourse, weekStart);
    expect(occ.map((o) => o.dateIso)).toEqual(["2026-05-25", "2026-05-26"]);
    expect(occ.find((o) => o.dateIso === "2026-05-26")?.kind).toBe("excluded");
    expect(occ.find((o) => o.dateIso === "2026-05-25")?.kind).toBe("scheduled");
  });

  it("ignores dates outside the week", () => {
    expect(collectWeekOccurrences(baseCourse, weekStart).some((o) => o.dateIso === "2026-06-01")).toBe(
      false,
    );
  });
});

describe("weekRangeKeys", () => {
  it("spans Monday through Sunday locally", () => {
    const keys = weekRangeKeys(new Date(2026, 4, 25));
    expect(keys.start).toBe("2026-05-25");
    expect(keys.end).toBe("2026-05-31");
    expect(isIsoDateInWeek("2026-05-31", keys.start, keys.end)).toBe(true);
    expect(isIsoDateInWeek("2026-06-01", keys.start, keys.end)).toBe(false);
  });
});

describe("preferredWeekCardDate", () => {
  const course: Course = {
    id: 1,
    name: "Test",
    weekday: "Mon",
    time: "10:00",
    capacity: 8,
    participants: [],
    dates: ["2026-05-25", "2026-05-26", "2026-06-08"],
    excludedDates: [],
  };

  it("prefers a future date inside the current week", () => {
    const now = new Date(2026, 4, 20, 12, 0, 0);
    const weekStart = new Date(2026, 4, 25);
    const picked = preferredWeekCardDate(course, weekStart, now);
    expect(picked && toLocalDateIso(picked)).toBe("2026-05-25");
  });

  it("skips excluded dates when picking the default term in a week", () => {
    const courseWithExcluded: Course = {
      ...course,
      dates: ["2026-05-25", "2026-05-26", "2026-06-08"],
      excludedDates: ["2026-05-26"],
    };
    const now = new Date(2026, 4, 20, 12, 0, 0);
    const weekStart = new Date(2026, 4, 25);
    const picked = preferredWeekCardDate(courseWithExcluded, weekStart, now);
    expect(picked && toLocalDateIso(picked)).toBe("2026-05-25");
  });

  it("uses the last occurrence when the week is entirely in the past", () => {
    const now = new Date(2026, 5, 10, 12, 0, 0);
    const weekStart = new Date(2026, 4, 25);
    expect(isWeekEntirelyInPast(weekStart, now)).toBe(true);
    const picked = preferredWeekCardDate(course, weekStart, now);
    expect(picked && toLocalDateIso(picked)).toBe("2026-05-26");
  });
});

describe("getWeekViewCardDates", () => {
  it("includes in-week past dates only while they remain in term grace", () => {
    const course: Course = {
      id: 1,
      name: "Test",
      weekday: "Mon",
      time: "10:00",
      capacity: 8,
      participants: [],
      dates: ["2026-05-26", "2026-06-15"],
      excludedDates: [],
    };
    const now = new Date(2026, 5, 10, 12, 0, 0);
    const weekStart = new Date(2026, 4, 25);
    const keys = getWeekViewCardDates(course, weekStart, undefined, now).map((d) => toLocalDateIso(d));
    expect(keys).not.toContain("2026-05-26");
    expect(keys).toContain("2026-06-15");
  });

  it("includes past grace dates from previous week for term jump", () => {
    const course: Course = {
      id: 1,
      name: "Test",
      weekday: "Mon",
      time: "10:00",
      capacity: 8,
      participants: [],
      dates: ["2026-05-18", "2026-06-15"],
      excludedDates: [],
    };
    const now = new Date(2026, 4, 22, 12, 0, 0);
    const weekStart = new Date(2026, 4, 25);
    const keys = getWeekViewCardDates(
      course,
      weekStart,
      { inactiveGraceDaysAfterCourseEnd: 7 },
      now,
    ).map((d) => toLocalDateIso(d));
    expect(keys).toContain("2026-05-18");
    expect(keys).toContain("2026-06-15");
  });

  it("lists all past block terms until seriesEndDate, ignoring studio grace days", () => {
    const course: Course = {
      id: 1,
      name: "Test",
      weekday: "Mon",
      time: "10:00",
      capacity: 8,
      participants: [],
      planningMode: "bounded_series",
      seriesEndDate: "2026-08-31",
      dates: ["2026-06-03", "2026-06-10", "2026-06-17"],
      excludedDates: [],
    };
    const settings = { inactiveGraceDaysAfterCourseEnd: 7 };
    const now = new Date(2026, 5, 17, 12, 0, 0);
    const thisWeek = new Date(2026, 5, 16);
    const lastWeek = new Date(2026, 5, 9);
    const thisWeekKeys = getWeekViewCardDates(course, thisWeek, settings, now).map((d) =>
      toLocalDateIso(d),
    );
    const lastWeekKeys = getWeekViewCardDates(course, lastWeek, settings, now).map((d) =>
      toLocalDateIso(d),
    );
    expect(thisWeekKeys).toEqual(["2026-06-03", "2026-06-10", "2026-06-17"]);
    expect(lastWeekKeys).toEqual(["2026-06-03", "2026-06-10", "2026-06-17"]);
  });
});

function toLocalDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("groupWeekRowsByDay", () => {
  it("groups and sorts by time then name", () => {
    const groups = groupWeekRowsByDay([
      {
        course: { ...baseCourse, id: 1, name: "Zebra", time: "18:00" } as Course,
        occurrences: [{ dateIso: "2026-05-25", kind: "scheduled" }],
      },
      {
        course: { ...baseCourse, id: 2, name: "Alpha", time: "10:00" } as Course,
        occurrences: [{ dateIso: "2026-05-25", kind: "scheduled" }],
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.course.name)).toEqual(["Alpha", "Zebra"]);
  });
});
