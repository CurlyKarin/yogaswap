import { resolveParticipantDisplayLabel } from "@yogaswap/shared";

/** Kurs-/Tausch-Mails (#327): Anrede mit displayName, sonst Login-Nickname. */
export function resolveOperationalMailGreeting(input: {
  nickname: string;
  displayName?: string | null;
}): string {
  return (
    resolveParticipantDisplayLabel({
      displayName: input.displayName,
      userId: input.nickname,
    }) || input.nickname
  );
}
