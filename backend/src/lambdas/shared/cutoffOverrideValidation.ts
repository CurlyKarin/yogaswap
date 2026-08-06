import type { CourseDateOverride, TenantSettings } from "@yogaswap/shared";
import {
  includesUserCaseInsensitive,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
  resolveEffectiveTermParticipants,
} from "@yogaswap/shared";

export type OverrideUpdateBody = {
  participants?: string[];
  cancelledParticipants?: string[];
  swapped?: string[];
  waitlist?: string[];
  shortNoticeCancellations?: string[];
  anonymousTrialCount?: number;
};

export function mergeOverrideUpdate(
  existing: CourseDateOverride | null,
  baseParticipants: string[],
  updates: OverrideUpdateBody,
): CourseDateOverride {
  const base: CourseDateOverride = existing ?? {
    courseId: 0,
    date: "",
    participants: baseParticipants,
    swapped: [],
    waitlist: [],
    shortNoticeCancellations: [],
  };
  return {
    ...base,
    participants: updates.participants ?? base.participants,
    ...(updates.cancelledParticipants !== undefined || base.cancelledParticipants !== undefined
      ? {
          cancelledParticipants:
            updates.cancelledParticipants ?? base.cancelledParticipants ?? [],
        }
      : {}),
    swapped: updates.swapped ?? base.swapped ?? [],
    waitlist: updates.waitlist ?? base.waitlist ?? [],
    shortNoticeCancellations:
      updates.shortNoticeCancellations ?? base.shortNoticeCancellations ?? [],
    ...(updates.anonymousTrialCount !== undefined
      ? { anonymousTrialCount: updates.anonymousTrialCount }
      : base.anonymousTrialCount !== undefined
        ? { anonymousTrialCount: base.anonymousTrialCount }
        : {}),
  };
}

export function validateShortNoticeParticipantsInvariant(
  override: CourseDateOverride,
  baseParticipants: string[] = [],
): string | null {
  const effective = resolveEffectiveTermParticipants(
    { participants: baseParticipants },
    override,
  );
  for (const user of override.shortNoticeCancellations ?? []) {
    if (!includesUserCaseInsensitive(effective.participants, user)) {
      return "Kurzfristig abgesagte Teilnehmer müssen in der Teilnehmerliste stehen.";
    }
  }
  return null;
}

/**
 * Self-service override updates: enforce SN/RC/cutoff rules for a single actor nickname.
 */
export function validateSelfServiceOverrideTransition(input: {
  actorNickname: string;
  courseTime: string;
  dateIso: string;
  tenantSettings?: TenantSettings;
  before: CourseDateOverride | null;
  after: CourseDateOverride;
  baseParticipants: string[];
  now?: Date;
}): string | null {
  const { actorNickname, courseTime, dateIso, tenantSettings, before, after, baseParticipants } = input;
  const now = input.now ?? new Date();
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  const inCutoff = isWithinCancellationSwapCutoff(dateIso, courseTime, cutoffMinutes, now);
  const actor = actorNickname;
  const beforeEffective = resolveEffectiveTermParticipants(
    { participants: baseParticipants },
    before,
  );
  const afterEffective = resolveEffectiveTermParticipants(
    { participants: baseParticipants },
    after,
  );
  const wasParticipant = includesUserCaseInsensitive(beforeEffective.participants, actor);
  const isParticipant = includesUserCaseInsensitive(afterEffective.participants, actor);
  const wasSn = includesUserCaseInsensitive(before?.shortNoticeCancellations, actor);
  const isSn = includesUserCaseInsensitive(after.shortNoticeCancellations, actor);

  const invariantError = validateShortNoticeParticipantsInvariant(after, baseParticipants);
  if (invariantError) return invariantError;

  if (isSn && !isParticipant) {
    return "Kurzfristige Absage erfordert einen Eintrag in der Teilnehmerliste.";
  }

  // SN-Rücknahme ist immer erlaubt: Platz bleibt durch participants ohnehin belegt.
  if (wasSn && !isSn && isParticipant) {
    return null;
  }

  // SN setzen im Cutoff: Teilnehmer bleibt in participants (Platz belegt).
  if (!wasSn && isSn && isParticipant && inCutoff) {
    return null;
  }

  if (!wasSn && isSn && !inCutoff) {
    return "Kurzfristige Absage ist nur kurz vor Kursbeginn möglich.";
  }

  if (!wasSn && isSn && inCutoff && !isParticipant) {
    return "Kurzfristige Absage erfordert einen Eintrag in der Teilnehmerliste.";
  }

  if (wasParticipant && !isParticipant && !isSn && inCutoff) {
    return "In diesem Zeitfenster nur kurzfristige Absage möglich (Platz bleibt belegt).";
  }

  if (wasParticipant && !isParticipant && !isSn && !inCutoff) {
    return null;
  }

  if (!wasParticipant && isParticipant && !wasSn && inCutoff) {
    return "Absage kann in diesem Zeitfenster nicht zurückgenommen werden.";
  }

  if (!wasParticipant && isParticipant && !wasSn && !inCutoff) {
    return null;
  }

  const actorUnchanged = wasParticipant === isParticipant && wasSn === isSn;
  if (actorUnchanged) return null;

  return "Diese Änderung ist im aktuellen Zeitfenster nicht erlaubt.";
}
