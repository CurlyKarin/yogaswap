import type { Course, CourseDateOverride, Swap, TenantSettings } from "@yogaswap/shared";
import {
  addUserUniqueCaseInsensitive,
  canCreateSwapFromOrigin,
  includesUserCaseInsensitive,
  isSwapTargetInCutoffWindow,
  removeUserCaseInsensitive,
  resolveEffectiveTermParticipants,
  resolveGuestCount,
  validateTermOccupancy,
  withRegularCancellation,
} from "@yogaswap/shared";
import type { RingCycle } from "./ringSwapGraph";

export type RingExecutionContext = {
  courses: Course[];
  overrides: CourseDateOverride[];
  pendingSwaps: Swap[];
  tenantSettings?: TenantSettings;
  now?: Date;
};

export type OverrideWrite = {
  override: CourseDateOverride;
  mode: "create" | "update";
};

export type RingCyclePlan = {
  cycle: RingCycle;
  swapActivations: Swap[];
  swapDeletions: Swap[];
  overrideWrites: OverrideWrite[];
};

export type RingCyclePlanResult =
  | { ok: true; plan: RingCyclePlan }
  | { ok: false; reason: string };

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function overrideKey(courseId: number, date: string): string {
  return `${courseId}_${date}`;
}

function sameSwap(a: Swap, b: Swap): boolean {
  return (
    normalized(a.participantId) === normalized(b.participantId) &&
    a.fromCourseId === b.fromCourseId &&
    a.fromDate === b.fromDate &&
    a.toCourseId === b.toCourseId &&
    a.toDate === b.toDate &&
    a.status === b.status
  );
}

function cloneOverride(override: CourseDateOverride): CourseDateOverride {
  return {
    ...override,
    participants: [...override.participants],
    cancelledParticipants: override.cancelledParticipants
      ? [...override.cancelledParticipants]
      : undefined,
    swapped: [...(override.swapped ?? [])],
    waitlist: [...(override.waitlist ?? [])],
    shortNoticeCancellations: override.shortNoticeCancellations
      ? [...override.shortNoticeCancellations]
      : undefined,
  };
}

/** Fresh delta override or migrate legacy snapshot into cancelled/swapped. */
function resolveOverrideState(
  courseId: number,
  date: string,
  overrides: CourseDateOverride[],
  courses: Course[],
): CourseDateOverride {
  const existing = overrides.find((o) => o.courseId === courseId && o.date === date);
  const course = courses.find((c) => c.id === courseId);

  if (existing) {
    const cloned = cloneOverride(existing);
    if (Array.isArray(cloned.cancelledParticipants)) {
      return cloned;
    }
    if (course) {
      const resolved = resolveEffectiveTermParticipants(course, cloned);
      return {
        ...cloned,
        participants: [],
        cancelledParticipants: resolved.cancelledParticipants,
        swapped: resolved.swapped,
      };
    }
    return {
      ...cloned,
      participants: [],
      cancelledParticipants: [],
    };
  }

  return {
    courseId,
    date,
    participants: [],
    cancelledParticipants: [],
    swapped: [],
    waitlist: [],
  };
}

function applyEdgeToState(
  state: Map<string, CourseDateOverride>,
  swap: Swap,
  courses: Course[],
  overrides: CourseDateOverride[],
  tenantSettings: TenantSettings | undefined,
  now: Date,
): RingCyclePlanResult | null {
  const participantId = swap.participantId?.trim();
  if (!participantId) {
    return { ok: false, reason: "Swap missing participantId" };
  }

  const originCourse = courses.find((c) => c.id === swap.fromCourseId);
  const targetCourse = courses.find((c) => c.id === swap.toCourseId);
  if (!originCourse) {
    return { ok: false, reason: `Origin course ${swap.fromCourseId} not found` };
  }
  if (!targetCourse) {
    return { ok: false, reason: `Target course ${swap.toCourseId} not found` };
  }

  const originKey = overrideKey(swap.fromCourseId, swap.fromDate);
  const targetKey = overrideKey(swap.toCourseId, swap.toDate);

  if (!state.has(originKey)) {
    state.set(originKey, resolveOverrideState(swap.fromCourseId, swap.fromDate, overrides, courses));
  }
  if (!state.has(targetKey)) {
    state.set(targetKey, resolveOverrideState(swap.toCourseId, swap.toDate, overrides, courses));
  }

  const originOverride = state.get(originKey)!;
  const targetOverride = state.get(targetKey)!;
  const originEffective = resolveEffectiveTermParticipants(originCourse, originOverride);
  const originallyParticipant = originCourse.participants.some(
    (p) => normalized(p) === normalized(participantId),
  );

  if (!includesUserCaseInsensitive(originEffective.participants, participantId)) {
    return { ok: false, reason: `${participantId} is not booked on origin ${originKey}` };
  }

  if (
    !canCreateSwapFromOrigin({
      isoDate: swap.fromDate,
      courseTime: originCourse.time,
      tenantSettings,
      override: originOverride,
      userName: participantId,
      participants: originEffective.participants,
      originallyParticipant,
      now,
    })
  ) {
    return { ok: false, reason: `Origin cutoff blocks swap for ${participantId}` };
  }

  if (isSwapTargetInCutoffWindow(swap.toDate, targetCourse.time, tenantSettings, now)) {
    return { ok: false, reason: `Target cutoff blocks swap for ${participantId}` };
  }

  const nextOriginCancelled = originallyParticipant
    ? withRegularCancellation(originOverride.cancelledParticipants, participantId)
    : [...(originOverride.cancelledParticipants ?? [])];
  const nextOrigin: CourseDateOverride = {
    ...originOverride,
    participants: [],
    cancelledParticipants: nextOriginCancelled,
    swapped: removeUserCaseInsensitive(originOverride.swapped ?? [], participantId),
    waitlist: removeUserCaseInsensitive(originOverride.waitlist ?? [], participantId),
  };
  const nextTarget: CourseDateOverride = {
    ...targetOverride,
    participants: [],
    cancelledParticipants: targetOverride.cancelledParticipants ?? [],
    swapped: addUserUniqueCaseInsensitive(targetOverride.swapped ?? [], participantId),
    waitlist: removeUserCaseInsensitive(targetOverride.waitlist ?? [], participantId),
  };

  const nextOriginEffective = resolveEffectiveTermParticipants(originCourse, nextOrigin);
  if (includesUserCaseInsensitive(nextOriginEffective.participants, participantId)) {
    return { ok: false, reason: `${participantId} would remain on origin ${originKey}` };
  }

  state.set(originKey, nextOrigin);
  state.set(targetKey, nextTarget);
  return null;
}

/**
 * Plans atomic ring-cycle execution (#221). Pure read/plan phase.
 */
export function planRingCycleExecution(
  cycle: RingCycle,
  ctx: RingExecutionContext,
): RingCyclePlanResult {
  const now = ctx.now ?? new Date();
  const state = new Map<string, CourseDateOverride>();

  for (const edge of cycle.edges) {
    const swap = edge.swap;
    if (swap.status !== "pending") {
      return { ok: false, reason: `Swap for ${swap.participantId} is not pending` };
    }
    if (!ctx.pendingSwaps.some((pending) => sameSwap(pending, swap))) {
      return { ok: false, reason: `Swap for ${swap.participantId} is stale` };
    }

    const failure = applyEdgeToState(
      state,
      swap,
      ctx.courses,
      ctx.overrides,
      ctx.tenantSettings,
      now,
    );
    if (failure) return failure;
  }

  for (const [key, override] of state.entries()) {
    const course = ctx.courses.find((c) => c.id === override.courseId);
    if (!course) {
      return { ok: false, reason: `Course ${override.courseId} missing for override ${key}` };
    }
    const beforeOverride = resolveOverrideState(
      override.courseId,
      override.date,
      ctx.overrides,
      ctx.courses,
    );
    const beforeCount = resolveEffectiveTermParticipants(course, beforeOverride).participants.length;
    const afterCount = resolveEffectiveTermParticipants(course, override).participants.length;
    const guestCount = resolveGuestCount(override.anonymousTrialCount);
    if (afterCount > beforeCount) {
      const capacityError = validateTermOccupancy(afterCount, course, guestCount);
      if (capacityError) {
        return { ok: false, reason: `${capacityError} (${key})` };
      }
    }
  }

  const swapDeletions: Swap[] = [];
  const seenDeletion = new Set<string>();

  for (const edge of cycle.edges) {
    const { swap } = edge;
    for (const pending of ctx.pendingSwaps) {
      if (pending.status !== "pending") continue;
      if (
        normalized(pending.participantId) === normalized(swap.participantId) &&
        pending.fromCourseId === swap.fromCourseId &&
        pending.fromDate === swap.fromDate &&
        (pending.toCourseId !== swap.toCourseId || pending.toDate !== swap.toDate)
      ) {
        const deletionKey = `${pending.participantId}|${pending.fromCourseId}|${pending.fromDate}|${pending.toCourseId}|${pending.toDate}`;
        if (!seenDeletion.has(deletionKey)) {
          seenDeletion.add(deletionKey);
          swapDeletions.push(pending);
        }
      }
    }
  }

  for (const deleted of swapDeletions) {
    const targetKey = overrideKey(deleted.toCourseId, deleted.toDate);
    if (!state.has(targetKey)) {
      state.set(
        targetKey,
        resolveOverrideState(deleted.toCourseId, deleted.toDate, ctx.overrides, ctx.courses),
      );
    }
    const target = state.get(targetKey)!;
    const nextWaitlist = removeUserCaseInsensitive(target.waitlist ?? [], deleted.participantId ?? "");
    state.set(targetKey, { ...target, waitlist: nextWaitlist });
  }

  const originalByKey = new Map(
    ctx.overrides.map((override) => [overrideKey(override.courseId, override.date), override]),
  );
  const overrideWrites: OverrideWrite[] = [];

  for (const [key, next] of state.entries()) {
    const original = originalByKey.get(key);
    const changed =
      !original ||
      JSON.stringify({
        participants: original.participants,
        cancelledParticipants: original.cancelledParticipants ?? null,
        swapped: original.swapped ?? [],
        waitlist: original.waitlist ?? [],
      }) !==
        JSON.stringify({
          participants: next.participants,
          cancelledParticipants: next.cancelledParticipants ?? null,
          swapped: next.swapped ?? [],
          waitlist: next.waitlist ?? [],
        });

    if (!changed) continue;
    overrideWrites.push({
      override: next,
      mode: original ? "update" : "create",
    });
  }

  return {
    ok: true,
    plan: {
      cycle,
      swapActivations: cycle.edges.map((edge) => edge.swap),
      swapDeletions,
      overrideWrites,
    },
  };
}

export function buildSwapDynamoKeys(swap: Swap): { swapId: string; user_swapId: string } {
  const participantId = swap.participantId?.trim();
  if (!participantId) {
    throw new Error("swap.participantId is required");
  }
  const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
  const user_swapId = `${participantId}#${swapId}`;
  return { swapId, user_swapId };
}
