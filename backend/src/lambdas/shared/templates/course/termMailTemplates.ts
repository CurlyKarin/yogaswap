import { formatTermDateTimeDe } from "./courseMailTemplates";

type MailTemplate = {
  subject: string;
  html: string;
};

export type TermMailInput = {
  nickname: string;
  courseName: string;
  dateIso: string;
  time: string;
  loginUrl?: string;
};

function termLine(dateIso: string, time: string): string {
  return formatTermDateTimeDe(dateIso, time);
}

function loginHint(loginUrl?: string): string {
  return loginUrl ? `<p><a href="${loginUrl}">Zum YogaSwap-Login</a></p>` : "";
}

/** Studio-/Trainer-Absage eines gesamten Termins (cancelCourseDate). */
export function buildStudioTermCancelledMail(input: TermMailInput): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  return {
    subject: `Terminabsage: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>der Termin am ${when} im Kurs <strong>${input.courseName}</strong> wurde abgesagt.</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}

/** Rechtzeitige Selbst-Absage: Platz wird freigegeben (updateOverride). */
export function buildParticipantTermReleasedMail(input: TermMailInput): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  return {
    subject: `Termin freigegeben: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>du hast deinen Platz am ${when} im Kurs <strong>${input.courseName}</strong> freigegeben.</p>
      <p>Der Termin entfällt für dich. Im YogaSwap-Portal kannst du nach einem Ersatztermin suchen — diese Möglichkeit besteht, solange das Tauschfenster offen ist.</p>
      <p>Bei Warteliste auf diesem Termin kann jemand nachrücken.</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}
