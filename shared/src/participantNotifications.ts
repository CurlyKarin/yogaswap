/**
 * Persönliche E-Mail-Opt-outs (#437).
 * Security-/Zugangs-Mails bleiben immer an (#93).
 * Default: an (undefined / fehlend = senden).
 */

export type ParticipantEmailNotificationCategory =
  | "studioCourse"
  | "ownTermChange"
  | "waitlistPromotion";

export type ParticipantNotificationSettings = {
  /**
   * Mitteilungen vom Studio / Kursstamm:
   * Studio-Absagen, Beitritt/Austritt, Kurs aktiv, geplantes Ende, …
   */
  studioCourseEmail?: boolean;
  /**
   * Eigene Terminänderungen:
   * Tausch bestätigt, Termin freigegeben, Absage zurückgenommen.
   */
  ownTermChangeEmail?: boolean;
  /**
   * Nachrücken (unabhängig von ownTermChangeEmail):
   * Warteliste und Ringtausch.
   */
  waitlistPromotionEmail?: boolean;
};

const CATEGORY_TO_KEY: Record<
  ParticipantEmailNotificationCategory,
  keyof ParticipantNotificationSettings
> = {
  studioCourse: "studioCourseEmail",
  ownTermChange: "ownTermChangeEmail",
  waitlistPromotion: "waitlistPromotionEmail",
};

/** true = Mail senden; fehlende Pref = an. */
export function isParticipantEmailNotificationEnabled(
  notifications: ParticipantNotificationSettings | undefined | null,
  category: ParticipantEmailNotificationCategory,
): boolean {
  const key = CATEGORY_TO_KEY[category];
  return notifications?.[key] !== false;
}

export type ResolvedParticipantNotificationPrefs = {
  studioCourseEmail: boolean;
  ownTermChangeEmail: boolean;
  waitlistPromotionEmail: boolean;
};

/** UI-Defaults: alle an. */
export function resolveParticipantNotificationPrefs(
  notifications: ParticipantNotificationSettings | undefined | null,
): ResolvedParticipantNotificationPrefs {
  return {
    studioCourseEmail: isParticipantEmailNotificationEnabled(notifications, "studioCourse"),
    ownTermChangeEmail: isParticipantEmailNotificationEnabled(notifications, "ownTermChange"),
    waitlistPromotionEmail: isParticipantEmailNotificationEnabled(
      notifications,
      "waitlistPromotion",
    ),
  };
}
