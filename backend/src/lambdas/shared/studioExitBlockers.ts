import { QueryCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  isEnrollmentOpen,
  toIsoDateUtc,
  type CourseEnrollment,
} from "@yogaswap/shared";
import { queryCourseEnrollments } from "./courseEnrollmentDynamo";
import { mapOverrideItem } from "./overrideDynamo";
import { querySwapsForUserRefs } from "./swapQueryHelpers";

export type StudioExitCourseBlocker = {
  courseId: number;
  courseName?: string;
  reason: "enrollment" | "roster";
};

export type StudioExitSwapBlocker = {
  fromDate: string;
  fromCourseId: number;
  toDate: string;
  toCourseId: number;
  status: string;
};

export type StudioExitWaitlistBlocker = {
  courseId: number;
  date: string;
  courseName?: string;
};

export type StudioExitBlockers = {
  asOf: string;
  courses: StudioExitCourseBlocker[];
  swaps: StudioExitSwapBlocker[];
  waitlist: StudioExitWaitlistBlocker[];
};

export function hasStudioExitBlockers(blockers: StudioExitBlockers): boolean {
  return (
    blockers.courses.length > 0 ||
    blockers.swaps.length > 0 ||
    blockers.waitlist.length > 0
  );
}

export function matchRefsForParticipant(userId: string, participantId?: string): Set<string> {
  const refs = new Set<string>();
  const nick = userId.trim().toLowerCase();
  if (nick) refs.add(nick);
  const pid = participantId?.trim().toLowerCase();
  if (pid) refs.add(pid);
  return refs;
}

export function listIncludesParticipantRef(list: string[], refs: Set<string>): boolean {
  return list.some((entry) => refs.has(entry.trim().toLowerCase()));
}

/** Open enrollment or validUntil still on/after asOf → still planned. */
export function enrollmentBlocksStudioExit(
  enrollment: Pick<CourseEnrollment, "validUntil">,
  asOfIso: string,
): boolean {
  if (isEnrollmentOpen(enrollment)) return true;
  const until = enrollment.validUntil?.trim();
  return !!until && until >= asOfIso;
}

export async function collectStudioExitBlockers(params: {
  client: DynamoDBClient;
  tenantId: string;
  userId: string;
  participantId?: string;
  coursesTable: string;
  enrollmentsTable: string;
  swapsTable: string;
  overridesTable: string;
  now?: Date;
}): Promise<StudioExitBlockers> {
  const {
    client,
    tenantId,
    userId,
    participantId,
    coursesTable,
    enrollmentsTable,
    swapsTable,
    overridesTable,
  } = params;
  const asOf = toIsoDateUtc(params.now ?? new Date());
  const refs = matchRefsForParticipant(userId, participantId);
  const userRefs = [...refs];

  const coursesResp = await client.send(
    new QueryCommand({
      TableName: coursesTable,
      KeyConditionExpression: "tenantId = :tenantId",
      ExpressionAttributeValues: {
        ":tenantId": { S: tenantId },
      },
    }),
  );

  const courseNameById = new Map<number, string>();
  const rosterCourseIds = new Set<number>();
  for (const item of coursesResp.Items ?? []) {
    const courseId = Number(item.courseId?.N ?? item.courseId?.S);
    if (!Number.isFinite(courseId)) continue;
    const name = item.name?.S?.trim();
    if (name) courseNameById.set(courseId, name);
    const roster = (item.participants?.L ?? [])
      .map((entry) => entry.S?.trim() || "")
      .filter(Boolean);
    if (listIncludesParticipantRef(roster, refs)) {
      rosterCourseIds.add(courseId);
    }
  }

  const enrollments = await queryCourseEnrollments({
    client,
    tableName: enrollmentsTable,
    tenantId,
  });
  const enrollmentCourseIds = new Set<number>();
  for (const enrollment of enrollments) {
    if (!refs.has(enrollment.participantId.trim().toLowerCase())) continue;
    if (!enrollmentBlocksStudioExit(enrollment, asOf)) continue;
    enrollmentCourseIds.add(enrollment.courseId);
  }

  const courses: StudioExitCourseBlocker[] = [];
  const seenCourses = new Set<number>();
  for (const courseId of enrollmentCourseIds) {
    seenCourses.add(courseId);
    courses.push({
      courseId,
      courseName: courseNameById.get(courseId),
      reason: "enrollment",
    });
  }
  for (const courseId of rosterCourseIds) {
    if (seenCourses.has(courseId)) continue;
    courses.push({
      courseId,
      courseName: courseNameById.get(courseId),
      reason: "roster",
    });
  }
  courses.sort((a, b) => a.courseId - b.courseId);

  const swapsRaw = await querySwapsForUserRefs({
    client,
    swapsTable,
    tenantId,
    userRefs,
  });
  const swaps: StudioExitSwapBlocker[] = swapsRaw
    .filter((swap) => swap.fromDate >= asOf || swap.toDate >= asOf)
    .map((swap) => ({
      fromDate: swap.fromDate,
      fromCourseId: swap.fromCourseId,
      toDate: swap.toDate,
      toCourseId: swap.toCourseId,
      status: swap.status,
    }))
    .sort((a, b) =>
      a.fromDate === b.fromDate
        ? a.toDate.localeCompare(b.toDate)
        : a.fromDate.localeCompare(b.fromDate),
    );

  const overridesResp = await client.send(
    new QueryCommand({
      TableName: overridesTable,
      KeyConditionExpression: "tenantId = :tid",
      ExpressionAttributeValues: {
        ":tid": { S: tenantId },
      },
    }),
  );
  const waitlist: StudioExitWaitlistBlocker[] = [];
  for (const item of overridesResp.Items ?? []) {
    const override = mapOverrideItem(item);
    if (override.date < asOf) continue;
    if (!listIncludesParticipantRef(override.waitlist ?? [], refs)) continue;
    waitlist.push({
      courseId: override.courseId,
      date: override.date,
      courseName: courseNameById.get(override.courseId),
    });
  }
  waitlist.sort((a, b) =>
    a.date === b.date ? a.courseId - b.courseId : a.date.localeCompare(b.date),
  );

  return { asOf, courses, swaps, waitlist };
}
