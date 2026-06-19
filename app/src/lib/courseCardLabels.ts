import { formatCourseIsoDateDe } from "shared/courseStatus";

/** Zentraler Textkatalog für CourseCard — später i18n-fähig machen. */
export const TERM_MARKER_EXCLUDED_LABEL = "Termin entfällt (vom Studio abgesagt)";
export const TERM_MARKER_PAST_LABEL = "Vergangener Termin im Nachlauf";
export const TERM_MARKER_CUTOFF_LABEL = "Kurz vor Termin (Cutoff)";

export type AbsenceAnnouncementOutcome =
  | "saving"
  | "cancelled"
  | "shortNoticeCancelled"
  | "undo"
  | "error";

export const GUEST_CHIP_LABEL = "Gast";

export function guestChipAriaLabel(index: number, total: number): string {
  return total === 1 ? "Gastplatz belegt" : `Gastplatz ${index} von ${total}`;
}

export function participantChipAriaLabel(
  name: string,
  { isSelf, isSn, isSwapped }: { isSelf: boolean; isSn: boolean; isSwapped: boolean },
): string {
  if (isSn && isSelf) return `${name}, du, kurzfristig abgesagt, Platz bleibt belegt`;
  if (isSn) return `${name}, kurzfristig abgesagt, Platz bleibt belegt`;
  if (isSwapped) return `${name}, getauscht`;
  if (isSelf) return `${name}, du`;
  return `${name}, regulär eingetragen`;
}

export function waitlistChipAriaLabel(name: string, isSelf: boolean): string {
  return isSelf ? `${name}, du auf der Warteliste` : `${name}, auf der Warteliste`;
}

export function formatAbsenceAnnouncement(
  courseName: string,
  termIso: string,
  outcome: AbsenceAnnouncementOutcome,
): string {
  const term = formatCourseIsoDateDe(termIso);
  switch (outcome) {
    case "saving":
      return "Speichere Absage …";
    case "cancelled":
      return `Termin abgesagt für ${courseName}, ${term}. Absage kann zurückgenommen werden.`;
    case "shortNoticeCancelled":
      return `Kurzfristige Absage gespeichert für ${courseName}, ${term}. Absage kann zurückgenommen werden.`;
    case "undo":
      return `Absage zurückgenommen für ${courseName}, ${term}. Du nimmst wieder am Termin teil.`;
    case "error":
      return "Fehler beim Speichern der Absage.";
  }
}

export function termSelectDisabledHint(courseName: string, hasCourseDates: boolean): string {
  return hasCourseDates
    ? `Keine anstehenden Termine für ${courseName}.`
    : `Kein Termin im Kurszeitraum für ${courseName}.`;
}

export function termSelectAriaLabel(courseName: string): string {
  return `Termin für ${courseName}`;
}

export function excludedTermOptionSuffix(): string {
  return " (entfällt)";
}

export function lastTermOptionSuffix(): string {
  return " (letzter Termin)";
}
