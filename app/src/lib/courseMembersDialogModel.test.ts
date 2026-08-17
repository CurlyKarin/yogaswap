import { describe, expect, it } from "vitest";
import type { CourseEnrollment } from "shared/types";
import { ENROLLMENT_OPEN_START } from "shared/courseEnrollment";
import {
  diffEnrollmentChanges,
  endTermOptions,
  isPastEnrollmentEnd,
  lastClosedCourseTermIso,
  membersDialogReferenceIso,
  nextCourseTermIso,
  nextOpenCourseTermIso,
  openRosterUserIds,
  startTermOptions,
  syntheticOpenEnrollments,
} from "./courseMembersDialogModel";

const mondayMorning = {
  dates: ["2026-08-10", "2026-08-17", "2026-08-24"],
  time: "10:00",
  tenantSettings: { cancellationSwapCutoffMinutesBeforeStart: 60 },
};

describe("courseMembersDialogModel", () => {
  it("uses the next open course term as dialog reference", () => {
    const now = new Date(2026, 7, 17, 9, 30);
    expect(
      membersDialogReferenceIso({
        status: "active",
        ...mondayMorning,
        now,
      }),
    ).toBe("2026-08-24");
    expect(nextOpenCourseTermIso({ ...mondayMorning, now })).toBe("2026-08-24");
    expect(lastClosedCourseTermIso({ ...mondayMorning, now })).toBe("2026-08-17");
  });

  it("uses last course term as reference for inactive courses", () => {
    expect(
      membersDialogReferenceIso({
        status: "inactive",
        dates: ["2026-01-06", "2026-01-13"],
        time: "10:00",
        now: new Date(2026, 7, 14, 9, 0),
      }),
    ).toBe("2026-01-13");
  });

  it("picks the next still-open course term, treating cutoff as past", () => {
    expect(
      nextCourseTermIso(
        ["2026-08-11", "2026-08-18", "2026-08-25"],
        "10:00",
        new Date(2026, 7, 18, 9, 30),
        { cancellationSwapCutoffMinutesBeforeStart: 60 },
      ),
    ).toBe("2026-08-25");
  });

  it("diffs add, end-while-staying, and reopen", () => {
    const previous: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01" },
      { courseId: 1, userId: "dana", validFrom: "2026-01-01", validUntil: "2026-08-20" },
    ];
    const next: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-10" },
      { courseId: 1, userId: "cara", validFrom: "2026-08-24" },
      { courseId: 1, userId: "dana", validFrom: "2026-01-01" },
    ];
    expect(diffEnrollmentChanges(previous, next, "2026-08-17")).toEqual(
      expect.arrayContaining([
        { userId: "alice", action: "remove", dateIso: "2026-08-10" },
        { userId: "cara", action: "add", dateIso: "2026-08-24" },
        { userId: "dana", action: "add", dateIso: "2026-01-01" },
      ]),
    );
    expect(openRosterUserIds(next, "2026-08-17")).toEqual(["dana", "cara"]);
  });

  it("diffs a corrected validUntil even when the person already left the roster", () => {
    const previous: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-10" },
    ];
    const next: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-03" },
    ];
    expect(diffEnrollmentChanges(previous, next, "2026-08-17")).toEqual([
      { userId: "alice", action: "remove", dateIso: "2026-08-03" },
    ]);
  });

  it("diffs an extended validUntil that brings a former member back onto the roster", () => {
    const previous: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-10" },
    ];
    const next: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-24" },
    ];
    expect(diffEnrollmentChanges(previous, next, "2026-08-17")).toEqual([
      { userId: "alice", action: "remove", dateIso: "2026-08-24" },
    ]);
  });

  it("diffs a validUntil correction while the person is still on the roster", () => {
    const previous: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-24" },
    ];
    const next: CourseEnrollment[] = [
      { courseId: 1, userId: "alice", validFrom: "2026-01-01", validUntil: "2026-08-31" },
    ];
    expect(diffEnrollmentChanges(previous, next, "2026-08-17")).toEqual([
      { userId: "alice", action: "remove", dateIso: "2026-08-31" },
    ]);
  });

  it("locks an enrollment end that is already before the reference term", () => {
    expect(isPastEnrollmentEnd("2026-08-10", "2026-08-17")).toBe(true);
    expect(isPastEnrollmentEnd("2026-08-17", "2026-08-17")).toBe(false);
    expect(isPastEnrollmentEnd(undefined, "2026-08-17")).toBe(false);
  });

  it("offers start terms on or after the reference and after a previous until", () => {
    expect(
      startTermOptions({
        dates: ["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"],
        refIso: "2026-08-24",
        afterUntil: "2026-08-17",
      }),
    ).toEqual(["2026-08-24", "2026-08-31"]);
    expect(
      startTermOptions({
        dates: ["2026-08-10", "2026-08-17", "2026-08-24"],
        refIso: "2026-08-17",
        afterUntil: "2026-08-17",
      }),
    ).toEqual(["2026-08-24"]);
  });

  it("offers end terms as last closed plus the reference and later", () => {
    expect(
      endTermOptions({
        dates: ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"],
        refIso: "2026-08-17",
        lastClosed: "2026-08-10",
      }),
    ).toEqual(["2026-08-10", "2026-08-17", "2026-08-24"]);
  });

  it("synthesizes open enrollments from the cache", () => {
    expect(syntheticOpenEnrollments(3, ["luna"])).toEqual([
      { courseId: 3, userId: "luna", validFrom: ENROLLMENT_OPEN_START },
    ]);
  });
});
