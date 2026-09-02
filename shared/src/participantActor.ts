import type { Swap } from "./types";

/** Login-/Anzeige-Nickname plus optionale stabile Tenant-ID (#317). */
export type ParticipantActor = {
  nickname: string;
  participantId?: string;
};

/** Operational ref for Dynamo keys, swaps, and course occupancy (#317 hybrid: nickname). */
export function resolveActorParticipantRef(actor: ParticipantActor): string {
  return actor.nickname.trim() || actor.participantId?.trim() || "";
}

/** Match a stored course/swap/override ref against nickname or participantId. */
export function matchesParticipantRef(storedRef: string, actor: ParticipantActor): boolean {
  const normalized = storedRef.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === actor.nickname.trim().toLowerCase()) return true;
  const participantId = actor.participantId?.trim();
  if (participantId && normalized === participantId.toLowerCase()) return true;
  return false;
}

export function includesParticipantRef(refs: string[] | undefined, actor: ParticipantActor): boolean {
  return (refs ?? []).some((ref) => matchesParticipantRef(ref, actor));
}

/** Match any alias (nickname or participantId) against stored refs. */
export function listIncludesAnyUserRef(
  refs: string[] | undefined,
  aliases: string[],
): boolean {
  const wanted = new Set(
    aliases.map((alias) => alias.trim().toLowerCase()).filter(Boolean),
  );
  if (wanted.size === 0) return false;
  return (refs ?? []).some((ref) => wanted.has(ref.trim().toLowerCase()));
}

export function sameParticipantRef(
  left: string | undefined,
  right: string | undefined,
): boolean {
  if (!left || !right) return false;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function matchesSwapParticipant(
  swap: Pick<Swap, "participantId">,
  actor: ParticipantActor,
): boolean {
  const participantId = swap.participantId?.trim();
  if (!participantId) return false;
  return matchesParticipantRef(participantId, actor);
}
