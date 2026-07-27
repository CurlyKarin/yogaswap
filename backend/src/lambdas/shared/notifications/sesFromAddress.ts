/** Display name for SES From, aligned with Cognito (#106). */
export const SES_FROM_DISPLAY_NAME = "YogaSwap";

/**
 * Formats SES Source / MIME From as `YogaSwap <addr>`.
 * Leaves already-formatted `Name <addr>` values unchanged.
 */
export function formatSesFromAddress(
  source: string,
  displayName: string = SES_FROM_DISPLAY_NAME,
): string {
  const trimmed = source.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("<") && trimmed.includes(">")) return trimmed;
  return `${displayName} <${trimmed}>`;
}

/** Reads `SES_SOURCE_EMAIL` and applies the YogaSwap display name. */
export function resolveSesSourceEmail(fallback = "yogaswap@example.com"): string {
  return formatSesFromAddress(process.env.SES_SOURCE_EMAIL || fallback);
}
