import {
  resolveEffectiveTermParticipants,
  type EffectiveTermParticipants,
} from "./overrideOccupancy";
import type { Course, CourseDateOverride, CourseEnrollment, CourseEnrollmentSource } from "./types";

/**
 * Sentinel for migrated / unknown start ("schon immer").
 * Used in Dynamo SK `courseId#userId#validFrom`.
 */
export const ENROLLMENT_OPEN_START = "0001-01-01";

const SK_SEPARATOR = "#";

export function buildCourseEnrollmentSortKey(
  courseId: number | string,
  userId: string,
  validFrom: string,
): string {
  return `${String(courseId)}${SK_SEPARATOR}${userId}${SK_SEPARATOR}${validFrom}`;
}

export function buildCourseEnrollmentCoursePrefix(courseId: number | string): string {
  return `${String(courseId)}${SK_SEPARATOR}`;
}

export function buildCourseEnrollmentUserPrefix(
  courseId: number | string,
  userId: string,
): string {
  return `${String(courseId)}${SK_SEPARATOR}${userId}${SK_SEPARATOR}`;
}

export function parseCourseEnrollmentSortKey(
  sortKey: string,
): { courseId: string; userId: string; validFrom: string } | null {
  const parts = sortKey.split(SK_SEPARATOR);
  if (parts.length < 3) return null;
  const validFrom = parts[parts.length - 1] ?? "";
  const courseId = parts[0] ?? "";
  const userId = parts.slice(1, -1).join(SK_SEPARATOR);
  if (!courseId || !userId || !validFrom) return null;
  return { courseId, userId, validFrom };
}

/** Inclusive: active when validFrom ≤ date ≤ validUntil (or until open). */
export function isEnrollmentActiveOnDate(
  enrollment: Pick<CourseEnrollment, "validFrom" | "validUntil">,
  dateIso: string,
): boolean {
  if (enrollment.validFrom > dateIso) return false;
  if (enrollment.validUntil != null && enrollment.validUntil !== "" && dateIso > enrollment.validUntil) {
    return false;
  }
  return true;
}

/**
 * Stem nicknames active on dateIso (unique, case-insensitive; first casing wins).
 */
export function stemOnDate(
  enrollments: Array<Pick<CourseEnrollment, "userId" | "validFrom" | "validUntil">>,
  dateIso: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const enrollment of enrollments) {
    if (!isEnrollmentActiveOnDate(enrollment, dateIso)) continue;
    const key = enrollment.userId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(enrollment.userId);
  }
  return result;
}

export type EnrollmentStemInput = Pick<
  CourseEnrollment,
  "courseId" | "userId" | "validFrom" | "validUntil"
>;

/**
 * Stamm an Termin T: aus CourseEnrollments via `stemOnDate`.
 * Ohne Segmente für den Kurs → Fallback auf `course.participants` (Cache / vor Migration).
 */
export function resolveStemForDate(
  course: Pick<Course, "id" | "participants">,
  enrollments: EnrollmentStemInput[] | null | undefined,
  dateIso: string,
): string[] {
  const forCourse = (enrollments ?? []).filter((entry) => entry.courseId === course.id);
  if (forCourse.length === 0) {
    return [...(course.participants ?? [])];
  }
  return stemOnDate(forCourse, dateIso);
}

/** Occupancy an Termin T: stemOn(T) ⊕ Override-Deltas (#303). */
export function resolveEffectiveTermOccupancy(
  course: Pick<Course, "id" | "participants">,
  override: Pick<
    CourseDateOverride,
    "participants" | "cancelledParticipants" | "swapped" | "shortNoticeCancellations"
  > | null | undefined,
  enrollments: EnrollmentStemInput[] | null | undefined,
  dateIso: string,
): EffectiveTermParticipants {
  return resolveEffectiveTermParticipants(course, override, {
    stemParticipants: resolveStemForDate(course, enrollments, dateIso),
  });
}

export function resolveMigrationValidFrom(
  course: Pick<Course, "seriesStartDate" | "visibleFrom">,
): string {
  if (course.seriesStartDate && /^\d{4}-\d{2}-\d{2}$/.test(course.seriesStartDate)) {
    return course.seriesStartDate;
  }
  if (course.visibleFrom && /^\d{4}-\d{2}-\d{2}$/.test(course.visibleFrom)) {
    return course.visibleFrom;
  }
  return ENROLLMENT_OPEN_START;
}

export type MigrateParticipantsToEnrollmentsOptions = {
  tenantId?: string;
  source?: CourseEnrollmentSource;
  actorUserId?: string;
  createdAt?: string;
  /** Override default validFrom resolution. */
  validFrom?: string;
};

/**
 * Build open enrollment segments from `course.participants` (migration / seed).
 * Does not close or replace existing segments — callers must avoid duplicates.
 */
export function migrateParticipantsToEnrollments(
  course: Pick<Course, "id" | "participants" | "seriesStartDate" | "visibleFrom" | "tenantId">,
  options: MigrateParticipantsToEnrollmentsOptions = {},
): CourseEnrollment[] {
  const validFrom = options.validFrom ?? resolveMigrationValidFrom(course);
  const source = options.source ?? "migration";
  const tenantId = options.tenantId ?? course.tenantId;
  const createdAt = options.createdAt;
  const actorUserId = options.actorUserId;

  const seen = new Set<string>();
  const result: CourseEnrollment[] = [];
  for (const userId of course.participants ?? []) {
    const trimmed = userId.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...(tenantId ? { tenantId } : {}),
      courseId: course.id,
      userId: trimmed,
      validFrom,
      source,
      ...(actorUserId ? { actorUserId } : {}),
      ...(createdAt ? { createdAt } : {}),
    });
  }
  return result;
}

/** Open stem cache: segments without validUntil (or until in the future relative to `asOf`). */
export function openEnrollmentUserIds(
  enrollments: Array<Pick<CourseEnrollment, "userId" | "validUntil">>,
  asOfIso?: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const enrollment of enrollments) {
    if (enrollment.validUntil != null && enrollment.validUntil !== "") {
      if (asOfIso != null && enrollment.validUntil < asOfIso) continue;
    }
    const key = enrollment.userId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(enrollment.userId);
  }
  return result;
}
