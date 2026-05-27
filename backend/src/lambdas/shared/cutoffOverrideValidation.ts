import type { CourseDateOverride, TenantSettings } from "@yogaswap/shared";
import {
  includesUserCaseInsensitive,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
} from "@yogaswap/shared";

export type OverrideUpdateBody = {
  participants?: string[];
  swapped?: string[];
  waitlist?: string[];
  shortNoticeCancellations?: string[];
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
    swapped: updates.swapped ?? base.swapped ?? [],
    waitlist: updates.waitlist ?? base.waitlist ?? [],
    shortNoticeCancellations:
      updates.shortNoticeCancellations ?? base.shortNoticeCancellations ?? [],
  };
}

export function validateShortNoticeParticipantsInvariant(override: CourseDateOverride): string | null {
  for (const user of override.shortNoticeCancellations ?? []) {
    if (!includesUserCaseInsensitive(override.participants, user)) {
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
  const wasParticipant =
    includesUserCaseInsensitive(before?.participants, actor) ||
    includesUserCaseInsensitive(baseParticipants, actor);
  const isParticipant = includesUserCaseInsensitive(after.participants, actor);
  const wasSn = includesUserCaseInsensitive(before?.shortNoticeCancellations, actor);
  const isSn = includesUserCaseInsensitive(after.shortNoticeCancellations, actor);

  const invariantError = validateShortNoticeParticipantsInvariant(after);
  if (invariantError) return invariantError;

  if (isSn && !isParticipant) {
    return "Kurzfristige Absage erfordert einen Eintrag in der Teilnehmerliste.";
  }

  // SN-Rücknahme ist immer erlaubt: Platz bleibt durch participants ohnehin belegt.

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
