import type { ParticipantProfile, ParticipantStatus } from "@yogaswap/shared";

/**
 * Zentrale Ableitung des ParticipantStatus fuer Backend-Lambdas.
 * Wird von mehreren Endpunkten verwendet, damit die Statuslogik
 * nicht pro Lambda dupliziert wird.
 */
export function deriveParticipantStatus(
  profile: Pick<ParticipantProfile, "authUserId" | "inviteSentAt">,
): ParticipantStatus {
  if (profile.authUserId) return "active";
  if (profile.inviteSentAt) return "invited";
  return "no_login";
}
