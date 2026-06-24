import { formatIsoDateDe } from "./courseMailTemplates";

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
  const dateLabel = formatIsoDateDe(dateIso);
  return `<strong>${dateLabel}</strong> um <strong>${time}</strong> Uhr`;
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
      <p>Der Termin entfällt für dich; bei Warteliste kann jemand nachrücken.</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}

/** Kurzfristige Absage: Platz bleibt belegt (updateOverride). */
export function buildParticipantShortNoticeCancellationMail(input: TermMailInput): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  return {
    subject: `Kurzfristige Absage: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>deine kurzfristige Absage für den Termin am ${when} im Kurs <strong>${input.courseName}</strong> wurde gespeichert.</p>
      <p>Dein Platz bleibt belegt; ein Tausch ist in diesem Zeitfenster nicht mehr möglich.</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}
