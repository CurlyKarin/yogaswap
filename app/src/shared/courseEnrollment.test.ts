import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_OPEN_START,
  buildCourseEnrollmentSortKey,
  buildCourseEnrollmentCoursePrefix,
  buildCourseEnrollmentUserPrefix,
  isEnrollmentActiveOnDate,
  migrateParticipantsToEnrollments,
  openEnrollmentUserIds,
  parseCourseEnrollmentSortKey,
  resolveEffectiveTermOccupancy,
  resolveMigrationValidFrom,
  resolveStemForDate,
  stemOnDate,
} from "shared/courseEnrollment";
import type { CourseEnrollment } from "shared/types";

describe("courseEnrollment", () => {
  it("builds and parses sort keys", () => {
    const sk = buildCourseEnrollmentSortKey(12, "luna", "2026-03-10");
    expect(sk).toBe("12#luna#2026-03-10");
    expect(parseCourseEnrollmentSortKey(sk)).toEqual({
      courseId: "12",
      userId: "luna",
      validFrom: "2026-03-10",
    });
    expect(buildCourseEnrollmentCoursePrefix(12)).toBe("12#");
    expect(buildCourseEnrollmentUserPrefix(12, "luna")).toBe("12#luna#");
  });

  it("treats validUntil as inclusive", () => {
    const enrollment = { validFrom: "2026-01-01", validUntil: "2026-01-31" };
    expect(isEnrollmentActiveOnDate(enrollment, "2025-12-31")).toBe(false);
    expect(isEnrollmentActiveOnDate(enrollment, "2026-01-01")).toBe(true);
    expect(isEnrollmentActiveOnDate(enrollment, "2026-01-31")).toBe(true);
    expect(isEnrollmentActiveOnDate(enrollment, "2026-02-01")).toBe(false);
  });

  it("stemOnDate returns unique active members", () => {
    const enrollments: CourseEnrollment[] = [
      { courseId: 1, userId: "Alice", validFrom: "2026-01-01", validUntil: "2026-01-15" },
      { courseId: 1, userId: "alice", validFrom: "2026-02-01" },
      { courseId: 1, userId: "Bob", validFrom: ENROLLMENT_OPEN_START },
    ];
    expect(stemOnDate(enrollments, "2026-01-10")).toEqual(["Alice", "Bob"]);
    expect(stemOnDate(enrollments, "2026-01-20")).toEqual(["Bob"]);
    expect(stemOnDate(enrollments, "2026-02-01")).toEqual(["alice", "Bob"]);
  });

  it("migrates participants using seriesStartDate when present", () => {
    expect(
      resolveMigrationValidFrom({ seriesStartDate: "2026-03-01", visibleFrom: "2026-01-01" }),
    ).toBe("2026-03-01");
    expect(resolveMigrationValidFrom({})).toBe(ENROLLMENT_OPEN_START);

    const migrated = migrateParticipantsToEnrollments(
      {
        id: 7,
        tenantId: "default-tenant",
        participants: ["luna", " Luna ", "kai", ""],
        seriesStartDate: "2026-04-01",
      },
      { source: "seed", createdAt: "2026-08-11T12:00:00.000Z" },
    );
    expect(migrated).toEqual([
      {
        tenantId: "default-tenant",
        courseId: 7,
        userId: "luna",
        validFrom: "2026-04-01",
        source: "seed",
        createdAt: "2026-08-11T12:00:00.000Z",
      },
      {
        tenantId: "default-tenant",
        courseId: 7,
        userId: "kai",
        validFrom: "2026-04-01",
        source: "seed",
        createdAt: "2026-08-11T12:00:00.000Z",
      },
    ]);
  });

  it("openEnrollmentUserIds keeps future-ending and open segments", () => {
    const enrollments: CourseEnrollment[] = [
      { courseId: 1, userId: "a", validFrom: "2026-01-01", validUntil: "2026-01-10" },
      { courseId: 1, userId: "b", validFrom: "2026-01-01", validUntil: "2026-12-31" },
      { courseId: 1, userId: "c", validFrom: "2026-01-01" },
    ];
    expect(openEnrollmentUserIds(enrollments, "2026-06-01")).toEqual(["b", "c"]);
  });

  it("resolveStemForDate falls back to course.participants without enrollments", () => {
    const course = { id: 1, participants: ["luna", "kai"] };
    expect(resolveStemForDate(course, [], "2026-03-10")).toEqual(["luna", "kai"]);
    expect(resolveStemForDate(course, undefined, "2026-03-10")).toEqual(["luna", "kai"]);
  });

  it("resolveStemForDate uses stemOnDate when enrollments exist", () => {
    const course = { id: 1, participants: ["luna", "kai"] };
    const enrollments: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-03-01" },
      { courseId: 1, userId: "mia", validFrom: "2026-04-01" },
      { courseId: 2, userId: "other", validFrom: "2026-01-01" },
    ];
    expect(resolveStemForDate(course, enrollments, "2026-03-15")).toEqual(["luna"]);
    expect(resolveStemForDate(course, enrollments, "2026-04-01")).toEqual(["luna", "mia"]);
  });

  it("resolveEffectiveTermOccupancy applies deltas on enrollment stem", () => {
    const course = { id: 1, participants: ["legacy-only"] };
    const enrollments: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01" },
      { courseId: 1, userId: "kai", validFrom: "2026-01-01" },
    ];
    const resolved = resolveEffectiveTermOccupancy(
      course,
      {
        participants: [],
        cancelledParticipants: ["kai"],
        swapped: ["mia"],
      },
      enrollments,
      "2026-02-01",
    );
    expect(resolved.participants).toEqual(["luna", "mia"]);
    expect(resolved.cancelledParticipants).toEqual(["kai"]);
  });
});
