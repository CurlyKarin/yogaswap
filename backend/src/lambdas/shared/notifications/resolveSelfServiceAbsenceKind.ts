import type { CourseDateOverride, TenantSettings } from "@yogaswap/shared";
import {
  includesUserCaseInsensitive,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
  resolveEffectiveTermParticipants,
} from "@yogaswap/shared";

export function resolveSelfServiceAbsenceKind(input: {
  actorNickname: string;
  courseTime: string;
  dateIso: string;
  tenantSettings?: TenantSettings;
  before: CourseDateOverride | null;
  after: CourseDateOverride;
  baseParticipants: string[];
  now?: Date;
}): "term_released" | null {
  const { actorNickname, courseTime, dateIso, tenantSettings, before, after, baseParticipants } = input;
  const now = input.now ?? new Date();
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  const inCutoff = isWithinCancellationSwapCutoff(dateIso, courseTime, cutoffMinutes, now);

  const beforeEffective = resolveEffectiveTermParticipants(
    { participants: baseParticipants },
    before,
  );
  const afterEffective = resolveEffectiveTermParticipants(
    { participants: baseParticipants },
    after,
  );
  const wasParticipant = includesUserCaseInsensitive(beforeEffective.participants, actorNickname);
  const isParticipant = includesUserCaseInsensitive(afterEffective.participants, actorNickname);
  const isSn = includesUserCaseInsensitive(after.shortNoticeCancellations, actorNickname);

  if (wasParticipant && !isParticipant && !isSn && !inCutoff) {
    return "term_released";
  }
  return null;
}
