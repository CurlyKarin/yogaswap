import { buildIcsPublishEvent } from "./buildIcsPublishEvent";
import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import {
  buildParticipantShortNoticeCancellationMail,
  buildParticipantTermReleasedMail,
  buildStudioTermCancelledMail,
} from "../templates/course/termMailTemplates";

function resolveLoginUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

export async function notifyStudioTermCancelled(
  client: import("@aws-sdk/client-dynamodb").DynamoDBClient,
  params: {
    tenantId: string;
    participantUserIds: string[];
    courseName: string;
    dateIso: string;
    time: string;
    participantsTable?: string;
    sesSourceEmail?: string;
    baseUrl?: string;
  },
) {
  const loginUrl = resolveLoginUrl(params.baseUrl);
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: params.participantUserIds,
    buildMail: (nickname) =>
      buildStudioTermCancelledMail({
        nickname,
        courseName: params.courseName,
        dateIso: params.dateIso,
        time: params.time,
        loginUrl,
      }),
  });
}

export type SelfServiceAbsenceKind = "term_released" | "short_notice_cancelled";

export async function notifySelfServiceAbsence(
  client: import("@aws-sdk/client-dynamodb").DynamoDBClient,
  params: {
    tenantId: string;
    userId: string;
    kind: SelfServiceAbsenceKind;
    courseName: string;
    dateIso: string;
    time: string;
    participantsTable?: string;
    sesSourceEmail?: string;
    baseUrl?: string;
  },
) {
  const loginUrl = resolveLoginUrl(params.baseUrl);
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: [params.userId],
    buildMail: (nickname) => {
      const input = {
        nickname,
        courseName: params.courseName,
        dateIso: params.dateIso,
        time: params.time,
        loginUrl,
      };
      return params.kind === "short_notice_cancelled"
        ? buildParticipantShortNoticeCancellationMail(input)
        : buildParticipantTermReleasedMail(input);
    },
  });
}