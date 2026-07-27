import type { BaseCustomMessageTriggerEvent, CustomMessageTriggerEvent } from "aws-lambda";
import { buildCognitoPasswordResetCodeMail } from "../shared/templates/auth/authMailTemplates";

/** Missing from @types/aws-lambda; Cognito docs include this trigger source. */
export type CustomMessageAdminResetUserPasswordTriggerEvent =
  BaseCustomMessageTriggerEvent<"CustomMessage_AdminResetUserPassword">;

export type CognitoCustomMessageEvent =
  | CustomMessageTriggerEvent
  | CustomMessageAdminResetUserPasswordTriggerEvent;

const PASSWORD_RESET_TRIGGERS = new Set<string>([
  "CustomMessage_ForgotPassword",
  "CustomMessage_AdminResetUserPassword",
]);

function resolveNickname(event: CognitoCustomMessageEvent): string {
  const attrs = event.request.userAttributes || {};
  const nickname = (attrs.nickname || attrs.preferred_username || "").trim();
  if (nickname) return nickname;
  return (event.userName || "Teilnehmer").trim() || "Teilnehmer";
}

export async function handler(event: CognitoCustomMessageEvent): Promise<CognitoCustomMessageEvent> {
  if (!PASSWORD_RESET_TRIGGERS.has(event.triggerSource)) {
    return event;
  }

  const codeParameter = event.request.codeParameter || "{####}";
  const mail = buildCognitoPasswordResetCodeMail({
    locale: process.env.MAIL_LOCALE || "de",
    nickname: resolveNickname(event),
    codeParameter,
  });

  event.response.emailSubject = mail.subject;
  event.response.emailMessage = mail.html;

  return event;
}
