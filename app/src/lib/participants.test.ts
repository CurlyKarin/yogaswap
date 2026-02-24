import { describe, it, expect } from "vitest";
import { getEffectiveParticipants } from "./participants";
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

describe("getEffectiveParticipants", () => {
  it("gibt course.participants zurück, wenn kein Override für Kurs+Datum existiert", () => {
    const overrides: CourseDateOverride[] = [];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("gibt override.participants zurück, wenn Override für gleichen Kurs und gleiches Datum existiert", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: ["alice", "bob", "charlie"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual([
      "alice",
      "bob",
      "charlie",
    ]);
  });

  it("ignoriert Override mit anderem courseId", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 2,
        date: "2025-06-16",
        participants: ["other"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("ignoriert Override mit anderem Datum", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-23",
        participants: ["only-on-23"],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual(["alice", "bob"]);
  });

  it("gibt leeres Array zurück, wenn Override leere participants hat", () => {
    const overrides: CourseDateOverride[] = [
      {
        courseId: 1,
        date: "2025-06-16",
        participants: [],
      },
    ];
    expect(getEffectiveParticipants(baseCourse, overrides, "2025-06-16")).toEqual([]);
  });
});
