import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { Swap } from "@yogaswap/shared";
import { buildIcsPublishEvent } from "./buildIcsPublishEvent";
import { loadCourseSummary } from "./courseSummary";
import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import { buildWaitlistPromotionMail } from "../templates/swap/swapMailTemplates";

export async function notifyWaitlistPromotion(
  client: DynamoDBClient,
  params: {
    tenantId: string;
    swap: Pick<Swap, "participantId" | "toCourseId" | "toDate">;
    coursesTable?: string;
    participantsTable?: string;
    sesSourceEmail?: string;
    loginUrl?: string;
    attachIcs?: boolean;
  },
) {
  const { tenantId, swap, coursesTable, participantsTable, sesSourceEmail, loginUrl, attachIcs = true } =
    params;

  if (!coursesTable || !participantsTable || !sesSourceEmail) {
    return {
      mailSentCount: 0,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailFailedCount: 0,
      skippedReason: "missing_env",
    };
  }

  const participantId = swap.participantId?.trim();
  if (!participantId) {
    return {
      mailSentCount: 0,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailFailedCount: 0,
      skippedReason: "missing_participant_id",
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

  const icsUid = `${tenantId}/${swap.toCourseId}/${swap.toDate}@yogaswap`;
  const icsContent = attachIcs
    ? buildIcsPublishEvent({
        uid: icsUid,
        summary: course.name,
        description: `YogaSwap-Termin (${swap.toDate})`,
        isoDate: swap.toDate,
        time: course.time,
      })
    : null;

  return sendMailToParticipantUserIds(client, {
    participantsTable,
    sesSourceEmail,
    tenantId,
    participantUserIds: [participantId],
    buildMail: (nickname) => {
      const mail = buildWaitlistPromotionMail({
        nickname,
        courseName: course.name,
        dateIso: swap.toDate,
        time: course.time,
        loginUrl,
      });
      if (!icsContent) return mail;
      return {
        ...mail,
        attachment: {
          filename: "termin.ics",
          content: icsContent,
          contentType: "text/calendar; method=PUBLISH",
        },
      };
    },
  });
}
