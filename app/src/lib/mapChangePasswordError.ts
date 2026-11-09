const MIN_PASSWORD_LENGTH = 6;

export { MIN_PASSWORD_LENGTH };

/** Map Cognito / Amplify change-password errors to German UI copy (#434). */
export function mapChangePasswordError(err: unknown): string {
  const name =
    err && typeof err === "object" && "name" in err && typeof (err as { name: unknown }).name === "string"
      ? (err as { name: string }).name
      : "";
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lowered = `${name} ${msg}`.toLowerCase();

  if (
    lowered.includes("notauthorizedexception") ||
    lowered.includes("incorrect username or password") ||
    lowered.includes("incorrect password")
  ) {
    return "Aktuelles Passwort ist falsch.";
  }
  if (
    lowered.includes("invalidpasswordexception") ||
    lowered.includes("password did not conform") ||
    lowered.includes("password does not conform")
  ) {
    return `Neues Passwort erfüllt die Regeln nicht (mindestens ${MIN_PASSWORD_LENGTH} Zeichen).`;
  }
  if (
    lowered.includes("limitexceededexception") ||
    lowered.includes("toomanyrequestsexception") ||
    lowered.includes("attempt limit exceeded") ||
    lowered.includes("too many")
  ) {
    return "Zu viele Versuche. Bitte warte kurz und versuche es erneut.";
  }
  if (
    lowered.includes("usernotauthenticated") ||
    lowered.includes("userneedstobeauthenticated") ||
    lowered.includes("not authenticated") ||
    lowered.includes("no current user") ||
    lowered.includes("needs to be authenticated")
  ) {
    return "Keine aktive Anmeldung. Bitte erneut einloggen und dann das Passwort ändern.";
  }
  return "Passwort konnte nicht geändert werden. Bitte erneut versuchen.";
}
