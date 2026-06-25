import { formatCourseIsoDateDe } from "shared/courseStatus";
import { weekdayLabelDe } from "./weekdayLabels";

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

export type CourseScheduleDisplay = {
  weekdayLabel: string;
  time: string;
  roomLabel?: string;
  ariaLabel: string;
};

/** Anzeige für Kursrhythmus (Wochentag, Uhrzeit, optional Raum) — später locale/i18n. */
export function resolveCourseScheduleDisplay(
  weekday: string,
  time: string,
  roomLabel?: string,
): CourseScheduleDisplay {
  const weekdayLabel = weekdayLabelDe(weekday);
  const segments = [weekdayLabel, time];
  if (roomLabel) segments.push(roomLabel);
  return {
    weekdayLabel,
    time,
    ...(roomLabel ? { roomLabel } : {}),
    ariaLabel: segments.join(" · "),
  };
}

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

/** Hinweis in der Kurskachel, wenn Teilnehmer-Aktionen gesperrt sind und kein Termin-Kontext. */
export function resolveInactiveParticipantNotice(input: {
  isAutomaticallyInactive: boolean;
}): string {
  return input.isAutomaticallyInactive
    ? "Dieser Kurs wurde automatisch beendet. Du kannst nur noch bestehende Tauschvorgänge verwalten."
    : "Dieser Kurs ist inaktiv. Du kannst nur noch bestehende Tauschvorgänge verwalten.";
}

/** Footer-Hinweis für vergangene Termine (mit oder neben Aktionen im Nachlauf). */
export function resolvePastTermNotice(input: {
  inSwapGrace: boolean;
  hasRegularCancellation: boolean;
  hasShortNoticeCancellation: boolean;
  hasPendingSwapFromOrigin: boolean;
  hasActiveSwapFromOrigin: boolean;
  canRequestAlternativeTerm: boolean;
}): string | null {
  if (!input.inSwapGrace) {
    if (input.hasRegularCancellation) {
      return "Für diesen Termin ist der Nachlauf vorbei — kein Tausch mehr möglich.";
    }
    return "Vergangener Termin — keine Änderungen mehr möglich.";
  }
  if (input.hasShortNoticeCancellation) {
    return "Vergangener Termin im Nachlauf — kurzfristige Absage, kein Tausch möglich.";
  }
  if (!input.hasRegularCancellation) {
    return "Vergangener Termin im Nachlauf — Tausch nur nach rechtzeitiger Absage.";
  }
  if (input.hasActiveSwapFromOrigin) {
    return null;
  }
  if (input.hasPendingSwapFromOrigin) {
    return "Du hast rechtzeitig abgesagt. Deine Tauschanfrage ist offen — du wartest noch auf einen passenden Termin.";
  }
  if (input.canRequestAlternativeTerm) {
    return "Du hast rechtzeitig abgesagt. Wähle „Anderen Termin wählen“, um einen Ersatztermin anzufragen.";
  }
  return "Du hast rechtzeitig abgesagt. Derzeit ist kein passender Ersatztermin verfügbar.";
}

export function excludedTermOptionSuffix(): string {
  return " (entfällt)";
}

export function lastTermOptionSuffix(): string {
  return " (letzter Termin)";
}
