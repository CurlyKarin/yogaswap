const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnlyUtc(value: string): Date | null {
  if (!ISO_DATE_ONLY.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnlyUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUtc(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Inclusive ISO date range lost when shrinking the participant planning horizon. */
export type HorizonShrinkStrip = {
  startInclusive: string;
  endInclusive: string;
};

export function computeHorizonShrinkStrip(
  currentWeeks: number,
  nextWeeks: number,
  now: Date = new Date(),
): HorizonShrinkStrip | null {
  if (!Number.isInteger(currentWeeks) || !Number.isInteger(nextWeeks)) return null;
  if (nextWeeks >= currentWeeks) return null;

  const todayUtc = startOfTodayUtc(now);
  const newEnd = addDaysUtc(todayUtc, nextWeeks * 7);
  const oldEnd = addDaysUtc(todayUtc, currentWeeks * 7);
  const firstLost = addDaysUtc(newEnd, 1);

  return {
    startInclusive: toDateOnlyUtc(firstLost),
    endInclusive: toDateOnlyUtc(oldEnd),
  };
}

export function isIsoDateInInclusiveRange(
  isoDate: string,
  startInclusive: string,
  endInclusive: string,
): boolean {
  if (!ISO_DATE_ONLY.test(isoDate)) return false;
  return isoDate >= startInclusive && isoDate <= endInclusive;
}

export type HorizonShrinkSwapRef = {
  fromCourseId: string;
  toCourseId: string;
  fromDate: string;
  toDate: string;
  status: string;
};

export function countSwapCommitmentsInHorizonStrip(
  swaps: HorizonShrinkSwapRef[],
  rollingCourseIds: ReadonlySet<string>,
  strip: HorizonShrinkStrip,
): number {
  return swaps.filter((swap) => {
    if (swap.status !== "pending" && swap.status !== "active") return false;
    const fromHit =
      rollingCourseIds.has(swap.fromCourseId) &&
      isIsoDateInInclusiveRange(swap.fromDate, strip.startInclusive, strip.endInclusive);
    const toHit =
      rollingCourseIds.has(swap.toCourseId) &&
      isIsoDateInInclusiveRange(swap.toDate, strip.startInclusive, strip.endInclusive);
    return fromHit || toHit;
  }).length;
}

export function overrideHasScheduleCommitment(
  participantsCount: number,
  swappedCount: number,
  waitlistCount: number,
): boolean {
  return participantsCount > 0 || swappedCount > 0 || waitlistCount > 0;
}

export type HorizonShrinkOverrideRef = {
  courseId: string;
  date: string;
  participantsCount: number;
  swappedCount: number;
  waitlistCount: number;
};

export function countOverrideCommitmentsInHorizonStrip(
  overrides: HorizonShrinkOverrideRef[],
  rollingCourseIds: ReadonlySet<string>,
  strip: HorizonShrinkStrip,
): number {
  return overrides.filter((entry) => {
    if (!rollingCourseIds.has(entry.courseId)) return false;
    if (
      !isIsoDateInInclusiveRange(entry.date, strip.startInclusive, strip.endInclusive)
    ) {
      return false;
    }
    return overrideHasScheduleCommitment(
      entry.participantsCount,
      entry.swappedCount,
      entry.waitlistCount,
    );
  }).length;
}

export type HorizonShrinkBlockerCounts = {
  strip: HorizonShrinkStrip;
  swapCount: number;
  overrideCount: number;
};

export function assessHorizonShrinkBlockers(input: {
  currentWeeks: number;
  nextWeeks: number;
  rollingCourseIds: ReadonlySet<string>;
  swaps: HorizonShrinkSwapRef[];
  overrides: HorizonShrinkOverrideRef[];
  now?: Date;
}): HorizonShrinkBlockerCounts | null {
  const strip = computeHorizonShrinkStrip(
    input.currentWeeks,
    input.nextWeeks,
    input.now,
  );
  if (!strip || input.rollingCourseIds.size === 0) return null;

  const swapCount = countSwapCommitmentsInHorizonStrip(
    input.swaps,
    input.rollingCourseIds,
    strip,
  );
  const overrideCount = countOverrideCommitmentsInHorizonStrip(
    input.overrides,
    input.rollingCourseIds,
    strip,
  );

  if (swapCount === 0 && overrideCount === 0) return null;
  return { strip, swapCount, overrideCount };
}

export function formatHorizonShrinkBlockedMessage(counts: HorizonShrinkBlockerCounts): string {
  const { strip, swapCount, overrideCount } = counts;
  const parts: string[] = [];
  if (swapCount > 0) {
    parts.push(
      swapCount === 1
        ? "1 offene Tauschanfrage"
        : `${swapCount} offene Tauschanfragen`,
    );
  }
  if (overrideCount > 0) {
    parts.push(
      overrideCount === 1
        ? "1 Termin mit gebuchtem oder offenem Tauschstatus"
        : `${overrideCount} Termine mit gebuchtem oder offenem Tauschstatus`,
    );
  }
  const detail = parts.join(" und ");
  return (
    `Das Planungsfenster kann derzeit nicht verkleinert werden: Zwischen ${strip.startInclusive} und ${strip.endInclusive} ` +
    `(nicht mehr im Teilnehmer-Sichtfenster) gibt es noch ${detail}. Bitte zuerst abschließen oder abbrechen.`
  );
}
