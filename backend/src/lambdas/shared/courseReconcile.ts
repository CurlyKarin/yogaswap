/**
 * Lazy reconcile for course reads (#149): align persisted status/dates with derived schedule.
 * Same auto-inactive rule as createCourse/updateCourse (bounded_series, no future visible dates).
 */

export function resolveEffectiveCourseStatus(
  storedStatus: string,
  planningMode: string | undefined,
  visibleDates: string[],
  now: Date = new Date(),
): string {
  const todayIso = now.toISOString().slice(0, 10);
  const hasFutureVisibleDates = visibleDates.some((entry) => entry >= todayIso);
  const status = storedStatus || "active";
  if (
    status === "active" &&
    (planningMode ?? "bounded_series") === "bounded_series" &&
    !hasFutureVisibleDates
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
  now?: Date;
}): CourseReconcileOutcome {
  const now = input.now ?? new Date();
  const effectiveStatus = resolveEffectiveCourseStatus(
    input.storedStatus,
    input.planningMode,
    input.visibleDates,
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
