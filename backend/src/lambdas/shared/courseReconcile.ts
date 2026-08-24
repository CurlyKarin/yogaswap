/**
 * Lazy reconcile for course reads (#149): align persisted status/dates with derived schedule.
 * Auto-inactive when UTC calendar day is past the access deadline (#204 / #296).
 */

import { shouldAutoDeactivateCourse, type TenantSettings } from "@yogaswap/shared";
import type { Course } from "@yogaswap/shared";

export type CourseReconcileScheduleContext = {
  planningMode?: string;
  seriesEndDate?: string;
  visibleUntil?: string;
  plannedEndDate?: string;
};

export function resolveEffectiveCourseStatus(
  storedStatus: string,
  schedule: CourseReconcileScheduleContext,
  visibleDates: string[],
  courseTime: string,
  settings?: Pick<TenantSettings, "inactiveGraceDaysAfterCourseEnd">,
  now: Date = new Date(),
): string {
  const status = storedStatus || "active";
  if (status !== "active") return status;

  const course: Pick<
    Course,
    "status" | "planningMode" | "seriesEndDate" | "visibleUntil" | "plannedEndDate" | "dates" | "time"
  > = {
    status: "active",
    planningMode: (schedule.planningMode ?? "bounded_series") as Course["planningMode"],
    seriesEndDate: schedule.seriesEndDate,
    visibleUntil: schedule.visibleUntil,
    plannedEndDate: schedule.plannedEndDate,
    dates: visibleDates,
    time: courseTime,
  };

  if (shouldAutoDeactivateCourse(course, settings as TenantSettings | undefined, now)) {
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
  seriesEndDate?: string;
  visibleUntil?: string;
  plannedEndDate?: string;
  visibleDates: string[];
  storedDates: string[];
  courseTime: string;
  inactiveGraceDaysAfterCourseEnd?: number;
  now?: Date;
}): CourseReconcileOutcome {
  const now = input.now ?? new Date();
  const settings =
    input.inactiveGraceDaysAfterCourseEnd != null
      ? { inactiveGraceDaysAfterCourseEnd: input.inactiveGraceDaysAfterCourseEnd }
      : undefined;
  const effectiveStatus = resolveEffectiveCourseStatus(
    input.storedStatus,
    {
      planningMode: input.planningMode,
      seriesEndDate: input.seriesEndDate,
      visibleUntil: input.visibleUntil,
      plannedEndDate: input.plannedEndDate,
    },
    input.visibleDates,
    input.courseTime,
    settings,
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
