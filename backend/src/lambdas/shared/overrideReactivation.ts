type DynamoStringList = { L?: Array<{ S?: string }> } | undefined;

export function asOverrideStringList(value: DynamoStringList): string[] {
  return value?.L?.map((entry) => entry.S ?? "").filter((entry) => entry.length > 0) ?? [];
}

/** Leeres Override aus `cancelCourseDate` (participants/swapped/waitlist/guests alle leer). */
export function isCancelledTombstoneOverride(
  item: Record<string, DynamoStringList>,
): boolean {
  return (
    asOverrideStringList(item.participants).length === 0 &&
    asOverrideStringList(item.swapped).length === 0 &&
    asOverrideStringList(item.waitlist).length === 0 &&
    asOverrideStringList(item.guests).length === 0
  );
}

export function isScheduleExceptionPatchBody(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, "excludedDates") ||
    Object.prototype.hasOwnProperty.call(body, "includedDates") ||
    Object.prototype.hasOwnProperty.call(body, "seriesStartDate") ||
    Object.prototype.hasOwnProperty.call(body, "seriesEndDate") ||
    Object.prototype.hasOwnProperty.call(body, "visibleFrom") ||
    Object.prototype.hasOwnProperty.call(body, "visibleUntil") ||
    Object.prototype.hasOwnProperty.call(body, "plannedEndDate")
  );
}

export function isScheduleWindowPatchBody(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, "seriesStartDate") ||
    Object.prototype.hasOwnProperty.call(body, "seriesEndDate") ||
    Object.prototype.hasOwnProperty.call(body, "visibleFrom") ||
    Object.prototype.hasOwnProperty.call(body, "visibleUntil") ||
    Object.prototype.hasOwnProperty.call(body, "plannedEndDate")
  );
}

export function resolveReactivatedExcludedDates(
  currentExcludedDates: string[],
  nextExcludedDates: string[],
): string[] {
  const nextExcludedSet = new Set(nextExcludedDates);
  return currentExcludedDates.filter((entry) => !nextExcludedSet.has(entry));
}

export function resolveVisibleActiveDates(visibleDates: string[], excludedDates: string[]): string[] {
  const excludedSet = new Set(excludedDates);
  return visibleDates.filter((entry) => !excludedSet.has(entry));
}

export function collectOverrideKeysForReactivationCleanup(params: {
  courseId: string;
  reactivatedExcludedDates: string[];
  visibleActiveDatesForTombstoneScan: string[];
  overrideItems: Array<Record<string, DynamoStringList & { S?: string }>>;
}): string[] {
  const keys = new Set<string>();
  for (const date of params.reactivatedExcludedDates) {
    keys.add(`${params.courseId}_${date}`);
  }
  const tombstoneCandidateSet = new Set(params.visibleActiveDatesForTombstoneScan);
  for (const overrideItem of params.overrideItems) {
    const overrideDate = overrideItem.date?.S;
    if (!overrideDate || !tombstoneCandidateSet.has(overrideDate)) continue;
    if (!isCancelledTombstoneOverride(overrideItem)) continue;
    keys.add(`${params.courseId}_${overrideDate}`);
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}
