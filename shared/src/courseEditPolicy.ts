import type { CoursePlanningMode, CourseStatus } from "./types";

export const PLANNING_MODE_LOCKED_MESSAGE =
  "Der Planungsmodus kann bei einem aktiven Kurs mit Teilnehmern nicht geändert werden.";

export const ROLLING_INACTIVE_USE_PLANNED_END_MESSAGE =
  "Ein durchlaufender Kurs mit Teilnehmern kann nicht direkt auf inaktiv gesetzt werden. Bitte planen Sie ein Kursende.";

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
