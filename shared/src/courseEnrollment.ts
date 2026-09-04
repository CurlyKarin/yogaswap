import {
  resolveEffectiveTermParticipants,
  type EffectiveTermParticipants,
} from "./overrideOccupancy";
import type { Course, CourseDateOverride, CourseEnrollment, CourseEnrollmentSource } from "./types";

/**
 * Sentinel for migrated / unknown start ("schon immer").
 * Used in Dynamo SK `courseId#participantId#validFrom`.
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
  participantId: string,
  validFrom: string,
): string {
  return `${String(courseId)}${SK_SEPARATOR}${participantId}${SK_SEPARATOR}${validFrom}`;
}

export function buildCourseEnrollmentCoursePrefix(courseId: number | string): string {
  return `${String(courseId)}${SK_SEPARATOR}`;
}

export function buildCourseEnrollmentParticipantPrefix(
  courseId: number | string,
  participantId: string,
): string {
  return `${String(courseId)}${SK_SEPARATOR}${participantId}${SK_SEPARATOR}`;
}

export function parseCourseEnrollmentSortKey(
  sortKey: string,
): { courseId: string; participantId: string; validFrom: string } | null {
  const parts = sortKey.split(SK_SEPARATOR);
  if (parts.length < 3) return null;
  const validFrom = parts[parts.length - 1] ?? "";
  const courseId = parts[0] ?? "";
  const participantId = parts.slice(1, -1).join(SK_SEPARATOR);
  if (!courseId || !participantId || !validFrom) return null;
  return { courseId, participantId, validFrom };
}

const ENROLLMENT_OPEN_END = "9999-12-31";

/** Inclusive last day; open segments extend to ENROLLMENT_OPEN_END. */
export function enrollmentEndIso(
  enrollment: Pick<CourseEnrollment, "validUntil">,
): string {
  if (enrollment.validUntil == null || enrollment.validUntil === "") return ENROLLMENT_OPEN_END;
  return enrollment.validUntil;
}

/**
 * Returns true if two enrollment ranges share at least one day.
 * Inclusive ranges: adjacent days (until Mon 10, from Mon 17) do NOT overlap.
 * Open end is treated as ENROLLMENT_OPEN_END ("9999-12-31").
 *
 * Invariant: no two segments of the same person in the same course may overlap.
 * planStemEnrollmentWrites enforces this by skipping adds that would overlap an
 * existing segment, and by clamping validUntil corrections via clampUntilToAvoidOverlap.
 */
export function enrollmentRangesOverlap(
  a: Pick<CourseEnrollment, "validFrom" | "validUntil">,
  b: Pick<CourseEnrollment, "validFrom" | "validUntil">,
): boolean {
  return a.validFrom <= enrollmentEndIso(b) && b.validFrom <= enrollmentEndIso(a);
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
 * Stem participantIds active on dateIso (unique, case-insensitive; first casing wins).
 */
export function stemOnDate(
  enrollments: Array<Pick<CourseEnrollment, "participantId" | "validFrom" | "validUntil">>,
  dateIso: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const enrollment of enrollments) {
    if (!isEnrollmentActiveOnDate(enrollment, dateIso)) continue;
    const key = enrollment.participantId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(enrollment.participantId);
  }
  return result;
}

export type EnrollmentStemInput = Pick<
  CourseEnrollment,
  "courseId" | "participantId" | "validFrom" | "validUntil"
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
  for (const participantId of course.participants ?? []) {
    const trimmed = participantId.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      ...(tenantId ? { tenantId } : {}),
      courseId: course.id,
      participantId: trimmed,
      validFrom,
      source,
      ...(actorUserId ? { actorUserId } : {}),
      ...(createdAt ? { createdAt } : {}),
    });
  }
  return result;
}

/** Open stem cache: segments without validUntil (or until in the future relative to `asOf`). */
export function openEnrollmentParticipantIds(
  enrollments: Array<Pick<CourseEnrollment, "participantId" | "validUntil">>,
  asOfIso?: string,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const enrollment of enrollments) {
    if (enrollment.validUntil != null && enrollment.validUntil !== "") {
      if (asOfIso != null && enrollment.validUntil < asOfIso) continue;
    }
    const key = enrollment.participantId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(enrollment.participantId);
  }
  return result;
}

export function isEnrollmentOpen(
  enrollment: Pick<CourseEnrollment, "validUntil">,
): boolean {
  return enrollment.validUntil == null || enrollment.validUntil === "";
}

/** Empty or inverted interval (until before from) is not a real membership. */
export function isEnrollmentRangeValid(
  enrollment: Pick<CourseEnrollment, "validFrom" | "validUntil">,
): boolean {
  if (isEnrollmentOpen(enrollment)) return true;
  const until = enrollment.validUntil;
  return until != null && until !== "" && until >= enrollment.validFrom;
}

/** Latest open segment for a user (by validFrom), or null. */
export function findOpenEnrollmentForParticipant(
  enrollments: Array<Pick<CourseEnrollment, "participantId" | "validFrom" | "validUntil">>,
  participantId: string,
): (typeof enrollments)[number] | null {
  const key = participantId.toLowerCase();
  let best: (typeof enrollments)[number] | null = null;
  for (const enrollment of enrollments) {
    if (enrollment.participantId.toLowerCase() !== key) continue;
    if (!isEnrollmentOpen(enrollment)) continue;
    if (!best || enrollment.validFrom > best.validFrom) best = enrollment;
  }
  return best;
}

/** Latest segment for a user (open or closed), by validFrom then validUntil. */
export function findLatestEnrollmentForParticipant(
  enrollments: Array<Pick<CourseEnrollment, "participantId" | "validFrom" | "validUntil">>,
  participantId: string,
): (typeof enrollments)[number] | null {
  const key = participantId.toLowerCase();
  let best: (typeof enrollments)[number] | null = null;
  for (const enrollment of enrollments) {
    if (enrollment.participantId.toLowerCase() !== key) continue;
    if (!best) {
      best = enrollment;
      continue;
    }
    if (enrollment.validFrom > best.validFrom) {
      best = enrollment;
      continue;
    }
    if (enrollment.validFrom === best.validFrom) {
      const enrollmentUntil = enrollment.validUntil ?? "";
      const bestUntil = best.validUntil ?? "";
      if (enrollmentUntil > bestUntil) best = enrollment;
    }
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
  participantId: string;
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
    participantId: input.participantId,
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
  addValidFromByParticipant?: Record<string, string>;
  /** Optional per-user validUntil (lowercase keys); updates open or already-closed segments. */
  removeValidUntilByParticipant?: Record<string, string>;
  /** When table empty, seed open segments from previousParticipants with this validFrom. */
  bootstrapValidFrom?: string;
  actorUserId?: string;
  createdAt?: string;
  closedAt?: string;
};

export type PlanStemEnrollmentWritesResult = {
  puts: CourseEnrollment[];
  deletes: CourseEnrollment[];
  bootstrapped: boolean;
  addedParticipantIds: string[];
  closedParticipantIds: string[];
  deletedParticipantIds: string[];
};

/**
 * Plan PutItems for CourseEnrollments from a flat participants[] diff (#304).
 *
 * Identity: SK = courseId#participantId#validFrom. Same SK → update that row. Different validFrom → new row.
 *
 * Rules enforced here:
 * - **Set/correct validUntil**: always updates the existing row (open or closed), never opens a second segment.
 * - **Rejoin**: new open row only when validFrom is strictly after the last validUntil (real gap, no overlap).
 *   A rejoin with a future exit still present (planned pause) is NOT supported and must be handled separately.
 * - **Overlap guard**: a new segment is skipped when it would overlap any existing segment for the same person.
 * - **Clamp on close**: validUntil is clamped to one day before the next segment's validFrom if necessary.
 * - **Never started**: if close would set validUntil before validFrom, delete the row
 *   (planned join cancelled). Do not persist inverted intervals.
 * - **History preserved**: closed rows with a real interval are never deleted.
 */
export function planStemEnrollmentWrites(
  input: PlanStemEnrollmentWritesInput,
): PlanStemEnrollmentWritesResult {
  const puts: CourseEnrollment[] = [];
  const deletes: CourseEnrollment[] = [];
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

  const addedParticipantIds: string[] = [];
  const closedParticipantIds: string[] = [];
  const deletedParticipantIds: string[] = [];

  const inverted = working.filter((entry) => !isEnrollmentRangeValid(entry));
  if (inverted.length > 0) {
    deletes.push(...inverted);
    deletedParticipantIds.push(...inverted.map((entry) => entry.participantId));
    const invertedKeys = new Set(
      inverted.map((entry) => `${entry.participantId.toLowerCase()}#${entry.validFrom}`),
    );
    working = working.filter(
      (entry) => !invertedKeys.has(`${entry.participantId.toLowerCase()}#${entry.validFrom}`),
    );
  }

  const { added, removed } = diffParticipantLists(
    input.previousParticipants,
    input.nextParticipants,
  );

  const addParticipantIds = uniqueCaseInsensitive([
    ...added,
    ...Object.keys(input.addValidFromByParticipant ?? {}),
  ]);

  for (const participantId of addParticipantIds) {
    // Until correction on an existing segment: do not also open a new one.
    if (input.removeValidUntilByParticipant?.[participantId.toLowerCase()]) continue;
    const validFrom =
      input.addValidFromByParticipant?.[participantId.toLowerCase()] ?? input.addValidFrom;
    const existingOpen = findOpenEnrollmentForParticipant(working, participantId);
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
        entry.participantId.toLowerCase() === closed.participantId.toLowerCase() &&
        entry.validFrom === closed.validFrom &&
        isEnrollmentOpen(entry)
          ? closed
          : entry,
      );
      puts.push(closed);
    }
    if (findOpenEnrollmentForParticipant(working, participantId)) continue;
    const proposed = { validFrom };
    const overlapsExisting = enrollmentsForParticipant(working, participantId).some(
      (entry) =>
        entry.validFrom !== validFrom && enrollmentRangesOverlap(entry, proposed),
    );
    // Covered by a closed segment already: correct that row, do not open a second one.
    if (overlapsExisting) continue;
    const open = buildOpenEnrollment({
      courseId: input.courseId,
      participantId,
      validFrom,
      tenantId: input.tenantId,
      source: "manual",
      actorUserId: input.actorUserId,
      createdAt: input.createdAt,
    });
    working = [...working, open];
    puts.push(open);
    addedParticipantIds.push(participantId);
  }

  const closeParticipantIds = uniqueCaseInsensitive([
    ...removed,
    ...Object.keys(input.removeValidUntilByParticipant ?? {}),
  ]);

  for (const participantId of closeParticipantIds) {
    const requestedUntil =
      input.removeValidUntilByParticipant?.[participantId.toLowerCase()] ?? input.removeValidUntil;
    const target =
      findOpenEnrollmentForParticipant(working, participantId) ??
      findLatestEnrollmentForParticipant(working, participantId);
    if (!target) continue;
    const validUntil = clampUntilToAvoidOverlap(working, participantId, target, requestedUntil);
    if (validUntil < target.validFrom) {
      working = working.filter(
        (entry) =>
          !(
            entry.participantId.toLowerCase() === target.participantId.toLowerCase() &&
            entry.validFrom === target.validFrom
          ),
      );
      deletes.push(target as CourseEnrollment);
      deletedParticipantIds.push(participantId);
      continue;
    }
    if (!isEnrollmentOpen(target) && target.validUntil === validUntil) continue;
    const closed = closeEnrollmentSegment(
      target as CourseEnrollment,
      validUntil,
      {
        closedAt: input.closedAt ?? input.createdAt,
        actorUserId: input.actorUserId,
      },
    );
    working = working.map((entry) =>
      entry.courseId === closed.courseId &&
      entry.participantId.toLowerCase() === closed.participantId.toLowerCase() &&
      entry.validFrom === closed.validFrom
        ? closed
        : entry,
    );
    puts.push(closed);
    closedParticipantIds.push(participantId);
  }

  return { puts, deletes, bootstrapped, addedParticipantIds, closedParticipantIds, deletedParticipantIds };
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
  for (const participantId of input.participants) {
    const trimmed = participantId.trim();
    if (!trimmed) continue;
    if (findOpenEnrollmentForParticipant(working, trimmed)) continue;
    const open = buildOpenEnrollment({
      courseId: input.courseId,
      participantId: trimmed,
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
  participantId: string;
  validFrom: string;
  validUntil?: string;
  ending: boolean;
};

export type DialogMemberGroups = {
  dabei: DialogMemberRow[];
  kommt: DialogMemberRow[];
  ehemalig: DialogMemberRow[];
};

function enrollmentsForParticipant<T extends Pick<CourseEnrollment, "participantId">>(
  enrollments: T[],
  participantId: string,
): T[] {
  const key = participantId.toLowerCase();
  return enrollments.filter((entry) => entry.participantId.toLowerCase() === key);
}

/**
 * Clamp requestedUntil so it does not reach into a later segment of the same person.
 * Example: person has segments [Jan–Aug] and [Sep–…]; closing the first segment at Oct
 * would be clamped to Aug (one day before Sep).
 */
function clampUntilToAvoidOverlap(
  enrollments: Array<Pick<CourseEnrollment, "participantId" | "validFrom" | "validUntil">>,
  participantId: string,
  target: Pick<CourseEnrollment, "validFrom">,
  requestedUntil: string,
): string {
  let until = requestedUntil;
  for (const other of enrollmentsForParticipant(enrollments, participantId)) {
    if (other.validFrom === target.validFrom) continue;
    if (other.validFrom > target.validFrom && other.validFrom <= until) {
      const clamped = addDaysIso(other.validFrom, -1);
      if (clamped < until) until = clamped;
    }
  }
  return until;
}

/** Prefer the segment active on refIso; else the next upcoming; else the latest closed. */
export function pickRelevantEnrollmentForParticipant(
  enrollments: CourseEnrollment[],
  participantId: string,
  refIso: string,
): CourseEnrollment | null {
  const forParticipant = enrollmentsForParticipant(enrollments, participantId).filter(isEnrollmentRangeValid);
  if (forParticipant.length === 0) return null;
  const active = forParticipant.find((entry) => isEnrollmentActiveOnDate(entry, refIso));
  if (active) return active;
  const upcoming = [...forParticipant]
    .filter((entry) => entry.validFrom > refIso)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  if (upcoming[0]) return upcoming[0];
  const latest = [...forParticipant].sort((a, b) => {
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
  const participantIds = uniqueCaseInsensitive(enrollments.map((entry) => entry.participantId));
  const dabei: DialogMemberRow[] = [];
  const kommt: DialogMemberRow[] = [];
  const ehemalig: DialogMemberRow[] = [];

  for (const participantId of participantIds) {
    const enrollment = pickRelevantEnrollmentForParticipant(enrollments, participantId, refIso);
    if (!enrollment) continue;
    const row: DialogMemberRow = {
      participantId: enrollment.participantId,
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

  const byParticipantId = (a: DialogMemberRow, b: DialogMemberRow) => a.participantId.localeCompare(b.participantId);
  dabei.sort(byParticipantId);
  kommt.sort(byParticipantId);
  ehemalig.sort(byParticipantId);
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
  participantId: string;
  action: "add" | "remove";
  dateIso: string;
};

export function enrollmentChangesToDateMaps(
  changes: EnrollmentChange[] | undefined,
): {
  addValidFromByParticipant: Record<string, string>;
  removeValidUntilByParticipant: Record<string, string>;
} {
  const addValidFromByParticipant: Record<string, string> = {};
  const removeValidUntilByParticipant: Record<string, string> = {};
  for (const change of changes ?? []) {
    const key = change.participantId.trim().toLowerCase();
    if (!key || !change.dateIso) continue;
    if (change.action === "add") addValidFromByParticipant[key] = change.dateIso;
    if (change.action === "remove") removeValidUntilByParticipant[key] = change.dateIso;
  }
  return { addValidFromByParticipant, removeValidUntilByParticipant };
}
