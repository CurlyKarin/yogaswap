/**
 * Technische Kopie von `shared/src/tenantSettings.ts` (validateStudioSettingsPatch).
 * Grund: Value-Import aus `@yogaswap/shared` fuehrt im Backend-Build/Testsetup
 * zu rootDir-/ESM-Problemen. Bei Aenderungen auch shared anpassen.
 */
export type StudioSettingsPatch = {
  name?: string;
  inactiveGraceDaysAfterCourseEnd?: number;
  minOffsetDays?: number;
  maxOffsetDays?: number;
  rollingPlanningHorizonWeeks?: number;
  cancellationSwapCutoffMinutesBeforeStart?: number;
  contactEmail?: string | null;
  contactName?: string | null;
  notifyInstructorsOnStemChange?: boolean;
  notifyInstructorsOnTermParticipationChange?: boolean;
  instructorTermNotifyFromHoursBeforeStart?: number | null;
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
