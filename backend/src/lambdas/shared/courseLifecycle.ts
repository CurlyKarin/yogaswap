import { hasUpcomingCourseOccurrences } from "./courseDates";

function isFutureOrTodayDateString(isoDate: string, now: Date): boolean {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date >= startOfToday;
}

function hasAnyListEntries(item: Record<string, { L?: Array<{ S?: string }> }>): boolean {
  const participantsCount = item.participants?.L?.length ?? 0;
  const swappedCount = item.swapped?.L?.length ?? 0;
  const waitlistCount = item.waitlist?.L?.length ?? 0;
  return participantsCount > 0 || swappedCount > 0 || waitlistCount > 0;
}

/** Override blocks deactivate/delete when it still has open swap/waitlist state (or participants while the course has members). */
export function overrideBlocksCourseLifecycle(
  item: Record<string, { S?: string; L?: Array<{ S?: string }> }>,
  now: Date,
  courseHasParticipants: boolean,
): boolean {
  const dateValue = item.date?.S;
  if (!dateValue || !isFutureOrTodayDateString(dateValue, now)) return false;
  if (!courseHasParticipants) {
    const swappedCount = item.swapped?.L?.length ?? 0;
    const waitlistCount = item.waitlist?.L?.length ?? 0;
    return swappedCount > 0 || waitlistCount > 0;
  }
  return hasAnyListEntries(item);
}

export function hasBlockingUpcomingCourseDates(
  dateIsos: string[],
  courseTime: string,
  now: Date,
  courseHasParticipants: boolean,
): boolean {
  if (!courseHasParticipants) return false;
  return hasUpcomingCourseOccurrences(dateIsos, courseTime, now);
}
