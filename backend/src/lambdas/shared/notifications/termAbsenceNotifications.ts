import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import {
  buildParticipantTermReleasedMail,
  buildStudioTermCancelledMail,
} from "../templates/course/termMailTemplates";
import { loadStudioMailContext } from "../studioContact";

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
    tenantsTable?: string;
    sesSourceEmail?: string;
    baseUrl?: string;
  },
) {
  const loginUrl = resolveLoginUrl(params.baseUrl);
  const { studioContact } = await loadStudioMailContext(
    client,
    params.tenantsTable,
    params.tenantId,
  );
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: params.participantUserIds,
    buildMail: (recipient) =>
      buildStudioTermCancelledMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        dateIso: params.dateIso,
        time: params.time,
        loginUrl,
        studioContact,
      }),
  });
}

export async function notifyParticipantTermReleased(
  client: import("@aws-sdk/client-dynamodb").DynamoDBClient,
  params: {
    tenantId: string;
    userId: string;
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
    buildMail: (recipient) =>
      buildParticipantTermReleasedMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        dateIso: params.dateIso,
        time: params.time,
        loginUrl,
      }),
  });
}
