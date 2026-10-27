import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import {
  buildInstructorTermParticipationChangedMail,
  buildParticipantAbsenceWithdrawnMail,
  buildParticipantTermReleasedMail,
  buildStudioTermCancelledMail,
  type InstructorTermParticipationKind,
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

export async function notifyParticipantAbsenceWithdrawn(
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
      buildParticipantAbsenceWithdrawnMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        dateIso: params.dateIso,
        time: params.time,
        loginUrl,
      }),
  });
}

/** Kursleitung über Termin-Teilnahmeänderung informieren (#398). */
export async function notifyInstructorsTermParticipationChanged(
  client: import("@aws-sdk/client-dynamodb").DynamoDBClient,
  params: {
    tenantId: string;
    instructorUserIds: string[];
    kind: InstructorTermParticipationKind;
    memberNickname: string;
    courseName: string;
    dateIso: string;
    time: string;
    participantsTable?: string;
    sesSourceEmail?: string;
    baseUrl?: string;
  },
) {
  if (params.instructorUserIds.length === 0) {
    return {
      mailSentCount: 0,
      mailSkippedNoProfileCount: 0,
      mailSkippedInvitedCount: 0,
      mailFailedCount: 0,
    };
  }
  const loginUrl = resolveLoginUrl(params.baseUrl);
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: params.instructorUserIds,
    buildMail: (recipient) =>
      buildInstructorTermParticipationChangedMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        dateIso: params.dateIso,
        time: params.time,
        kind: params.kind,
        memberNickname: params.memberNickname,
        loginUrl,
      }),
  });
}
