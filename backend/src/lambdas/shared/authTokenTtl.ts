/** Password-reset / recovery app tokens (link that triggers Cognito code). Default 1h. */
export const DEFAULT_AUTH_TOKEN_TTL_SECONDS = 3600;

/** Invite-activation app tokens (first mail with /invite link). Default 7 days. */
export const DEFAULT_AUTH_INVITE_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AuthTokenPurpose =
  | "invite-activation"
  | "admin-password-reset"
  | "user-password-reset";

/**
 * Invite links should outlive a short Cognito verification code.
 * Reset/recovery links stay short-lived (code is issued when the link is opened).
 */
export function resolveAuthTokenTtlSeconds(purpose: AuthTokenPurpose): number {
  if (purpose === "invite-activation") {
    const raw = Number(process.env.AUTH_INVITE_TOKEN_TTL_SECONDS);
    if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    return DEFAULT_AUTH_INVITE_TOKEN_TTL_SECONDS;
  }
  const raw = Number(process.env.AUTH_TOKEN_TTL_SECONDS);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return DEFAULT_AUTH_TOKEN_TTL_SECONDS;
}
