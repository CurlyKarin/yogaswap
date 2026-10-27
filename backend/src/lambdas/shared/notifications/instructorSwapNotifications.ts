import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  shouldNotifyInstructorsForTermParticipation,
  type TenantSettings,
} from "@yogaswap/shared";
import { loadCourseSummary } from "./courseSummary";
import { loadTenantSettings } from "../tenantSettingsLoader";
import { notifyInstructorsTermParticipationChanged } from "./termAbsenceNotifications";

/**
 * Kursleitung an Herkunft- und Zielkurs über erfolgreichen Tausch informieren (#398).
 */
export async function notifyInstructorsOfActiveSwap(params: {
  client: DynamoDBClient;
  tenantId: string;
  swap: {
    participantId: string;
    fromCourseId: number;
    fromDate: string;
    toCourseId: number;
    toDate: string;
  };
  coursesTable?: string;
  tenantsTable?: string;
  participantsTable?: string;
  sesSourceEmail?: string;
  baseUrl?: string;
}) {
  const empty = {
    mailSentCount: 0,
    mailSkippedNoProfileCount: 0,
    mailSkippedInvitedCount: 0,
    mailFailedCount: 0,
  };
  const {
    client,
    tenantId,
    swap,
    coursesTable,
    tenantsTable,
    participantsTable,
    sesSourceEmail,
    baseUrl,
  } = params;
  if (!coursesTable || !tenantsTable) return { ...empty, skippedReason: "missing_env" as const };

  let settings: TenantSettings | undefined;
  try {
    settings = await loadTenantSettings(client, tenantsTable, tenantId);
  } catch (error) {
    console.warn("instructor swap mail: failed to load tenant settings", { tenantId, error });
    return { ...empty, skippedReason: "settings_load_failed" as const };
  }

  const memberNickname = swap.participantId.trim();
  if (!memberNickname) return { ...empty, skippedReason: "missing_participant" as const };

  const sides: Array<{
    courseId: number;
    dateIso: string;
    kind: "swap_left" | "swap_joined";
  }> = [
    { courseId: swap.fromCourseId, dateIso: swap.fromDate, kind: "swap_left" },
    { courseId: swap.toCourseId, dateIso: swap.toDate, kind: "swap_joined" },
  ];

  const totals = { ...empty };
  for (const side of sides) {
    const course = await loadCourseSummary(client, coursesTable, tenantId, side.courseId);
    if (!course || course.instructors.length === 0) continue;
    if (!shouldNotifyInstructorsForTermParticipation(settings, side.dateIso, course.time)) {
      continue;
    }
    const summary = await notifyInstructorsTermParticipationChanged(client, {
      tenantId,
      instructorUserIds: course.instructors,
      kind: side.kind,
      memberNickname,
      courseName: course.name,
      dateIso: side.dateIso,
      time: course.time,
      participantsTable,
      sesSourceEmail,
      baseUrl,
    });
    totals.mailSentCount += summary.mailSentCount;
    totals.mailSkippedNoProfileCount += summary.mailSkippedNoProfileCount;
    totals.mailSkippedInvitedCount += summary.mailSkippedInvitedCount;
    totals.mailFailedCount += summary.mailFailedCount;
  }
  return totals;
}
