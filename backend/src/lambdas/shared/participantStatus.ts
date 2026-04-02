import type { ParticipantProfile, ParticipantStatus } from "@yogaswap/shared";

/**
 * Zentrale Ableitung des ParticipantStatus fuer Backend-Lambdas.
 * (Logik baugleich zu shared `getParticipantStatus` — hier dupliziert, damit Jest kein ESM aus `shared/dist` laedt.)
 */
export function deriveParticipantStatus(
  profile: Pick<ParticipantProfile, "authUserId" | "inviteSentAt" | "inviteCompletedAt">,
): ParticipantStatus {
  const auth = profile.authUserId?.trim();
  const invitedFlag = profile.inviteSentAt?.trim();
  const done = profile.inviteCompletedAt?.trim();
  if (auth) {
    if (done) return "active";
    if (!invitedFlag) return "active";
    return "invited";
  }
  if (invitedFlag) return "invited";
  return "no_login";
}
