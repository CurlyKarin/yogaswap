export type CancelWarningCode =
  | "waitlist_cleanup_failed"
  | "participant_lookup_failed"
  | "participant_mail_failed"
  | "studio_report_failed";

const WARNING_MESSAGES: Record<string, Record<CancelWarningCode, string>> = {
  de: {
    waitlist_cleanup_failed:
      "Wartelisten konnten in einzelnen Zielterminen nicht vollstaendig bereinigt werden.",
    participant_lookup_failed:
      "Einzelne Teilnehmerprofile konnten fuer den Mailversand nicht geladen werden.",
    participant_mail_failed:
      "Einzelne Teilnehmermails konnten nicht versendet werden.",
    studio_report_failed:
      "Die Studio-Benachrichtigung konnte nicht versendet werden.",
  },
  en: {
    waitlist_cleanup_failed:
      "Waitlists could not be fully cleaned up for some target dates.",
    participant_lookup_failed:
      "Some participant profiles could not be loaded for mail delivery.",
    participant_mail_failed:
      "Some participant emails could not be sent.",
    studio_report_failed:
      "The studio notification could not be sent.",
  },
};

export function resolveWarningMessages(
  warningCodes: string[] | undefined,
  locale: string,
): string[] {
  if (!warningCodes || warningCodes.length === 0) return [];
  const normalizedLocale = locale.toLowerCase();
  const localeKey = normalizedLocale.startsWith("de")
    ? "de"
    : normalizedLocale.startsWith("en")
      ? "en"
      : "de";
  const localeMessages = WARNING_MESSAGES[localeKey] ?? WARNING_MESSAGES.de;
  const dedupedCodes = Array.from(new Set(warningCodes));
  return dedupedCodes
    .map((code) => localeMessages[code as CancelWarningCode])
    .filter((entry): entry is string => Boolean(entry));
}
