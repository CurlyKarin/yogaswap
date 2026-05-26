import { buildCourseOccurrenceLocal } from "./courseStatus";
import type { CourseDateOverride, TenantSettings } from "./types";

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
