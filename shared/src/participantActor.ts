import type { Swap } from "./types";

/** Login-/Anzeige-Nickname plus optionale stabile Tenant-ID (#317). */
export type ParticipantActor = {
  nickname: string;
  participantId?: string;
};

/** Canonical ref for Dynamo keys, swaps, and course occupancy after backfill. */
export function resolveActorParticipantRef(actor: ParticipantActor): string {
  return actor.participantId?.trim() || actor.nickname.trim();
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
