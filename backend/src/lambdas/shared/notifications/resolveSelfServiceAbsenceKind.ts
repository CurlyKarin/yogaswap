import type { CourseDateOverride, TenantSettings } from "@yogaswap/shared";
import {
  includesUserCaseInsensitive,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
} from "@yogaswap/shared";
import type { SelfServiceAbsenceKind } from "./termAbsenceNotifications";

export function resolveSelfServiceAbsenceKind(input: {
  actorNickname: string;
  courseTime: string;
  dateIso: string;
  tenantSettings?: TenantSettings;
  before: CourseDateOverride | null;
  after: CourseDateOverride;
  baseParticipants: string[];
  now?: Date;
}): SelfServiceAbsenceKind | null {
  const { actorNickname, courseTime, dateIso, tenantSettings, before, after, baseParticipants } = input;
  const now = input.now ?? new Date();
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  const inCutoff = isWithinCancellationSwapCutoff(dateIso, courseTime, cutoffMinutes, now);

  const wasParticipant =
    includesUserCaseInsensitive(before?.participants, actorNickname) ||
    includesUserCaseInsensitive(baseParticipants, actorNickname);
  const isParticipant = includesUserCaseInsensitive(after.participants, actorNickname);
  const wasSn = includesUserCaseInsensitive(before?.shortNoticeCancellations, actorNickname);
  const isSn = includesUserCaseInsensitive(after.shortNoticeCancellations, actorNickname);

  if (wasParticipant && !isParticipant && !isSn && !inCutoff) {
    return "term_released";
  }
  if (!wasSn && isSn && isParticipant) {
    return "short_notice_cancelled";
  }
  return null;
}
