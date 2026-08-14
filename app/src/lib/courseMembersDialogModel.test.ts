import { describe, expect, it } from "vitest";
import type { CourseEnrollment } from "shared/types";
import { ENROLLMENT_OPEN_START } from "shared/courseEnrollment";
import {
  diffEnrollmentChanges,
  membersDialogReferenceIso,
  nextCourseTermIso,
  openRosterUserIds,
  syntheticOpenEnrollments,
} from "./courseMembersDialogModel";

describe("courseMembersDialogModel", () => {
  it("uses today as dialog reference for active courses", () => {
    expect(
      membersDialogReferenceIso({
        status: "active",
        dates: ["2026-01-01"],
        now: new Date(2026, 7, 14, 9, 0),
      }),
    ).toBe("2026-08-14");
  });

  it("uses last course term as reference for inactive courses", () => {
    expect(
      membersDialogReferenceIso({
        status: "inactive",
        dates: ["2026-01-06", "2026-01-13"],
        now: new Date(2026, 7, 14, 9, 0),
      }),
    ).toBe("2026-01-13");
  });

  it("picks the next upcoming course term", () => {
    expect(
      nextCourseTermIso(["2026-08-11", "2026-08-18", "2026-08-25"], "10:00", new Date(2026, 7, 14, 9, 0)),
    ).toBe("2026-08-18");
  });

  it("diffs add, end-while-staying, and reopen", () => {
    const previous: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01" },
      { courseId: 1, userId: "dana", validFrom: "2026-01-01", validUntil: "2026-08-20" },
    ];
    const next: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-14" },
      { courseId: 1, userId: "cara", validFrom: "2026-08-18" },
      { courseId: 1, userId: "dana", validFrom: "2026-01-01" },
    ];
    expect(diffEnrollmentChanges(previous, next, "2026-08-14")).toEqual(
      expect.arrayContaining([
        { userId: "alice", action: "remove", dateIso: "2026-08-14" },
        { userId: "cara", action: "add", dateIso: "2026-08-18" },
        { userId: "dana", action: "add", dateIso: "2026-01-01" },
      ]),
    );
    expect(openRosterUserIds(next, "2026-08-14")).toEqual(["alice", "dana", "cara"]);
  });

  it("synthesizes open enrollments from the cache", () => {
    expect(syntheticOpenEnrollments(3, ["luna"])).toEqual([
      { courseId: 3, userId: "luna", validFrom: ENROLLMENT_OPEN_START },
    ]);
  });
});
