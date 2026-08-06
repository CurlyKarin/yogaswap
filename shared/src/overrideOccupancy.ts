import {
  includesUserCaseInsensitive,
  removeUserCaseInsensitive,
} from "./cancellationSwapCutoff";
import type { Course, CourseDateOverride } from "./types";

function uniqueCaseInsensitive(users: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const user of users) {
    const key = user.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(user);
  }
  return result;
}

export type EffectiveTermParticipants = {
  /** Named people occupying the term (stem ⊕ deltas). */
  participants: string[];
  /** Regular cancellations (RC) applied for this term. */
  cancelledParticipants: string[];
  /** Term additions (typically swap-ins). */
  swapped: string[];
  /** Whether legacy snapshot fields were used to derive deltas. */
  usedLegacySnapshot: boolean;
};

/**
 * Derive delta lists from a legacy full-roster override.participants snapshot.
 * RC = stem members missing from snapshot; additions = snapshot members not on stem.
 */
export function deriveLegacyOverrideDeltas(
  stemParticipants: string[],
  overrideParticipants: string[],
): { cancelledParticipants: string[]; swapped: string[] } {
  const cancelledParticipants = stemParticipants.filter(
    (user) => !includesUserCaseInsensitive(overrideParticipants, user),
  );
  const swapped = overrideParticipants.filter(
    (user) => !includesUserCaseInsensitive(stemParticipants, user),
  );
  return { cancelledParticipants, swapped };
}

/**
 * Effective named participants for a course term (Stamm ⊕ Override-Deltas).
 *
 * - RC (`cancelledParticipants`): removed from stem for this term
 * - `swapped`: term additions
 * - SN flags are orthogonal: SN users remain in the returned list
 * - Legacy: if `cancelledParticipants` is absent, derive deltas from snapshot `participants`
 */
export function resolveEffectiveTermParticipants(
  course: Pick<Course, "participants">,
  override: Pick<
    CourseDateOverride,
    "participants" | "cancelledParticipants" | "swapped" | "shortNoticeCancellations"
  > | null | undefined,
): EffectiveTermParticipants {
  const stem = course.participants ?? [];
  if (!override) {
    return {
      participants: [...stem],
      cancelledParticipants: [],
      swapped: [],
      usedLegacySnapshot: false,
    };
  }

  const hasExplicitCancellations = Array.isArray(override.cancelledParticipants);
  let cancelledParticipants = override.cancelledParticipants ?? [];
  let swapped = override.swapped ?? [];
  let usedLegacySnapshot = false;

  if (!hasExplicitCancellations) {
    const legacy = deriveLegacyOverrideDeltas(stem, override.participants ?? []);
    cancelledParticipants = legacy.cancelledParticipants;
    if ((override.swapped ?? []).length === 0 && legacy.swapped.length > 0) {
      swapped = legacy.swapped;
    }
    usedLegacySnapshot = true;
  }

  let effective = stem.filter(
    (user) => !includesUserCaseInsensitive(cancelledParticipants, user),
  );
  for (const user of swapped) {
    if (!includesUserCaseInsensitive(effective, user)) {
      effective = [...effective, user];
    }
  }

  return {
    participants: uniqueCaseInsensitive(effective),
    cancelledParticipants: uniqueCaseInsensitive(cancelledParticipants),
    swapped: uniqueCaseInsensitive(swapped),
    usedLegacySnapshot,
  };
}

/** Remove a stem member from the effective roster via regular cancellation (RC). */
export function withRegularCancellation(
  cancelledParticipants: string[] | undefined,
  userName: string,
): string[] {
  if (includesUserCaseInsensitive(cancelledParticipants, userName)) {
    return [...(cancelledParticipants ?? [])];
  }
  return [...(cancelledParticipants ?? []), userName];
}

/** Undo RC for a user. */
export function withoutRegularCancellation(
  cancelledParticipants: string[] | undefined,
  userName: string,
): string[] {
  return removeUserCaseInsensitive(cancelledParticipants ?? [], userName);
}
