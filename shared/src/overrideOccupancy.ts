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

export type OverrideDeltaFields = {
  participants: string[];
  cancelledParticipants: string[];
  swapped: string[];
};

/**
 * Derive delta lists from a legacy full-roster override.participants snapshot.
 * RC = stem members missing from snapshot; additions = snapshot members not on stem.
 *
 * Important: pass the stem **as it was when the snapshot was written** (or the
 * pre-change stem). Using a newer, larger stem treats new members as RC.
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
 * Convert a legacy snapshot override into explicit delta fields.
 * Empty named roster (typical guest/waitlist stub) → no cancellations.
 * Already-delta overrides are normalized to `participants: []`.
 */
export function migrateLegacyOverrideToDeltas(
  previousStem: string[],
  override: Pick<CourseDateOverride, "participants" | "cancelledParticipants" | "swapped">,
): OverrideDeltaFields {
  if (Array.isArray(override.cancelledParticipants)) {
    return {
      participants: [],
      cancelledParticipants: uniqueCaseInsensitive(override.cancelledParticipants),
      swapped: uniqueCaseInsensitive(override.swapped ?? []),
    };
  }

  const snapshot = override.participants ?? [];
  const explicitSwapped = override.swapped ?? [];

  // Guest/waitlist-only stubs stored `participants: []` without meaning "everyone RC".
  if (snapshot.length === 0 && explicitSwapped.length === 0) {
    return {
      participants: [],
      cancelledParticipants: [],
      swapped: [],
    };
  }

  const legacy = deriveLegacyOverrideDeltas(previousStem, snapshot);
  return {
    participants: [],
    cancelledParticipants: uniqueCaseInsensitive(legacy.cancelledParticipants),
    swapped: uniqueCaseInsensitive(
      explicitSwapped.length > 0 ? explicitSwapped : legacy.swapped,
    ),
  };
}

/**
 * Effective named participants for a course term (Stamm ⊕ Override-Deltas).
 *
 * - RC (`cancelledParticipants`): removed from stem for this term
 * - `swapped`: term additions
 * - SN flags are orthogonal: SN users remain in the returned list
 * - Legacy: if `cancelledParticipants` is absent, derive from snapshot — except
 *   empty named stubs, which keep the stem (guest/waitlist-only overrides)
 */
export type ResolveEffectiveTermOptions = {
  /**
   * Stamm für diesen Termin. Fehlt der Wert, gilt `course.participants`
   * (Cache / Legacy, bis CourseEnrollments flächendeckend genutzt werden).
   */
  stemParticipants?: string[];
};

export function resolveEffectiveTermParticipants(
  course: Pick<Course, "participants">,
  override: Pick<
    CourseDateOverride,
    "participants" | "cancelledParticipants" | "swapped" | "shortNoticeCancellations"
  > | null | undefined,
  options?: ResolveEffectiveTermOptions,
): EffectiveTermParticipants {
  const stem = options?.stemParticipants ?? course.participants ?? [];
  if (!override) {
    return {
      participants: [...stem],
      cancelledParticipants: [],
      swapped: [],
      usedLegacySnapshot: false,
    };
  }

  const hasExplicitCancellations = Array.isArray(override.cancelledParticipants);

  if (!hasExplicitCancellations) {
    const snapshot = override.participants ?? [];
    const explicitSwapped = override.swapped ?? [];

    // Empty named roster without cancelledParticipants = stub, not full wipe.
    if (snapshot.length === 0 && explicitSwapped.length === 0) {
      return {
        participants: uniqueCaseInsensitive(stem),
        cancelledParticipants: [],
        swapped: [],
        usedLegacySnapshot: true,
      };
    }

    const legacy = deriveLegacyOverrideDeltas(stem, snapshot);
    const swapped =
      explicitSwapped.length > 0 ? explicitSwapped : legacy.swapped;
    return {
      participants: uniqueCaseInsensitive(snapshot),
      cancelledParticipants: uniqueCaseInsensitive(legacy.cancelledParticipants),
      swapped: uniqueCaseInsensitive(swapped),
      usedLegacySnapshot: true,
    };
  }

  const cancelledParticipants = override.cancelledParticipants ?? [];
  let swapped = override.swapped ?? [];
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
    usedLegacySnapshot: false,
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
