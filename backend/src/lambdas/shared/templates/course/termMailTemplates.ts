import { formatTermDateTimeDe } from "./courseMailTemplates";
import { resolveOperationalMailGreeting } from "../mailGreeting";
import {
  formatStudioContactHtml,
  type StudioContact,
} from "../../studioContact";

type MailTemplate = {
  subject: string;
  html: string;
};

export type TermMailInput = {
  nickname: string;
  displayName?: string | null;
  courseName: string;
  dateIso: string;
  time: string;
  loginUrl?: string;
  /** Studio-Kontakt aus Tenant-Settings (#272). */
  studioContact?: StudioContact | null;
};

function termLine(dateIso: string, time: string): string {
  return formatTermDateTimeDe(dateIso, time);
}

function loginHint(loginUrl?: string): string {
  return loginUrl ? `<p><a href="${loginUrl}">Zum YogaSwap-Login</a></p>` : "";
}

function contactHint(contact?: StudioContact | null): string {
  const line = formatStudioContactHtml(contact);
  return line ? `<p>${line}</p>` : "";
}

/** Studio-/Trainer-Absage eines gesamten Termins (cancelCourseDate). */
export function buildStudioTermCancelledMail(input: TermMailInput): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  const greeting = resolveOperationalMailGreeting(input);
  return {
    subject: `Terminabsage: ${input.courseName}`,
    html: `
      <p>Hallo ${greeting},</p>
      <p>der Termin am ${when} im Kurs <strong>${input.courseName}</strong> wurde abgesagt.</p>
      ${contactHint(input.studioContact)}
      ${loginHint(input.loginUrl)}
    `,
  };
}

/** Rechtzeitige Selbst-Absage: Platz wird freigegeben (updateOverride). */
export function buildParticipantTermReleasedMail(input: TermMailInput): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  const greeting = resolveOperationalMailGreeting(input);
  return {
    subject: `Termin freigegeben: ${input.courseName}`,
    html: `
      <p>Hallo ${greeting},</p>
      <p>du hast deinen Platz am ${when} im Kurs <strong>${input.courseName}</strong> freigegeben.</p>
      <p>Der Termin entfällt für dich. Im YogaSwap-Portal kannst du nach einem Ersatztermin suchen — diese Möglichkeit besteht, solange das Tauschfenster offen ist.</p>
      <p>Bei Warteliste auf diesem Termin kann jemand nachrücken.</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}

/** Absage zurückgenommen (RC oder SN) — wieder Teilnahme. */
export function buildParticipantAbsenceWithdrawnMail(input: TermMailInput): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  const greeting = resolveOperationalMailGreeting(input);
  return {
    subject: `Absage zurückgenommen: ${input.courseName}`,
    html: `
      <p>Hallo ${greeting},</p>
      <p>du nimmst am ${when} im Kurs <strong>${input.courseName}</strong> wieder teil. Deine Absage wurde zurückgenommen.</p>
      ${loginHint(input.loginUrl)}
    `,
  };
}

export type InstructorTermParticipationKind =
  | "term_released"
  | "term_release_cleared"
  | "short_notice"
  | "short_notice_cleared"
  | "swap_joined"
  | "swap_left";

type InstructorTermParticipationMailInput = TermMailInput & {
  kind: InstructorTermParticipationKind;
  memberNickname: string;
};

/** Kursleitung: Änderung der Termin-Teilnahme (#398). */
export function buildInstructorTermParticipationChangedMail(
  input: InstructorTermParticipationMailInput,
): MailTemplate {
  const when = termLine(input.dateIso, input.time);
  const greeting = resolveOperationalMailGreeting(input);
  const member = input.memberNickname;
  let actionLine: string;
  let subjectPrefix: string;
  switch (input.kind) {
    case "term_released":
      subjectPrefix = "Absage";
      actionLine = `<p><strong>${member}</strong> hat den Platz am ${when} im Kurs <strong>${input.courseName}</strong> freigegeben (rechtzeitig).</p>`;
      break;
    case "term_release_cleared":
      subjectPrefix = "Absage zurückgenommen";
      actionLine = `<p><strong>${member}</strong> nimmt am ${when} im Kurs <strong>${input.courseName}</strong> wieder teil (rechtzeitige Absage zurückgenommen).</p>`;
      break;
    case "short_notice":
      subjectPrefix = "Kurzfristige Absage";
      actionLine = `<p><strong>${member}</strong> hat kurzfristig für den ${when} im Kurs <strong>${input.courseName}</strong> abgesagt (Platz bleibt belegt).</p>`;
      break;
    case "short_notice_cleared":
      subjectPrefix = "Absage zurückgenommen";
      actionLine = `<p><strong>${member}</strong> hat die kurzfristige Absage für den ${when} im Kurs <strong>${input.courseName}</strong> zurückgenommen und nimmt wieder teil.</p>`;
      break;
    case "swap_joined":
      subjectPrefix = "Tausch";
      actionLine = `<p><strong>${member}</strong> nimmt nach Tausch am ${when} im Kurs <strong>${input.courseName}</strong> teil.</p>`;
      break;
    case "swap_left":
      subjectPrefix = "Tausch";
      actionLine = `<p><strong>${member}</strong> hat nach Tausch den Termin am ${when} im Kurs <strong>${input.courseName}</strong> verlassen.</p>`;
      break;
  }
  return {
    subject: `${subjectPrefix}: ${input.courseName} (${member})`,
    html: `
      <p>Hallo ${greeting},</p>
      ${actionLine}
      ${loginHint(input.loginUrl)}
    `,
  };
}
