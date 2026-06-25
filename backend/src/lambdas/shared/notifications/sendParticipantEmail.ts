import { SendEmailCommand, SendRawEmailCommand, SESClient } from "@aws-sdk/client-ses";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { resolveParticipantEmail } from "../participantEmailLookup";

const ses = new SESClient({});

export type MailDeliverySummary = {
  mailSentCount: number;
  mailSkippedNoProfileCount: number;
  mailSkippedInvitedCount: number;
  mailFailedCount: number;
};

export type ParticipantMailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

function encodeMimeSubject(subject: string): string {
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  const encoded = Buffer.from(subject, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}

function buildRawMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
  attachment?: ParticipantMailAttachment;
}): string {
  if (!params.attachment) {
    return [
      `From: ${params.from}`,
      `To: ${params.to}`,
      `Subject: ${encodeMimeSubject(params.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      params.html,
    ].join("\r\n");
  }

  const boundary = `----=_YogaSwap_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const contentType = params.attachment.contentType ?? "application/octet-stream";

  return [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeMimeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    params.html,
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    `Content-Disposition: attachment; filename="${params.attachment.filename}"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    params.attachment.content,
    `--${boundary}--`,
  ].join("\r\n");
}

export async function sendParticipantEmail(params: {
  sesSourceEmail: string;
  to: string;
  subject: string;
  html: string;
  attachment?: ParticipantMailAttachment;
}): Promise<void> {
  if (params.attachment) {
    const raw = buildRawMimeMessage({
      from: params.sesSourceEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      attachment: params.attachment,
    });
    await ses.send(
      new SendRawEmailCommand({
        Source: params.sesSourceEmail,
        Destinations: [params.to],
        RawMessage: { Data: Buffer.from(raw, "utf-8") },
      }),
    );
    return;
  }

  await ses.send(
    new SendEmailCommand({
      Source: params.sesSourceEmail,
      Destination: { ToAddresses: [params.to] },
      Message: {
        Subject: { Data: params.subject },
        Body: { Html: { Data: params.html } },
      },
    }),
  );
}

function emptySummary(): MailDeliverySummary {
  return {
    mailSentCount: 0,
    mailSkippedNoProfileCount: 0,
    mailSkippedInvitedCount: 0,
    mailFailedCount: 0,
  };
}

export async function sendMailToParticipantUserIds(
  client: DynamoDBClient,
  params: {
    participantsTable?: string;
    sesSourceEmail?: string;
    tenantId: string;
    participantUserIds: string[];
    buildMail: (recipientName: string) => { subject: string; html: string; attachment?: ParticipantMailAttachment };
  },
): Promise<MailDeliverySummary> {
  const summary = emptySummary();
  const recipients = Array.from(new Set(params.participantUserIds)).sort((a, b) => a.localeCompare(b));

  if (!params.participantsTable || !params.sesSourceEmail || recipients.length === 0) {
    return summary;
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
      summary.mailSkippedNoProfileCount += 1;
      console.warn("participant mail lookup failed", { tenantId: params.tenantId, userId, error });
      continue;
    }

    if (!email) {
      summary.mailSkippedNoProfileCount += 1;
      continue;
    }
    if (status === "invited") {
      summary.mailSkippedInvitedCount += 1;
      continue;
    }

    const recipientName = (resolvedUserId || userId || "Teilnehmer").trim();
    const mail = params.buildMail(recipientName);

    try {
      await sendParticipantEmail({
        sesSourceEmail: params.sesSourceEmail,
        to: email,
        subject: mail.subject,
        html: mail.html,
        attachment: mail.attachment,
      });
      summary.mailSentCount += 1;
    } catch (error) {
      summary.mailFailedCount += 1;
      console.warn("participant mail failed", { tenantId: params.tenantId, userId, email, error });
    }
  }

  return summary;
}
