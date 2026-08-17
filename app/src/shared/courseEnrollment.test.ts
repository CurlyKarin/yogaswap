import { describe, expect, it } from "vitest";
import {
  ENROLLMENT_OPEN_START,
  buildCourseEnrollmentSortKey,
  buildCourseEnrollmentCoursePrefix,
  buildCourseEnrollmentUserPrefix,
  classifyMembersForDialog,
  formatMembersDialogHeadline,
  enrollmentRangesOverlap,
  isEnrollmentActiveOnDate,
  migrateParticipantsToEnrollments,
  openEnrollmentUserIds,
  parseCourseEnrollmentSortKey,
  planStemEnrollmentWrites,
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

  it("treats adjacent segments as non-overlapping and same-day coverage as overlapping", () => {
    expect(
      enrollmentRangesOverlap(
        { validFrom: "2026-01-01", validUntil: "2026-08-10" },
        { validFrom: "2026-08-17" },
      ),
    ).toBe(false);
    expect(
      enrollmentRangesOverlap(
        { validFrom: "2026-01-01", validUntil: "2026-08-31" },
        { validFrom: "2026-08-17", validUntil: "2026-08-24" },
      ),
    ).toBe(true);
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

  it("planStemEnrollmentWrites bootstraps, adds and closes segments", () => {
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: ["luna", "kai"],
      nextParticipants: ["luna", "mia"],
      existingEnrollments: [],
      addValidFrom: "2026-04-01",
      removeValidUntil: "2026-03-20",
      bootstrapValidFrom: "2026-01-01",
      createdAt: "2026-03-20T10:00:00.000Z",
    });
    expect(planned.bootstrapped).toBe(true);
    expect(planned.closedUserIds).toEqual(["kai"]);
    expect(planned.addedUserIds).toEqual(["mia"]);
    expect(planned.puts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "luna", validFrom: "2026-01-01" }),
        expect.objectContaining({
          userId: "kai",
          validFrom: "2026-01-01",
          validUntil: "2026-03-20",
        }),
        expect.objectContaining({
          userId: "mia",
          validFrom: "2026-04-01",
          source: "manual",
        }),
      ]),
    );
  });

  it("planStemEnrollmentWrites rejoins with a new open segment", () => {
    const existing: CourseEnrollment[] = [
      {
        courseId: 1,
        userId: "luna",
        validFrom: "2026-01-01",
        validUntil: "2026-02-01",
      },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: [],
      nextParticipants: ["luna"],
      existingEnrollments: existing,
      addValidFrom: "2026-04-01",
      removeValidUntil: "2026-03-20",
    });
    expect(planned.puts).toEqual([
      expect.objectContaining({
        userId: "luna",
        validFrom: "2026-04-01",
        source: "manual",
      }),
    ]);
    expect(planned.puts[0]).not.toHaveProperty("validUntil");
  });

  it("planStemEnrollmentWrites reopens a closed segment via addValidFromByUser", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-14" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: ["luna"],
      nextParticipants: ["luna"],
      existingEnrollments: existing,
      addValidFrom: "2026-09-01",
      removeValidUntil: "2026-08-14",
      addValidFromByUser: { luna: "2026-01-01" },
    });
    expect(planned.addedUserIds).toEqual(["luna"]);
    expect(planned.puts).toEqual([
      expect.objectContaining({
        userId: "luna",
        validFrom: "2026-01-01",
        source: "manual",
      }),
    ]);
    expect(planned.puts[0]).not.toHaveProperty("validUntil");
  });

  it("planStemEnrollmentWrites updates validUntil on an already-closed segment", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-10" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: [],
      nextParticipants: [],
      existingEnrollments: existing,
      addValidFrom: "2026-08-24",
      removeValidUntil: "2026-08-10",
      removeValidUntilByUser: { luna: "2026-08-17" },
    });
    expect(planned.closedUserIds).toEqual(["luna"]);
    expect(planned.puts).toEqual([
      expect.objectContaining({ userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-17" }),
    ]);
  });

  it("planStemEnrollmentWrites closes a future-start segment when until is before validFrom", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2099-01-01" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: ["luna"],
      nextParticipants: [],
      existingEnrollments: existing,
      addValidFrom: "2099-01-06",
      removeValidUntil: "2026-08-17",
    });
    expect(planned.closedUserIds).toEqual(["luna"]);
    expect(planned.puts).toEqual([
      expect.objectContaining({
        userId: "luna",
        validFrom: "2099-01-01",
        validUntil: "2026-08-17",
      }),
    ]);
  });

  it("planStemEnrollmentWrites extends a closed segment instead of opening a new one", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-10" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: [],
      nextParticipants: ["luna"],
      existingEnrollments: existing,
      addValidFrom: "2026-08-24",
      removeValidUntil: "2026-08-10",
      removeValidUntilByUser: { luna: "2026-08-24" },
    });
    expect(planned.addedUserIds).toEqual([]);
    expect(planned.closedUserIds).toEqual(["luna"]);
    expect(planned.puts).toEqual([
      expect.objectContaining({ userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-24" }),
    ]);
  });

  it("planStemEnrollmentWrites does not add a segment that would overlap an open one (planned pause not supported)", () => {
    // Person is still active (open segment, validUntil in the future via a separate close later).
    // Attempting a rejoin while the current segment has not yet ended must be blocked.
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01", validUntil: "2026-12-31" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: [],
      nextParticipants: ["luna"],
      existingEnrollments: existing,
      addValidFrom: "2026-09-01",
      removeValidUntil: "2026-08-31",
    });
    expect(planned.addedUserIds).toEqual([]);
    expect(planned.puts).toEqual([]);
  });

  it("planStemEnrollmentWrites does not add a segment that would overlap a closed one", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-31" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: [],
      nextParticipants: ["luna"],
      existingEnrollments: existing,
      addValidFrom: "2026-08-17",
      removeValidUntil: "2026-08-10",
    });
    expect(planned.addedUserIds).toEqual([]);
    expect(planned.puts).toEqual([]);
  });

  it("planStemEnrollmentWrites clamps a close so it does not overlap a later segment", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01" },
      { courseId: 1, userId: "luna", validFrom: "2026-08-24", validUntil: "2026-09-01" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: ["luna"],
      nextParticipants: [],
      existingEnrollments: existing,
      addValidFrom: "2026-08-24",
      removeValidUntil: "2026-08-10",
      removeValidUntilByUser: { luna: "2026-08-31" },
    });
    expect(planned.puts).toEqual([
      expect.objectContaining({ userId: "luna", validFrom: "2026-01-01", validUntil: "2026-08-23" }),
    ]);
  });

  it("planStemEnrollmentWrites uses per-user dates and can close while keeping cache", () => {
    const existing: CourseEnrollment[] = [
      { courseId: 1, userId: "luna", validFrom: "2026-01-01" },
    ];
    const planned = planStemEnrollmentWrites({
      courseId: 1,
      previousParticipants: ["luna"],
      nextParticipants: ["luna", "mia"],
      existingEnrollments: existing,
      addValidFrom: "2026-04-01",
      removeValidUntil: "2026-03-20",
      addValidFromByUser: { mia: "2026-05-01" },
      removeValidUntilByUser: { luna: "2026-03-25" },
    });
    expect(planned.addedUserIds).toEqual(["mia"]);
    expect(planned.closedUserIds).toEqual(["luna"]);
    expect(planned.puts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: "mia", validFrom: "2026-05-01" }),
        expect.objectContaining({ userId: "luna", validUntil: "2026-03-25" }),
      ]),
    );
  });

  it("classifyMembersForDialog splits dabei, kommt and ehemalig", () => {
    const enrollments: CourseEnrollment[] = [
      { courseId: 1, userId: "dabei", validFrom: "2026-01-01" },
      { courseId: 1, userId: "endet", validFrom: "2026-01-01", validUntil: "2026-03-20" },
      { courseId: 1, userId: "kommt", validFrom: "2026-04-01" },
      { courseId: 1, userId: "weg", validFrom: "2026-01-01", validUntil: "2026-02-01" },
    ];
    const groups = classifyMembersForDialog(enrollments, "2026-03-20");
    expect(groups.dabei.map((row) => row.userId)).toEqual(["dabei", "endet"]);
    expect(groups.dabei.find((row) => row.userId === "endet")?.ending).toBe(true);
    expect(groups.kommt.map((row) => row.userId)).toEqual(["kommt"]);
    expect(groups.ehemalig.map((row) => row.userId)).toEqual(["weg"]);
  });

  it("formatMembersDialogHeadline uses singular and plural", () => {
    expect(
      formatMembersDialogHeadline({
        dabeiCount: 6,
        capacity: 6,
        endingCount: 2,
        incomingCount: 2,
      }),
    ).toBe("Teilnehmer 6/6 · 2 enden · 2 kommen neu dazu");
    expect(
      formatMembersDialogHeadline({
        dabeiCount: 6,
        capacity: 6,
        endingCount: 1,
        incomingCount: 1,
      }),
    ).toBe("Teilnehmer 6/6 · 1 endet · 1 kommt neu dazu");
  });
});
