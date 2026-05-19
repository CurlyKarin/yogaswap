/**
 * Lazy reconcile for course reads (#149): align persisted status/dates with derived schedule.
 * Auto-inactive when no upcoming occurrence (date + time), aligned with app getCourseDates.
 */

import { hasUpcomingCourseOccurrences } from "./courseDates";

export function resolveEffectiveCourseStatus(
  storedStatus: string,
  planningMode: string | undefined,
  visibleDates: string[],
  courseTime: string,
  now: Date = new Date(),
): string {
  const status = storedStatus || "active";
  const hasUpcoming = hasUpcomingCourseOccurrences(visibleDates, courseTime, now);
  if (
    status === "active" &&
    (planningMode ?? "bounded_series") === "bounded_series" &&
    !hasUpcoming
  ) {
    return "inactive";
  }
  return status;
}

export function sortedDateList(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function dateListsEqual(a: string[], b: string[]): boolean {
  const left = sortedDateList(a);
  const right = sortedDateList(b);
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}

export type CourseReconcileOutcome = {
  effectiveStatus: string;
  visibleDates: string[];
  shouldPersist: boolean;
  statusChanged: boolean;
  datesChanged: boolean;
};

export function computeCourseReconcile(input: {
  storedStatus: string;
  planningMode?: string;
  visibleDates: string[];
  storedDates: string[];
  courseTime: string;
  now?: Date;
}): CourseReconcileOutcome {
  const now = input.now ?? new Date();
  const effectiveStatus = resolveEffectiveCourseStatus(
    input.storedStatus,
    input.planningMode,
    input.visibleDates,
    input.courseTime,
    now,
  );
  const statusChanged = effectiveStatus !== (input.storedStatus || "active");
  const datesChanged = !dateListsEqual(input.storedDates, input.visibleDates);
  return {
    effectiveStatus,
    visibleDates: input.visibleDates,
    shouldPersist: statusChanged || datesChanged,
    statusChanged,
    datesChanged,
  };
}
