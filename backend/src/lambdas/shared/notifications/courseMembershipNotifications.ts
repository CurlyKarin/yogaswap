import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { MembershipMailEvent } from "@yogaswap/shared";
import { sendMailToParticipantUserIds } from "./sendParticipantEmail";
import {
  buildCourseActivatedMail,
  buildCourseMembershipExitChangedMail,
  buildCourseMembershipExitClearedMail,
  buildCourseMembershipExitMail,
  buildCourseMembershipJoinCancelledMail,
  buildCourseMembershipJoinChangedMail,
  buildCourseMembershipMail,
  buildInstructorParticipantListChangedMail,
} from "../templates/course/courseMailTemplates";

function resolveLoginUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) return undefined;
  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

type CourseMailCommon = {
  tenantId: string;
  courseName: string;
  weekday?: string;
  time?: string;
  participantsTable?: string;
  sesSourceEmail?: string;
  baseUrl?: string;
};

export async function notifyCourseMembershipAdded(
  client: DynamoDBClient,
  params: CourseMailCommon & {
    participantUserIds: string[];
    termDateIso?: string;
    termDateByUser?: Record<string, string>;
  },
) {
  const loginUrl = resolveLoginUrl(params.baseUrl);
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: params.participantUserIds,
    buildMail: (recipient) =>
      buildCourseMembershipMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        weekday: params.weekday,
        time: params.time,
        termDateIso:
          params.termDateByUser?.[recipient.nickname.toLowerCase()] ?? params.termDateIso,
        loginUrl,
      }),
  });
}

/**
 * Participant mails for membership end-state after a members-dialog save (#310).
 * One SES send per event (already one event per person from the classifier).
 */
export async function notifyCourseMembershipEvents(
  client: DynamoDBClient,
  params: CourseMailCommon & {
    events: MembershipMailEvent[];
  },
) {
  const empty = {
    mailSentCount: 0,
    mailSkippedNoProfileCount: 0,
    mailSkippedInvitedCount: 0,
    mailFailedCount: 0,
  };
  if (params.events.length === 0) return empty;

  const loginUrl = resolveLoginUrl(params.baseUrl);
  const totals = { ...empty };

  // Parallel SES: sequential awaits burned updateCourse's short Lambda timeout when
  // membership + instructor mails ran after Dynamo writes.
  const summaries = await Promise.all(
    params.events.map((event) =>
      sendMailToParticipantUserIds(client, {
        participantsTable: params.participantsTable,
        sesSourceEmail: params.sesSourceEmail,
        tenantId: params.tenantId,
        participantUserIds: [event.participantId],
        buildMail: (recipient) => {
          const common = {
            nickname: recipient.nickname,
            displayName: recipient.displayName,
            courseName: params.courseName,
            weekday: params.weekday,
            time: params.time,
            termDateIso: event.termDateIso,
            loginUrl,
          };
          switch (event.kind) {
            case "joinAdd":
              return buildCourseMembershipMail(common);
            case "joinShift":
              return buildCourseMembershipJoinChangedMail(common);
            case "joinCancel":
              return buildCourseMembershipJoinCancelledMail(common);
            case "exitSet":
              return buildCourseMembershipExitMail(common);
            case "exitShift":
              return buildCourseMembershipExitChangedMail(common);
            case "exitClear":
              return buildCourseMembershipExitClearedMail(common);
          }
        },
      }),
    ),
  );
  for (const summary of summaries) {
    totals.mailSentCount += summary.mailSentCount;
    totals.mailSkippedNoProfileCount += summary.mailSkippedNoProfileCount;
    totals.mailSkippedInvitedCount += summary.mailSkippedInvitedCount;
    totals.mailFailedCount += summary.mailFailedCount;
  }

  return totals;
}

export async function notifyCourseActivated(
  client: DynamoDBClient,
  params: CourseMailCommon & {
    participantUserIds: string[];
    termDateIso?: string;
  },
) {
  const loginUrl = resolveLoginUrl(params.baseUrl);
  return sendMailToParticipantUserIds(client, {
    participantsTable: params.participantsTable,
    sesSourceEmail: params.sesSourceEmail,
    tenantId: params.tenantId,
    participantUserIds: params.participantUserIds,
    buildMail: (recipient) =>
      buildCourseActivatedMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        weekday: params.weekday,
        time: params.time,
        termDateIso: params.termDateIso,
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
    addedFromByUser?: Record<string, string>;
    removedUntilByUser?: Record<string, string>;
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
    buildMail: (recipient) =>
      buildInstructorParticipantListChangedMail({
        nickname: recipient.nickname,
        displayName: recipient.displayName,
        courseName: params.courseName,
        addedParticipants: params.addedParticipants,
        removedParticipants: params.removedParticipants,
        addedFromByUser: params.addedFromByUser,
        removedUntilByUser: params.removedUntilByUser,
        loginUrl,
      }),
  });
}
