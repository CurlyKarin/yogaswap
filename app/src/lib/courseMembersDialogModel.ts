import type { CourseEnrollment, CourseStatus } from "shared/types";
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

export function nextCourseTermIso(
  dates: string[],
  time: string,
  now: Date = new Date(),
): string {
  const sorted = [...dates].filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry)).sort();
  const [hours, minutes] = time.split(":").map(Number);
  for (const iso of sorted) {
    const [year, month, day] = iso.split("-").map(Number);
    const occurrence = new Date(year, month - 1, day, hours || 0, minutes || 0);
    if (occurrence >= now) return iso;
  }
  return toIsoDateOnlyLocal(now);
}

export function membersDialogReferenceIso(input: {
  status?: CourseStatus;
  dates: string[];
  now?: Date;
}): string {
  const today = toIsoDateOnlyLocal(input.now);
  if ((input.status ?? "active") === "inactive") {
    const last = [...input.dates]
      .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
      .sort((a, b) => b.localeCompare(a))[0];
    return last ?? today;
  }
  return today;
}

export function termOptionsForSelect(dates: string[], extra?: Array<string | undefined>): string[] {
  const set = new Set<string>();
  for (const date of [...dates, ...(extra ?? [])]) {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) set.add(date);
  }
  return [...set].sort();
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

    if (!wasRoster && isRoster && current) {
      changes.push({ userId: current.userId, action: "add", dateIso: current.validFrom });
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
    if (wasRoster && isRoster && prev && current) {
      const prevUntil = prev.validUntil ?? "";
      const nextUntil = current.validUntil ?? "";
      if (nextUntil && nextUntil !== prevUntil) {
        changes.push({ userId: current.userId, action: "remove", dateIso: current.validUntil! });
      }
      if (prevUntil && !nextUntil) {
        changes.push({ userId: current.userId, action: "add", dateIso: current.validFrom });
      }
      if (current.validFrom !== prev.validFrom) {
        changes.push({ userId: current.userId, action: "add", dateIso: current.validFrom });
      }
    }
  }
  return changes;
}
