import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import {
  buildCourseActivatedMail,
  buildCourseMembershipMail,
  buildInstructorParticipantListChangedMail,
} from "../templates/course/courseMailTemplates";

function resolveLoginUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

export async function notifyCourseMembershipAdded(
  client: DynamoDBClient,
  params: {
    tenantId: string;
    participantUserIds: string[];
    courseName: string;
    weekday?: string;
    time?: string;
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
      buildCourseMembershipMail({
        nickname,
        courseName: params.courseName,
        weekday: params.weekday,
        time: params.time,
        loginUrl,
      }),
  });
}

export async function notifyCourseActivated(
  client: DynamoDBClient,
  params: {
    tenantId: string;
    participantUserIds: string[];
    courseName: string;
    weekday?: string;
    time?: string;
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
      buildCourseActivatedMail({
        nickname,
        courseName: params.courseName,
        weekday: params.weekday,
        time: params.time,
        loginUrl,
      }),
  });
}

export async function notifyInstructorParticipantListChanged(
  client: DynamoDBClient,
  params: {
    tenantId: string;
    instructorUserIds: string[];
    courseName: string;
    addedParticipants: string[];
    removedParticipants: string[];
    participantsTable?: string;
    sesSourceEmail?: string;
    baseUrl?: string;
  },
) {
  if (params.instructorUserIds.length === 0) return {
    mailSentCount: 0,
    mailSkippedNoProfileCount: 0,
    mailSkippedInvitedCount: 0,
    mailFailedCount: 0,
  };

  const loginUrl = resolveLoginUrl(params.baseUrl);
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: params.instructorUserIds,
    buildMail: (nickname) =>
      buildInstructorParticipantListChangedMail({
        nickname,
        courseName: params.courseName,
        addedParticipants: params.addedParticipants,
        removedParticipants: params.removedParticipants,
        loginUrl,
      }),
  });
}
