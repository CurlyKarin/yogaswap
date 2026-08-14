import { buildCourseOccurrenceLocal, isOccurrenceInPast } from "./courseStatus";
import type { Course, CourseDateOverride, Swap, TenantSettings } from "./types";

export const DEFAULT_CANCELLATION_SWAP_CUTOFF_MINUTES = 60;
const MAX_CUTOFF_MINUTES = 24 * 60;

export function resolveCancellationSwapCutoffMinutes(settings?: TenantSettings): number {
  const value = settings?.cancellationSwapCutoffMinutesBeforeStart;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_CUTOFF_MINUTES) {
    return value;
  }
  return DEFAULT_CANCELLATION_SWAP_CUTOFF_MINUTES;
}

/** True when `now` is at or after (course start − cutoff minutes). */
export function isWithinCancellationSwapCutoff(
  isoDate: string,
  courseTime: string,
  cutoffMinutes: number,
  now: Date = new Date(),
): boolean {
  if (cutoffMinutes <= 0) return false;
  const start = buildCourseOccurrenceLocal(isoDate, courseTime);
  if (!start) return false;
  const cutoffStart = new Date(start.getTime() - cutoffMinutes * 60 * 1000);
  return now >= cutoffStart;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function sortedCourseDateIsos(dates: string[]): string[] {
  return [...dates].filter((entry) => ISO_DATE_ONLY.test(entry)).sort((a, b) => a.localeCompare(b));
}

/**
 * Term is closed for stem planning: already started/past, or inside the cutoff window.
 * Cutoff 0 still treats a started term as closed.
 */
export function isCourseTermClosedForPlanning(
  isoDate: string,
  courseTime: string,
  cutoffMinutes: number,
  now: Date = new Date(),
): boolean {
  const start = buildCourseOccurrenceLocal(isoDate, courseTime);
  if (!start) return true;
  if (now >= start) return true;
  return isWithinCancellationSwapCutoff(isoDate, courseTime, cutoffMinutes, now);
}

/** Next term that is still fully open (before cutoff and before start). */
export function findNextOpenCourseTermIso(
  dates: string[],
  courseTime: string,
  cutoffMinutes: number,
  now: Date = new Date(),
): string | undefined {
  for (const iso of sortedCourseDateIsos(dates)) {
    if (!isCourseTermClosedForPlanning(iso, courseTime, cutoffMinutes, now)) return iso;
  }
  return undefined;
}

/** Latest term that is past, running, or in cutoff. */
export function findLastClosedCourseTermIso(
  dates: string[],
  courseTime: string,
  cutoffMinutes: number,
  now: Date = new Date(),
): string | undefined {
  const closed = sortedCourseDateIsos(dates).filter((iso) =>
    isCourseTermClosedForPlanning(iso, courseTime, cutoffMinutes, now),
  );
  return closed[closed.length - 1];
}

export function includesUserCaseInsensitive(list: string[] | undefined, user: string): boolean {
  const needle = user.toLowerCase();
  return (list ?? []).some((entry) => entry.toLowerCase() === needle);
}

export function isShortNoticeCancelled(
  override: Pick<CourseDateOverride, "shortNoticeCancellations"> | undefined,
  userName: string,
): boolean {
  return includesUserCaseInsensitive(override?.shortNoticeCancellations, userName);
}

/** RC: rechtzeitig abgesagt (nicht in participants, nicht SN). */
export function isRegularCancellation(
  originallyParticipant: boolean,
  override: CourseDateOverride | undefined,
  participants: string[],
  userName: string,
): boolean {
  return (
    originallyParticipant &&
    !includesUserCaseInsensitive(participants, userName) &&
    !isShortNoticeCancelled(override, userName)
  );
}

/** Für UI/Buttons: kurzfristig SN oder klassische RC-Absage. */
export function hasEffectiveCancellation(
  originallyParticipant: boolean,
  override: CourseDateOverride | undefined,
  participants: string[],
  userName: string,
): boolean {
  return (
    isShortNoticeCancelled(override, userName) ||
    isRegularCancellation(originallyParticipant, override, participants, userName)
  );
}

/** Zieltermin im Kurzfrist-Fenster — keine neuen Tauschanfragen/Warteliste (vgl. processPromotions). */
export function isSwapTargetInCutoffWindow(
  isoDate: string,
  courseTime: string,
  tenantSettings?: TenantSettings,
  now: Date = new Date(),
): boolean {
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  return isWithinCancellationSwapCutoff(isoDate, courseTime, cutoffMinutes, now);
}

export function canCreateSwapFromOrigin(input: {
  isoDate: string;
  courseTime: string;
  tenantSettings?: TenantSettings;
  override?: CourseDateOverride;
  userName: string;
  participants: string[];
  originallyParticipant: boolean;
  now?: Date;
}): boolean {
  const { isoDate, courseTime, tenantSettings, override, userName, participants, originallyParticipant } =
    input;
  if (isShortNoticeCancelled(override, userName)) return false;
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  if (!isWithinCancellationSwapCutoff(isoDate, courseTime, cutoffMinutes, input.now)) return true;
  if (isRegularCancellation(originallyParticipant, override, participants, userName)) return true;
  return false;
}

export function addUserUniqueCaseInsensitive(list: string[], user: string): string[] {
  if (includesUserCaseInsensitive(list, user)) return list;
  return [...list, user];
}

export function removeUserCaseInsensitive(list: string[], user: string): string[] {
  const needle = user.toLowerCase();
  return list.filter((entry) => entry.toLowerCase() !== needle);
}

function resolveCourseTime(courses: Pick<Course, "id" | "time">[], courseId: number): string {
  return courses.find((course) => course.id === courseId)?.time ?? "";
}

/** Tausch nicht mehr abbrechen, wenn Ursprung und Ziel vergangen sind (#203). */
export function canCancelSwap(
  swap: Pick<Swap, "fromCourseId" | "fromDate" | "toCourseId" | "toDate">,
  courses: Pick<Course, "id" | "time">[],
  now: Date = new Date(),
): boolean {
  const originPast = isOccurrenceInPast(
    swap.fromDate,
    resolveCourseTime(courses, swap.fromCourseId),
    now,
  );
  const targetPast = isOccurrenceInPast(
    swap.toDate,
    resolveCourseTime(courses, swap.toCourseId),
    now,
  );
  return !(originPast && targetPast);
}
