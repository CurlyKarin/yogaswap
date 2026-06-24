export type CourseMailLocale = "de";

type PlannedEndDateMailInput = {
  locale?: string;
  nickname: string;
  courseName: string;
  plannedEndDateIso: string;
  loginUrl?: string;
};

type MailTemplate = {
  subject: string;
  html: string;
};

function normalizeLocale(locale?: string): CourseMailLocale {
  const raw = (locale || "de").trim().toLowerCase();
  if (raw.startsWith("de")) return "de";
  return "de";
}

export function formatIsoDateDe(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildPlannedEndDateMail(input: PlannedEndDateMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const plannedEndLabel = formatIsoDateDe(input.plannedEndDateIso);
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";

  if (locale === "de") {
    return {
      subject: `Geplantes Kursende: ${input.courseName}`,
      html: `
        <p>Hallo ${input.nickname},</p>
        <p>für den Kurs <strong>${input.courseName}</strong> wurde ein geplantes Kursende festgelegt: <strong>${plannedEndLabel}</strong>.</p>
        <p>Termine nach diesem Datum entfallen für die Kursplanung. Offene Tauschanfragen solltest du vorher abschließen oder abbrechen.</p>
        ${loginHint}
      `,
    };
  }

  return {
    subject: `Geplantes Kursende: ${input.courseName}`,
    html: "",
  };
}

type PlannedEndDateClearedMailInput = {
  locale?: string;
  nickname: string;
  courseName: string;
  previousPlannedEndDateIso: string;
  loginUrl?: string;
};

type CourseInfoMailInput = {
  nickname: string;
  courseName: string;
  weekday?: string;
  time?: string;
  loginUrl?: string;
};

export function buildPlannedEndDateClearedMail(input: PlannedEndDateClearedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const previousEndLabel = formatIsoDateDe(input.previousPlannedEndDateIso);
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";

  if (locale === "de") {
    return {
      subject: `Kursende aufgehoben: ${input.courseName}`,
      html: `
        <p>Hallo ${input.nickname},</p>
        <p>für den Kurs <strong>${input.courseName}</strong> wurde das geplante Kursende vom <strong>${previousEndLabel}</strong> wieder aufgehoben.</p>
        <p>Der Kurs läuft damit wieder ohne festes Enddatum weiter (Termine gemäß Studio-Planungsfenster).</p>
        ${loginHint}
      `,
    };
  }

  return {
    subject: `Kursende aufgehoben: ${input.courseName}`,
    html: "",
  };
}

export function buildCourseMembershipMail(input: CourseInfoMailInput): MailTemplate {
  const weekdayTime =
    input.weekday && input.time ? ` (${input.weekday}, ${input.time} Uhr)` : input.time ? ` (${input.time} Uhr)` : "";
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";

  return {
    subject: `Kursbeitritt: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>du wurdest zum Kurs <strong>${input.courseName}</strong>${weekdayTime} hinzugefügt.</p>
      <p>Im YogaSwap-Portal kannst du Termine einsehen und Tausche verwalten.</p>
      ${loginHint}
    `,
  };
}

export function buildCourseActivatedMail(input: CourseInfoMailInput): MailTemplate {
  const weekdayTime =
    input.weekday && input.time ? ` (${input.weekday}, ${input.time} Uhr)` : input.time ? ` (${input.time} Uhr)` : "";
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";

  return {
    subject: `Kurs ist aktiv: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>der Kurs <strong>${input.courseName}</strong>${weekdayTime} ist jetzt aktiv.</p>
      <p>Du kannst im YogaSwap-Portal Termine und Tausche verwalten.</p>
      ${loginHint}
    `,
  };
}

type InstructorParticipantListMailInput = {
  nickname: string;
  courseName: string;
  addedParticipants: string[];
  removedParticipants: string[];
  loginUrl?: string;
};

export function buildInstructorParticipantListChangedMail(
  input: InstructorParticipantListMailInput,
): MailTemplate {
  const parts: string[] = [];
  if (input.addedParticipants.length > 0) {
    parts.push(
      `<p>Hinzugefügt: <strong>${input.addedParticipants.join(", ")}</strong></p>`,
    );
  }
  if (input.removedParticipants.length > 0) {
    parts.push(
      `<p>Entfernt: <strong>${input.removedParticipants.join(", ")}</strong></p>`,
    );
  }
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";

  return {
    subject: `Teilnehmerliste geändert: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>die Stamm-Teilnehmerliste für <strong>${input.courseName}</strong> wurde geändert:</p>
      ${parts.join("\n")}
      ${loginHint}
    `,
  };
}
