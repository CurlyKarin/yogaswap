import type { CourseDateOverride } from "@yogaswap/shared";
import {
  includesUserCaseInsensitive,
  resolveEffectiveTermParticipants,
} from "@yogaswap/shared";
import type { InstructorTermParticipationKind } from "../templates/course/termMailTemplates";

export type InstructorTermParticipationEvent = {
  memberNickname: string;
  kind: Extract<
    InstructorTermParticipationKind,
    "term_released" | "term_release_cleared" | "short_notice" | "short_notice_cleared"
  >;
};

/**
 * Diff Override before/after → Absage-/Rücknahme-Events für Kursleitungs-Mails (#398).
 * RC: Belegung raus (nicht SN). SN: neu in shortNoticeCancellations.
 * Rücknahme: RC wieder belegt bzw. SN-Eintrag entfernt.
 */
export function detectInstructorTermParticipationEvents(input: {
  before: CourseDateOverride | null;
  after: CourseDateOverride;
  stemParticipants: string[];
}): InstructorTermParticipationEvent[] {
  const { before, after, stemParticipants } = input;
  const beforeEffective = resolveEffectiveTermParticipants(
    { participants: stemParticipants },
    before,
  );
  const afterEffective = resolveEffectiveTermParticipants(
    { participants: stemParticipants },
    after,
  );

  const events: InstructorTermParticipationEvent[] = [];
  const seen = new Set<string>();

  for (const member of beforeEffective.participants) {
    const key = member.toLowerCase();
    if (seen.has(key)) continue;
    const stillThere = includesUserCaseInsensitive(afterEffective.participants, member);
    const isSn = includesUserCaseInsensitive(after.shortNoticeCancellations, member);
    if (!stillThere && !isSn) {
      seen.add(key);
      events.push({ memberNickname: member, kind: "term_released" });
    }
  }

  // RC-Rücknahme: stand unter cancelledParticipants, ist wieder belegt (kein Tausch-Neubeitritt).
  const beforeCancelled = beforeEffective.cancelledParticipants.length
    ? beforeEffective.cancelledParticipants
    : (before?.cancelledParticipants ?? []);
  for (const member of afterEffective.participants) {
    const key = member.toLowerCase();
    if (seen.has(key)) continue;
    const wasRc = includesUserCaseInsensitive(beforeCancelled, member);
    const stillRc = includesUserCaseInsensitive(afterEffective.cancelledParticipants, member);
    if (wasRc && !stillRc) {
      seen.add(key);
      events.push({ memberNickname: member, kind: "term_release_cleared" });
    }
  }

  for (const member of after.shortNoticeCancellations ?? []) {
    const key = member.toLowerCase();
    if (seen.has(key)) continue;
    if (includesUserCaseInsensitive(before?.shortNoticeCancellations, member)) continue;
    seen.add(key);
    events.push({ memberNickname: member, kind: "short_notice" });
  }

  for (const member of before?.shortNoticeCancellations ?? []) {
    const key = member.toLowerCase();
    if (seen.has(key)) continue;
    if (includesUserCaseInsensitive(after.shortNoticeCancellations, member)) continue;
    seen.add(key);
    events.push({ memberNickname: member, kind: "short_notice_cleared" });
  }

  return events;
}
