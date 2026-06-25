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

const COURSE_WEEKDAY_DE: Record<string, string> = {
  Sun: "Sonntag",
  Sunday: "Sonntag",
  Mon: "Montag",
  Monday: "Montag",
  Tue: "Dienstag",
  Tuesday: "Dienstag",
  Wed: "Mittwoch",
  Wednesday: "Mittwoch",
  Thu: "Donnerstag",
  Thursday: "Donnerstag",
  Fri: "Freitag",
  Friday: "Freitag",
  Sat: "Samstag",
  Saturday: "Samstag",
};

/** Kurs-Wochentag (gespeichert als Mon/Tue/…) → deutsches Label. */
export function formatCourseWeekdayDe(weekday?: string): string | undefined {
  if (!weekday?.trim()) return undefined;
  const key = weekday.trim();
  return COURSE_WEEKDAY_DE[key] ?? COURSE_WEEKDAY_DE[key.slice(0, 3)] ?? key;
}

/** Wochentag zu einem konkreten Termin (ISO-Datum), locale de-DE. */
export function formatIsoWeekdayDe(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("de-DE", { weekday: "long", timeZone: "UTC" });
}

/** Terminzeile für Mails: „Montag, 20.06.2026 um 18:00 Uhr“. */
export function formatTermDateTimeDe(isoDate: string, time: string): string {
  const weekday = formatIsoWeekdayDe(isoDate);
  const dateLabel = formatIsoDateDe(isoDate);
  if (weekday) {
    return `<strong>${weekday}, ${dateLabel}</strong> um <strong>${time}</strong> Uhr`;
  }
  return `<strong>${dateLabel}</strong> um <strong>${time}</strong> Uhr`;
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
  termDateIso?: string;
  loginUrl?: string;
};

function formatTermHint(termDateIso: string | undefined, time: string | undefined, label: string): string {
  if (!termDateIso || !time) return "";
  return `<p>${label} ${formatTermDateTimeDe(termDateIso, time)}.</p>`;
}

function formatCourseScheduleHint(weekday?: string, time?: string): string {
  const weekdayDe = formatCourseWeekdayDe(weekday);
  if (weekdayDe && time) return ` (${weekdayDe}, ${time} Uhr)`;
  if (time) return ` (${time} Uhr)`;
  return "";
}

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
  const weekdayTime = formatCourseScheduleHint(input.weekday, input.time);
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";
  const nextTermHint = formatTermHint(input.termDateIso, input.time, "Dein nächster Termin ist am");

  return {
    subject: `Kursbeitritt: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>du wurdest zum Kurs <strong>${input.courseName}</strong>${weekdayTime} hinzugefügt.</p>
      ${nextTermHint}
      <p>Im YogaSwap-Portal kannst du Termine einsehen und Tauschvorgänge verwalten.</p>
      ${loginHint}
    `,
  };
}

export function buildCourseActivatedMail(input: CourseInfoMailInput): MailTemplate {
  const weekdayTime = formatCourseScheduleHint(input.weekday, input.time);
  const loginHint = input.loginUrl
    ? `<p><a href="${input.loginUrl}">Zum YogaSwap-Login</a></p>`
    : "";
  const firstTermHint = formatTermHint(input.termDateIso, input.time, "Der erste Termin ist am");

  return {
    subject: `Kurs ist aktiv: ${input.courseName}`,
    html: `
      <p>Hallo ${input.nickname},</p>
      <p>der Kurs <strong>${input.courseName}</strong>${weekdayTime} ist jetzt aktiv.</p>
      ${firstTermHint}
      <p>Du kannst im YogaSwap-Portal Termine und Tauschvorgänge verwalten.</p>
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
