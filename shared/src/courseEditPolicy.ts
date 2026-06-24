import type { CoursePlanningMode, CourseStatus } from "./types";

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const PLANNING_MODE_LOCKED_MESSAGE =
  "Der Planungsmodus kann bei einem aktiven Kurs mit Teilnehmern nicht geändert werden.";

export const ROLLING_INACTIVE_USE_PLANNED_END_MESSAGE =
  "Ein durchlaufender Kurs mit Teilnehmern kann nicht direkt auf inaktiv gesetzt werden. Bitte planen Sie ein Kursende.";

export const PLANNED_END_INVALID_MESSAGE =
  "Das Kursende muss nach der Planungssperre liegen (ISO-Datum YYYY-MM-DD).";

export const PLANNED_END_CONSEQUENCE_HINT =
  "Ab diesem Datum gibt es keine neuen Kurstermine mehr. Beim Speichern werden betroffene Tauschvorgänge bereinigt; Teilnehmer erhalten eine E-Mail (folgt).";

export function courseHasParticipants(participants?: string[]): boolean {
  return (participants?.length ?? 0) > 0;
}

export function isPlanningModeChangeLocked(params: {
  status?: CourseStatus;
  participants?: string[];
}): boolean {
  return (params.status ?? "active") === "active" && courseHasParticipants(params.participants);
}

export function isRollingInactiveBlocked(params: {
  status?: CourseStatus;
  planningMode?: CoursePlanningMode;
  participants?: string[];
}): boolean {
  return (
    (params.status ?? "active") === "active" &&
    courseHasParticipants(params.participants) &&
    (params.planningMode ?? "bounded_series") === "rolling_continuous"
  );
}

function toIsoDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(year, month - 1, day);
  next.setDate(next.getDate() + days);
  return toIsoDateOnlyLocal(next);
}

/** Erster Tag nach der Planungssperre (lokales Kalenderdatum). */
export function getMinPlannedEndDateIso(rollingPlanningHorizonWeeks: number, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lockEnd = new Date(startOfToday);
  lockEnd.setDate(lockEnd.getDate() + rollingPlanningHorizonWeeks * 7);
  return addCalendarDaysIso(toIsoDateOnlyLocal(lockEnd), 1);
}

export function isPlannedEndDateAllowed(
  iso: string,
  rollingPlanningHorizonWeeks: number,
  now: Date = new Date(),
): boolean {
  if (!ISO_DATE_ONLY.test(iso)) return false;
  return iso >= getMinPlannedEndDateIso(rollingPlanningHorizonWeeks, now);
}

export function formatPlannedEndLabel(plannedEndDate: string | null | undefined, locale?: string): string {
  if (!plannedEndDate?.trim()) return "Unbefristet";
  const parsed = new Date(`${plannedEndDate.trim()}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return plannedEndDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(parsed);
}
