import type { CourseEnrollment, CourseStatus, TenantSettings } from "shared/types";
import {
  findLastClosedCourseTermIso,
  findNextOpenCourseTermIso,
  resolveCancellationSwapCutoffMinutes,
} from "shared/cancellationSwapCutoff";
import {
  classifyMembersForDialog,
  ENROLLMENT_OPEN_START,
  isEnrollmentActiveOnDate,
  pickRelevantEnrollmentForUser,
  type EnrollmentChange,
} from "shared/courseEnrollment";

export function toIsoDateOnlyLocal(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type MembersDialogTermContext = {
  dates: string[];
  time: string;
  tenantSettings?: TenantSettings;
  now?: Date;
};

function cutoffMinutesFrom(settings?: TenantSettings): number {
  return resolveCancellationSwapCutoffMinutes(settings);
}

export function nextOpenCourseTermIso(input: MembersDialogTermContext): string | undefined {
  return findNextOpenCourseTermIso(
    input.dates,
    input.time,
    cutoffMinutesFrom(input.tenantSettings),
    input.now,
  );
}

export function lastClosedCourseTermIso(input: MembersDialogTermContext): string | undefined {
  return findLastClosedCourseTermIso(
    input.dates,
    input.time,
    cutoffMinutesFrom(input.tenantSettings),
    input.now,
  );
}

/** Add default: next still-open term. */
export function nextCourseTermIso(
  dates: string[],
  time: string,
  now: Date = new Date(),
  tenantSettings?: TenantSettings,
): string {
  return (
    findNextOpenCourseTermIso(dates, time, cutoffMinutesFrom(tenantSettings), now) ??
    findLastClosedCourseTermIso(dates, time, cutoffMinutesFrom(tenantSettings), now) ??
    toIsoDateOnlyLocal(now)
  );
}

/**
 * Dialog occupancy reference: next open term (inactive: last date in the list).
 * Cutoff / already started counts as past.
 */
export function membersDialogReferenceIso(input: {
  status?: CourseStatus;
  dates: string[];
  time?: string;
  tenantSettings?: TenantSettings;
  now?: Date;
}): string {
  const today = toIsoDateOnlyLocal(input.now);
  const time = input.time ?? "00:00";
  if ((input.status ?? "active") === "inactive") {
    return (
      lastClosedCourseTermIso({
        dates: input.dates,
        time,
        tenantSettings: input.tenantSettings,
        now: input.now,
      }) ??
      [...input.dates]
        .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
        .sort((a, b) => b.localeCompare(a))[0] ??
      today
    );
  }
  return (
    nextOpenCourseTermIso({
      dates: input.dates,
      time,
      tenantSettings: input.tenantSettings,
      now: input.now,
    }) ??
    lastClosedCourseTermIso({
      dates: input.dates,
      time,
      tenantSettings: input.tenantSettings,
      now: input.now,
    }) ??
    today
  );
}

export function termOptionsForSelect(dates: string[], extra?: Array<string | undefined>): string[] {
  const set = new Set<string>();
  for (const date of [...dates, ...(extra ?? [])]) {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) set.add(date);
  }
  return [...set].sort();
}

/** Former members: validUntil is already before the dialog reference term. */
export function isPastEnrollmentEnd(validUntil: string | undefined, refIso: string): boolean {
  return Boolean(validUntil && validUntil < refIso);
}

/**
 * Start dates for add / rejoin: next open term and later.
 * After a closed segment, only terms strictly after that inclusive until.
 */
export function startTermOptions(input: {
  dates: string[];
  refIso: string;
  afterUntil?: string;
  extra?: Array<string | undefined>;
}): string[] {
  const after = input.afterUntil ?? "";
  return termOptionsForSelect(input.dates, input.extra).filter(
    (iso) => iso >= input.refIso && iso > after,
  );
}

/** End dates while still on the roster: last closed term (leave now) plus R and later. */
export function endTermOptions(input: {
  dates: string[];
  refIso: string;
  lastClosed?: string;
  extra?: Array<string | undefined>;
}): string[] {
  return termOptionsForSelect(input.dates, [input.lastClosed, ...(input.extra ?? [])]).filter(
    (iso) => iso >= input.refIso || iso === input.lastClosed,
  );
}

function isRosterMember(
  enrollment: Pick<CourseEnrollment, "validFrom" | "validUntil"> | null,
  refIso: string,
): boolean {
  if (!enrollment) return false;
  return isEnrollmentActiveOnDate(enrollment, refIso) || enrollment.validFrom > refIso;
}

export function openRosterUserIds(enrollments: CourseEnrollment[], refIso: string): string[] {
  const groups = classifyMembersForDialog(enrollments, refIso);
  return [...groups.dabei, ...groups.kommt].map((row) => row.userId);
}

export function syntheticOpenEnrollments(
  courseId: number,
  participants: string[],
): CourseEnrollment[] {
  return participants.map((userId) => ({
    courseId,
    userId,
    validFrom: ENROLLMENT_OPEN_START,
  }));
}

export function diffEnrollmentChanges(
  previous: CourseEnrollment[],
  next: CourseEnrollment[],
  refIso: string,
): EnrollmentChange[] {
  const userIds = new Set<string>();
  for (const enrollment of [...previous, ...next]) {
    userIds.add(enrollment.userId.toLowerCase());
  }

  const changes: EnrollmentChange[] = [];
  for (const userId of userIds) {
    const prev = pickRelevantEnrollmentForUser(previous, userId, refIso);
    const current = pickRelevantEnrollmentForUser(next, userId, refIso);
    const wasRoster = isRosterMember(prev, refIso);
    const isRoster = isRosterMember(current, refIso);
    const prevUntil = prev?.validUntil ?? "";
    const nextUntil = current?.validUntil ?? "";

    if (!wasRoster && isRoster && current) {
      if (nextUntil) {
        changes.push({ userId: current.userId, action: "remove", dateIso: nextUntil });
      } else {
        changes.push({ userId: current.userId, action: "add", dateIso: current.validFrom });
      }
      continue;
    }
    if (wasRoster && !isRoster) {
      changes.push({
        userId: current?.userId ?? prev?.userId ?? userId,
        action: "remove",
        dateIso: current?.validUntil ?? refIso,
      });
      continue;
    }
    if (prev && current) {
      if (nextUntil && nextUntil !== prevUntil) {
        changes.push({ userId: current.userId, action: "remove", dateIso: nextUntil });
      }
      if (prevUntil && !nextUntil) {
        changes.push({ userId: current.userId, action: "add", dateIso: current.validFrom });
      }
      if (!nextUntil && current.validFrom !== prev.validFrom) {
        changes.push({ userId: current.userId, action: "add", dateIso: current.validFrom });
      }
    }
  }
  return changes;
}
