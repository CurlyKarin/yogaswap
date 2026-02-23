import { describe, it, expect } from "vitest";
import { getEffectiveWaitlist } from "./waitlist";
import type { Course, CourseDateOverride } from "shared/types";

const baseCourse: Course = {
  id: 1,
  name: "Yoga Basics",
  weekday: "Mon",
  time: "18:30",
  capacity: 10,
  participants: ["alice", "bob"],
  dates: ["2025-06-16", "2025-06-23"],
};

describe("getEffectiveWaitlist", () => {
  it("gibt leeres Array zurück, wenn kein Override für Kurs+Datum existiert", () => {
    const overrides: CourseDateOverride[] = [];
    expect(getEffectiveWaitlist(baseCourse, overrides, "2025-06-16")).toEqual([]);
  });

  it("gibt override.waitlist zurück, wenn Override für gleichen Kurs und gleichen Kalendertag existiert", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: ["alice", "bob", "charlie"],
        waitlist: ["dave", "eve"],
      },
    ];
    expect(getEffectiveWaitlist(baseCourse, overrides, "2025-06-16")).toEqual(["dave", "eve"]);
  });

  it("vergleicht Datum per sameInstant (gleicher Kalendertag)", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: [],
        waitlist: ["first"],
      },
    ];
    expect(getEffectiveWaitlist(baseCourse, overrides, "2025-06-16T18:30:00Z")).toEqual(["first"]);
  });

  it("gibt leeres Array, wenn Override kein waitlist hat (?? [])", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: ["alice"],
      },
    ];
    expect(getEffectiveWaitlist(baseCourse, overrides, "2025-06-16")).toEqual([]);
  });

  it("ignoriert Override mit anderem courseId", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 2,
        date: "2025-06-16",
        participants: [],
        waitlist: ["other-course"],
      },
    ];
    expect(getEffectiveWaitlist(baseCourse, overrides, "2025-06-16")).toEqual([]);
  });

  it("ignoriert Override mit anderem Tag", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-23",
        participants: [],
        waitlist: ["on-23"],
      },
    ];
    expect(getEffectiveWaitlist(baseCourse, overrides, "2025-06-16")).toEqual([]);
  });
});
