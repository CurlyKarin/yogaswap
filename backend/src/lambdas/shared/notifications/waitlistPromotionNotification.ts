import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Swap } from "@yogaswap/shared";
import { loadCourseSummary } from "./courseSummary";
import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import { buildWaitlistPromotionMail } from "../templates/swap/swapMailTemplates";

export async function notifyWaitlistPromotion(
  client: DynamoDBClient,
  params: {
    tenantId: string;
    swap: Pick<Swap, "user" | "toCourseId" | "toDate">;
    coursesTable?: string;
    participantsTable?: string;
    sesSourceEmail?: string;
    loginUrl?: string;
  },
) {
  const { tenantId, swap, coursesTable, participantsTable, sesSourceEmail, loginUrl } = params;

  if (!coursesTable || !participantsTable || !sesSourceEmail) {
    return {
      mailSentCount: 0,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailFailedCount: 0,
      skippedReason: "missing_env",
    };
  }

  const course = await loadCourseSummary(client, coursesTable, tenantId, swap.toCourseId);
  if (!course) {
    console.warn("waitlist promotion mail skipped: target course not found", {
      tenantId,
      toCourseId: swap.toCourseId,
    });
    return {
      mailSentCount: 0,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailFailedCount: 0,
      skippedReason: "course_not_found",
    };
  }

  return sendMailToParticipantUserIds(client, {
    participantsTable,
    sesSourceEmail,
    tenantId,
    participantUserIds: [swap.user],
    buildMail: (nickname) =>
      buildWaitlistPromotionMail({
        nickname,
        courseName: course.name,
        dateIso: swap.toDate,
        time: course.time,
        loginUrl,
      }),
  });
}
