import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { resolveParticipantEmail } from "./participantEmailLookup";
import { buildPlannedEndDateMail } from "./templates/course/courseMailTemplates";

const ses = new SESClient({});

export type PlannedEndDateNotificationResult = {
  mailSentCount: number;
  mailSkippedNoProfileCount: number;
  mailSkippedInvitedCount: number;
  mailFailedCount: number;
};

function dedupeUsers(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export async function notifyParticipantsPlannedEndDate(
  client: DynamoDBClient,
  params: {
    participantsTable?: string;
    sesSourceEmail?: string;
    mailLocale?: string;
    loginUrl?: string;
    tenantId: string;
    courseName: string;
    plannedEndDateIso: string;
    participantUserIds: string[];
  },
): Promise<PlannedEndDateNotificationResult> {
  const result: PlannedEndDateNotificationResult = {
    mailSentCount: 0,
    mailSkippedNoProfileCount: 0,
    mailSkippedInvitedCount: 0,
    mailFailedCount: 0,
  };

  const recipients = dedupeUsers(params.participantUserIds);
  if (!params.participantsTable || !params.sesSourceEmail || recipients.length === 0) {
    return result;
  }

  for (const userId of recipients) {
    let email: string | undefined;
    let resolvedUserId: string | undefined;
    let status: "no_login" | "invited" | "active" | undefined;
    try {
      const lookup = await resolveParticipantEmail(
        client,
        params.participantsTable,
        params.tenantId,
        userId,
      );
      email = lookup.email;
      resolvedUserId = lookup.resolvedUserId;
      status = lookup.status;
    } catch (error) {
      result.mailSkippedNoProfileCount += 1;
      console.warn("plannedEndDate participant lookup failed", {
        tenantId: params.tenantId,
        userId,
        error,
      });
      continue;
    }

    if (!email) {
      result.mailSkippedNoProfileCount += 1;
      continue;
    }
    if (status === "invited") {
      result.mailSkippedInvitedCount += 1;
      continue;
    }

    const recipientName = (resolvedUserId || userId || "Teilnehmer").trim();
    const mail = buildPlannedEndDateMail({
      locale: params.mailLocale,
      nickname: recipientName,
      courseName: params.courseName,
      plannedEndDateIso: params.plannedEndDateIso,
      loginUrl: params.loginUrl,
    });

    try {
      await ses.send(
        new SendEmailCommand({
          Source: params.sesSourceEmail,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: mail.subject },
            Body: {
              Html: { Data: mail.html },
            },
          },
        }),
      );
      result.mailSentCount += 1;
    } catch (error) {
      result.mailFailedCount += 1;
      console.warn("plannedEndDate mail failed", {
        tenantId: params.tenantId,
        userId,
        email,
        error,
      });
    }
  }

  return result;
}
