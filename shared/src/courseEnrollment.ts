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

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

export function isEnrollmentOpen(
  enrollment: Pick<CourseEnrollment, "validUntil">,
): boolean {
  return enrollment.validUntil == null || enrollment.validUntil === "";
}

/** Latest open segment for a user (by validFrom), or null. */
export function findOpenEnrollmentForUser(
  enrollments: Array<Pick<CourseEnrollment, "userId" | "validFrom" | "validUntil">>,
  userId: string,
): (typeof enrollments)[number] | null {
  const key = userId.toLowerCase();
  let best: (typeof enrollments)[number] | null = null;
  for (const enrollment of enrollments) {
    if (enrollment.userId.toLowerCase() !== key) continue;
    if (!isEnrollmentOpen(enrollment)) continue;
    if (!best || enrollment.validFrom > best.validFrom) best = enrollment;
  }
  return best;
}

export function diffParticipantLists(
  previous: string[],
  next: string[],
): { added: string[]; removed: string[] } {
  const previousSet = new Set(previous.map((entry) => entry.toLowerCase()));
  const nextSet = new Set(next.map((entry) => entry.toLowerCase()));
  return {
    added: next.filter((entry) => !previousSet.has(entry.toLowerCase())),
    removed: previous.filter((entry) => !nextSet.has(entry.toLowerCase())),
  };
}

export type BuildOpenEnrollmentInput = {
  courseId: number;
  userId: string;
  validFrom: string;
  tenantId?: string;
  source?: CourseEnrollmentSource;
  actorUserId?: string;
  createdAt?: string;
};

export function buildOpenEnrollment(input: BuildOpenEnrollmentInput): CourseEnrollment {
  return {
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    courseId: input.courseId,
    userId: input.userId,
    validFrom: input.validFrom,
    source: input.source ?? "manual",
    ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
}

export function closeEnrollmentSegment<T extends CourseEnrollment>(
  enrollment: T,
  validUntil: string,
  options: { closedAt?: string; actorUserId?: string } = {},
): T {
  return {
    ...enrollment,
    validUntil,
    ...(options.closedAt ? { closedAt: options.closedAt } : {}),
    ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
  };
}

export type PlanStemEnrollmentWritesInput = {
  courseId: number;
  tenantId?: string;
  previousParticipants: string[];
  nextParticipants: string[];
  existingEnrollments: CourseEnrollment[];
  /** Default validFrom for new open segments (active: next term; draft: series start / sentinel). */
  addValidFrom: string;
  /** Inclusive last day for closed segments (dialog R ≈ today). */
  removeValidUntil: string;
  /** Optional per-user validFrom (lowercase keys) from the members dialog (#305). */
  addValidFromByUser?: Record<string, string>;
  /** Optional per-user validUntil (lowercase keys); also closes people who stay in nextParticipants. */
  removeValidUntilByUser?: Record<string, string>;
  /** When table empty, seed open segments from previousParticipants with this validFrom. */
  bootstrapValidFrom?: string;
  actorUserId?: string;
  createdAt?: string;
  closedAt?: string;
};

export type PlanStemEnrollmentWritesResult = {
  puts: CourseEnrollment[];
  bootstrapped: boolean;
  addedUserIds: string[];
  closedUserIds: string[];
};

/**
 * Plan PutItems for CourseEnrollments from a flat participants[] diff (#304).
 * Does not delete closed segments; rejoin opens a new segment.
 */
export function planStemEnrollmentWrites(
  input: PlanStemEnrollmentWritesInput,
): PlanStemEnrollmentWritesResult {
  const puts: CourseEnrollment[] = [];
  let working = [...input.existingEnrollments];
  let bootstrapped = false;

  if (working.length === 0 && input.previousParticipants.length > 0) {
    const bootstrapFrom = input.bootstrapValidFrom ?? ENROLLMENT_OPEN_START;
    const seeded = migrateParticipantsToEnrollments(
      {
        id: input.courseId,
        participants: input.previousParticipants,
        tenantId: input.tenantId,
      },
      {
        tenantId: input.tenantId,
        validFrom: bootstrapFrom,
        source: "migration",
        actorUserId: input.actorUserId,
        createdAt: input.createdAt,
      },
    );
    working = seeded;
    puts.push(...seeded);
    bootstrapped = true;
  }

  const { added, removed } = diffParticipantLists(
    input.previousParticipants,
    input.nextParticipants,
  );
  const addedUserIds: string[] = [];
  const closedUserIds: string[] = [];

  const addUserIds = uniqueCaseInsensitive([
    ...added,
    ...Object.keys(input.addValidFromByUser ?? {}),
  ]);

  for (const userId of addUserIds) {
    const validFrom =
      input.addValidFromByUser?.[userId.toLowerCase()] ?? input.addValidFrom;
    const existingOpen = findOpenEnrollmentForUser(working, userId);
    if (existingOpen && existingOpen.validFrom === validFrom) continue;
    if (existingOpen && existingOpen.validFrom !== validFrom) {
      const closeUntil =
        validFrom > existingOpen.validFrom
          ? addDaysIso(validFrom, -1)
          : existingOpen.validFrom;
      const closed = closeEnrollmentSegment(
        existingOpen as CourseEnrollment,
        closeUntil,
        {
          closedAt: input.closedAt ?? input.createdAt,
          actorUserId: input.actorUserId,
        },
      );
      working = working.map((entry) =>
        entry.courseId === closed.courseId &&
        entry.userId.toLowerCase() === closed.userId.toLowerCase() &&
        entry.validFrom === closed.validFrom &&
        isEnrollmentOpen(entry)
          ? closed
          : entry,
      );
      puts.push(closed);
    }
    if (findOpenEnrollmentForUser(working, userId)) continue;
    const open = buildOpenEnrollment({
      courseId: input.courseId,
      userId,
      validFrom,
      tenantId: input.tenantId,
      source: "manual",
      actorUserId: input.actorUserId,
      createdAt: input.createdAt,
    });
    working = [...working, open];
    puts.push(open);
    addedUserIds.push(userId);
  }

  const closeUserIds = uniqueCaseInsensitive([
    ...removed,
    ...Object.keys(input.removeValidUntilByUser ?? {}),
  ]);

  for (const userId of closeUserIds) {
    const open = findOpenEnrollmentForUser(working, userId);
    if (!open) continue;
    const validUntil =
      input.removeValidUntilByUser?.[userId.toLowerCase()] ?? input.removeValidUntil;
    const closed = closeEnrollmentSegment(
      open as CourseEnrollment,
      validUntil,
      {
        closedAt: input.closedAt ?? input.createdAt,
        actorUserId: input.actorUserId,
      },
    );
    working = working.map((entry) =>
      entry.courseId === closed.courseId &&
      entry.userId.toLowerCase() === closed.userId.toLowerCase() &&
      entry.validFrom === closed.validFrom &&
      isEnrollmentOpen(entry)
        ? closed
        : entry,
    );
    puts.push(closed);
    closedUserIds.push(userId);
  }

  return { puts, bootstrapped, addedUserIds, closedUserIds };
}

/**
 * Ensure every next participant has an open segment (Draft→Active / empty table).
 * Does not close extras — callers should run planStemEnrollmentWrites for removes.
 */
export function planMissingOpenEnrollments(input: {
  courseId: number;
  tenantId?: string;
  participants: string[];
  existingEnrollments: CourseEnrollment[];
  validFrom: string;
  source?: CourseEnrollmentSource;
  actorUserId?: string;
  createdAt?: string;
}): CourseEnrollment[] {
  const puts: CourseEnrollment[] = [];
  let working = [...input.existingEnrollments];
  for (const userId of input.participants) {
    const trimmed = userId.trim();
    if (!trimmed) continue;
    if (findOpenEnrollmentForUser(working, trimmed)) continue;
    const open = buildOpenEnrollment({
      courseId: input.courseId,
      userId: trimmed,
      validFrom: input.validFrom,
      tenantId: input.tenantId,
      source: input.source ?? "reactivation",
      actorUserId: input.actorUserId,
      createdAt: input.createdAt,
    });
    working = [...working, open];
    puts.push(open);
  }
  return puts;
}

export type DialogMemberRow = {
  userId: string;
  validFrom: string;
  validUntil?: string;
  ending: boolean;
};

export type DialogMemberGroups = {
  dabei: DialogMemberRow[];
  kommt: DialogMemberRow[];
  ehemalig: DialogMemberRow[];
};

function enrollmentsForUser<T extends Pick<CourseEnrollment, "userId">>(
  enrollments: T[],
  userId: string,
): T[] {
  const key = userId.toLowerCase();
  return enrollments.filter((entry) => entry.userId.toLowerCase() === key);
}

/** Prefer the segment active on refIso; else the next upcoming; else the latest closed. */
export function pickRelevantEnrollmentForUser(
  enrollments: CourseEnrollment[],
  userId: string,
  refIso: string,
): CourseEnrollment | null {
  const forUser = enrollmentsForUser(enrollments, userId);
  if (forUser.length === 0) return null;
  const active = forUser.find((entry) => isEnrollmentActiveOnDate(entry, refIso));
  if (active) return active;
  const upcoming = [...forUser]
    .filter((entry) => entry.validFrom > refIso)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  if (upcoming[0]) return upcoming[0];
  const latest = [...forUser].sort((a, b) => {
    const aEnd = a.validUntil ?? a.validFrom;
    const bEnd = b.validUntil ?? b.validFrom;
    return bEnd.localeCompare(aEnd);
  });
  return latest[0] ?? null;
}

export function classifyMembersForDialog(
  enrollments: CourseEnrollment[],
  refIso: string,
): DialogMemberGroups {
  const userIds = uniqueCaseInsensitive(enrollments.map((entry) => entry.userId));
  const dabei: DialogMemberRow[] = [];
  const kommt: DialogMemberRow[] = [];
  const ehemalig: DialogMemberRow[] = [];

  for (const userId of userIds) {
    const enrollment = pickRelevantEnrollmentForUser(enrollments, userId, refIso);
    if (!enrollment) continue;
    const row: DialogMemberRow = {
      userId: enrollment.userId,
      validFrom: enrollment.validFrom,
      ...(enrollment.validUntil ? { validUntil: enrollment.validUntil } : {}),
      ending: false,
    };
    if (isEnrollmentActiveOnDate(enrollment, refIso)) {
      row.ending = Boolean(enrollment.validUntil);
      dabei.push(row);
    } else if (enrollment.validFrom > refIso) {
      kommt.push(row);
    } else {
      ehemalig.push(row);
    }
  }

  const byName = (a: DialogMemberRow, b: DialogMemberRow) => a.userId.localeCompare(b.userId);
  dabei.sort(byName);
  kommt.sort(byName);
  ehemalig.sort(byName);
  return { dabei, kommt, ehemalig };
}

export function formatMembersDialogHeadline(input: {
  dabeiCount: number;
  capacity: number;
  endingCount: number;
  incomingCount: number;
  showIncoming?: boolean;
}): string {
  const parts = [`Teilnehmer ${input.dabeiCount}/${input.capacity}`];
  if (input.endingCount > 0) {
    parts.push(input.endingCount === 1 ? "1 endet" : `${input.endingCount} enden`);
  }
  if (input.showIncoming !== false && input.incomingCount > 0) {
    parts.push(
      input.incomingCount === 1 ? "1 kommt neu dazu" : `${input.incomingCount} kommen neu dazu`,
    );
  }
  return parts.join(" · ");
}

export type EnrollmentChange = {
  userId: string;
  action: "add" | "remove";
  dateIso: string;
};

export function enrollmentChangesToDateMaps(
  changes: EnrollmentChange[] | undefined,
): {
  addValidFromByUser: Record<string, string>;
  removeValidUntilByUser: Record<string, string>;
} {
  const addValidFromByUser: Record<string, string> = {};
  const removeValidUntilByUser: Record<string, string> = {};
  for (const change of changes ?? []) {
    const key = change.userId.trim().toLowerCase();
    if (!key || !change.dateIso) continue;
    if (change.action === "add") addValidFromByUser[key] = change.dateIso;
    if (change.action === "remove") removeValidUntilByUser[key] = change.dateIso;
  }
  return { addValidFromByUser, removeValidUntilByUser };
}
