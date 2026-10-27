import { buildCourseOccurrenceLocal, DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END } from "./courseStatus";
import type { TenantSettings } from "./types";

export const DEFAULT_SWAP_MIN_OFFSET_DAYS = -7;
export const DEFAULT_SWAP_MAX_OFFSET_DAYS = 7;
export const DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS = 5;
export { DEFAULT_CANCELLATION_SWAP_CUTOFF_MINUTES, resolveCancellationSwapCutoffMinutes } from "./cancellationSwapCutoff";

export type SwapWindow = {
  minOffsetDays: number;
  maxOffsetDays: number;
};

export function resolveSwapWindow(settings?: TenantSettings): SwapWindow {
  const min = settings?.minOffsetDays;
  const max = settings?.maxOffsetDays;
  return {
    minOffsetDays:
      typeof min === "number" && Number.isInteger(min)
        ? min
        : DEFAULT_SWAP_MIN_OFFSET_DAYS,
    maxOffsetDays:
      typeof max === "number" && Number.isInteger(max)
        ? max
        : DEFAULT_SWAP_MAX_OFFSET_DAYS,
  };
}

export function resolveRollingPlanningHorizonWeeks(settings?: TenantSettings): number {
  const value = settings?.rollingPlanningHorizonWeeks;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 52) {
    return value;
  }
  return DEFAULT_ROLLING_PLANNING_HORIZON_WEEKS;
}

export function resolveInactiveGraceDays(settings?: TenantSettings): number {
  const value = settings?.inactiveGraceDaysAfterCourseEnd;
  return Number.isInteger(value) && (value ?? 0) >= 0
    ? (value as number)
    : DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
}

/** Stamm-Mails an Kursleitung (#398). Default aus — vermeidet Selbstbenachrichtigung Admin=Leitung. */
export function resolveNotifyInstructorsOnStemChange(settings?: TenantSettings): boolean {
  return settings?.notifyInstructorsOnStemChange === true;
}

/** Termin-Teilnahme-Mails an Kursleitung (#398 Absage/Tausch). Default aus. */
export function resolveNotifyInstructorsOnTermParticipationChange(
  settings?: TenantSettings,
): boolean {
  return settings?.notifyInstructorsOnTermParticipationChange === true;
}

/** Vorschlag beim Aktivieren des Start-Fensters (#398). */
export const DEFAULT_INSTRUCTOR_TERM_NOTIFY_FROM_HOURS = 24;

/** Start-Fenster: Stunden vor Termin (1–168), sonst undefined = aus. */
export function resolveInstructorTermNotifyFromHoursBeforeStart(
  settings?: TenantSettings,
): number | undefined {
  const value = settings?.instructorTermNotifyFromHoursBeforeStart;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 168) {
    return value;
  }
  return undefined;
}

/** Bis-Fenster: Minuten vor Termin (0–1440), sonst undefined = aus. */
export function resolveInstructorTermNotifyUntilMinutesBeforeStart(
  settings?: TenantSettings,
): number | undefined {
  const value = settings?.instructorTermNotifyUntilMinutesBeforeStart;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 24 * 60) {
    return value;
  }
  return undefined;
}

/**
 * Ob jetzt eine Kursleitungs-Mail zu einem Termin-Event gesendet werden soll (#398).
 * Master aus → false. Optional Start (erst ab X h vorher) und Bis (nur bis Y min vorher).
 */
export function shouldNotifyInstructorsForTermParticipation(
  settings: TenantSettings | undefined,
  dateIso: string,
  courseTime: string,
  now: Date = new Date(),
): boolean {
  if (!resolveNotifyInstructorsOnTermParticipationChange(settings)) return false;
  const start = buildCourseOccurrenceLocal(dateIso, courseTime);
  if (!start) return false;
  const msUntil = start.getTime() - now.getTime();
  if (msUntil < 0) return false;

  const fromHours = resolveInstructorTermNotifyFromHoursBeforeStart(settings);
  if (fromHours != null) {
    const windowOpensMs = fromHours * 60 * 60 * 1000;
    if (msUntil > windowOpensMs) return false;
  }

  const untilMinutes = resolveInstructorTermNotifyUntilMinutesBeforeStart(settings);
  if (untilMinutes != null) {
    const windowClosesMs = untilMinutes * 60 * 1000;
    if (msUntil <= windowClosesMs) return false;
  }

  return true;
}

export type StudioSettingsPatch = {
  name?: string;
  inactiveGraceDaysAfterCourseEnd?: number;
  minOffsetDays?: number;
  maxOffsetDays?: number;
  rollingPlanningHorizonWeeks?: number;
  cancellationSwapCutoffMinutesBeforeStart?: number;
  /** Studio-Kontaktadresse für Mails (#272); leer = entfernen. */
  contactEmail?: string | null;
  /** Anzeigename zum Kontakt; leer = entfernen (Fallback Tenant-Name). */
  contactName?: string | null;
  /** Stamm-Mails an course.instructors (#398). */
  notifyInstructorsOnStemChange?: boolean;
  /** Termin-Teilnahme-Mails an course.instructors (#398). */
  notifyInstructorsOnTermParticipationChange?: boolean;
  /** Start-Fenster Stunden; null = entfernen. */
  instructorTermNotifyFromHoursBeforeStart?: number | null;
  /** Bis-Fenster Minuten; null = entfernen. */
  instructorTermNotifyUntilMinutesBeforeStart?: number | null;
};

const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStudioSettingsPatch(patch: StudioSettingsPatch): string | null {
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    const name = typeof patch.name === "string" ? patch.name.trim() : "";
    if (!name) return "Bitte einen Studionamen eingeben.";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "inactiveGraceDaysAfterCourseEnd")) {
    const days = patch.inactiveGraceDaysAfterCourseEnd;
    if (!Number.isInteger(days) || (days ?? 0) < 0 || (days ?? 0) > 90) {
      return "Nachlauf muss eine ganze Zahl zwischen 0 und 90 sein.";
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "minOffsetDays") ||
    Object.prototype.hasOwnProperty.call(patch, "maxOffsetDays")
  ) {
    const min = patch.minOffsetDays;
    const max = patch.maxOffsetDays;
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      return "Tauschfenster: beide Werte müssen ganze Zahlen sein.";
    }
    if ((min ?? 0) < -90 || (min ?? 0) > 90 || (max ?? 0) < -90 || (max ?? 0) > 90) {
      return "Tauschfenster: Werte müssen zwischen -90 und 90 liegen.";
    }
    if ((min as number) > (max as number)) {
      return "Tauschfenster: „frühestens“ darf nicht größer als „spätestens“ sein.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "rollingPlanningHorizonWeeks")) {
    const weeks = patch.rollingPlanningHorizonWeeks;
    if (!Number.isInteger(weeks) || (weeks ?? 0) < 1 || (weeks ?? 0) > 52) {
      return "Planungs- und Sichtfenster muss eine ganze Zahl zwischen 1 und 52 Wochen sein.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "cancellationSwapCutoffMinutesBeforeStart")) {
    const minutes = patch.cancellationSwapCutoffMinutesBeforeStart;
    if (!Number.isInteger(minutes) || (minutes ?? 0) < 0 || (minutes ?? 0) > 24 * 60) {
      return "Absagefrist für Mitglieder muss eine ganze Zahl zwischen 0 und 1440 sein.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "contactEmail")) {
    const raw = patch.contactEmail;
    if (raw != null && typeof raw !== "string") {
      return "Kontakt-E-Mail muss Text sein.";
    }
    const email = typeof raw === "string" ? raw.trim() : "";
    if (email && !CONTACT_EMAIL_RE.test(email)) {
      return "Bitte eine gültige Kontakt-E-Mail eingeben (oder das Feld leeren).";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "contactName")) {
    const raw = patch.contactName;
    if (raw != null && typeof raw !== "string") {
      return "Kontaktname muss Text sein.";
    }
    const label = typeof raw === "string" ? raw.trim() : "";
    if (label.length > 80) {
      return "Kontaktname darf höchstens 80 Zeichen haben.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notifyInstructorsOnStemChange")) {
    if (typeof patch.notifyInstructorsOnStemChange !== "boolean") {
      return "Mitteilung an Kursleitung bei Stamm-Änderungen muss ein Schalter (ja/nein) sein.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notifyInstructorsOnTermParticipationChange")) {
    if (typeof patch.notifyInstructorsOnTermParticipationChange !== "boolean") {
      return "Mitteilung an Kursleitung bei Termin-Teilnahme muss ein Schalter (ja/nein) sein.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "instructorTermNotifyFromHoursBeforeStart")) {
    const raw = patch.instructorTermNotifyFromHoursBeforeStart;
    if (raw != null) {
      if (!Number.isInteger(raw) || raw < 1 || raw > 168) {
        return "Startzeitraum für Kursleitungs-Mails muss eine ganze Zahl zwischen 1 und 168 Stunden sein.";
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "instructorTermNotifyUntilMinutesBeforeStart")) {
    const raw = patch.instructorTermNotifyUntilMinutesBeforeStart;
    if (raw != null) {
      if (!Number.isInteger(raw) || raw < 0 || raw > 24 * 60 || raw % 15 !== 0) {
        return "Bis-Zeitraum für Kursleitungs-Mails muss eine ganze Zahl zwischen 0 und 1440 in 15-Minuten-Schritten sein.";
      }
    }
  }
  const fromHours =
    patch.instructorTermNotifyFromHoursBeforeStart !== undefined
      ? patch.instructorTermNotifyFromHoursBeforeStart
      : undefined;
  const untilMinutes =
    patch.instructorTermNotifyUntilMinutesBeforeStart !== undefined
      ? patch.instructorTermNotifyUntilMinutesBeforeStart
      : undefined;
  if (
    typeof fromHours === "number" &&
    typeof untilMinutes === "number" &&
    fromHours * 60 <= untilMinutes
  ) {
    return "Startzeitraum muss vor dem Bis-Zeitraum liegen (Stunden-Fenster größer als Minuten-Grenze).";
  }
  return null;
}
