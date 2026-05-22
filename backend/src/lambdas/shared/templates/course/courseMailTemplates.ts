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
