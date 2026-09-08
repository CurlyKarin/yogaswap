import { formatTermDateTimeDe } from "../course/courseMailTemplates";
import { resolveOperationalMailGreeting } from "../mailGreeting";

type MailTemplate = {
  subject: string;
  html: string;
};

type TermMailInput = {
  nickname: string;
  displayName?: string | null;
  courseName: string;
  dateIso: string;
  time: string;
  loginUrl?: string;
};

function loginHint(loginUrl?: string): string {
  return loginUrl ? `<p><a href="${loginUrl}">Zum YogaSwap-Login</a></p>` : "";
}

function termDetails(courseName: string, dateIso: string, time: string): string {
  return `<strong>${courseName}</strong> am ${formatTermDateTimeDe(dateIso, time)}`;
}

export function buildSwapSuccessMail(input: TermMailInput): MailTemplate {
  const details = termDetails(input.courseName, input.dateIso, input.time);
  const greeting = resolveOperationalMailGreeting(input);
  return {
    subject: `Tausch bestätigt: ${input.courseName}`,
    html: `
      <p>Hallo ${greeting},</p>
      <p>dein Tausch ist bestätigt. Du bist jetzt für ${details} eingeplant.</p>
      <p>Im Kalender-Anhang findest du den Termin zum Importieren (optional).</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}

export function buildWaitlistPromotionMail(input: TermMailInput): MailTemplate {
  const details = termDetails(input.courseName, input.dateIso, input.time);
  const greeting = resolveOperationalMailGreeting(input);
  return {
    subject: `Nachrücken: ${input.courseName}`,
    html: `
      <p>Hallo ${greeting},</p>
      <p>du bist von der Warteliste nachgerückt und bist jetzt für ${details} eingeplant.</p>
      <p>Im Kalender-Anhang findest du den Termin zum Importieren (optional).</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}
