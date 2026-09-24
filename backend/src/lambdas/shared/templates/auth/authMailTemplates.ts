export type AuthMailLocale = "de";

const DEFAULT_STUDIO_LABEL = "YogaSwap";
const PLATFORM_BLURB =
  "YogaSwap ist eine Plattform zum Tauschen von Yogakurs-Terminen.";

/** Anzeigename für Auth-Mails; Fallback „YogaSwap“, wenn Name fehlt (#268). */
export function resolveStudioDisplayName(studioName?: string | null): string {
  const trimmed = studioName?.trim();
  return trimmed || DEFAULT_STUDIO_LABEL;
}

/**
 * Anrede in Auth-Mails (#327): displayName wenn gesetzt, sonst Login-Nickname.
 */
export function resolveAuthMailGreetingName(input: {
  nickname: string;
  displayName?: string | null;
}): string {
  const displayName = input.displayName?.trim();
  if (displayName) return displayName;
  return (input.nickname || "").trim();
}

function loginNameLineHtml(nickname: string): string {
  return `Dein Login-Name lautet <strong>${nickname}</strong>.`;
}

function loginNameLineText(nickname: string): string {
  return `Dein Login-Name lautet "${nickname}".`;
}

function loginNameStillHtml(nickname: string): string {
  return `Dein Login-Name ist weiterhin <strong>${nickname}</strong>.`;
}

function loginNameStillText(nickname: string): string {
  return `Dein Login-Name ist weiterhin "${nickname}".`;
}

function hasNamedStudio(studio: string): boolean {
  return studio !== DEFAULT_STUDIO_LABEL;
}

function forStudioAccessHtml(studio: string): string {
  if (hasNamedStudio(studio)) {
    return `fuer Deinen Zugang bei <strong>${studio}</strong>`;
  }
  return "fuer Deinen Zugang";
}

function forStudioAccessText(studio: string): string {
  if (hasNamedStudio(studio)) {
    return `fuer Deinen Zugang bei "${studio}"`;
  }
  return "fuer Deinen Zugang";
}

type StudioMailFields = {
  locale?: string;
  studioName?: string | null;
  /** Studio-/App-URL nur im Plain-Text-Footer (kein zweiter HTML-Link → bessere Zustellbarkeit). */
  studioUrl?: string | null;
};

export type MailTemplate = {
  subject: string;
  html: string;
  text: string;
};

/** SES Message-Body mit Text+HTML (multipart) für bessere Zustellbarkeit. */
export function toSesAuthMessage(mail: MailTemplate) {
  return {
    Subject: { Data: mail.subject, Charset: "UTF-8" as const },
    Body: {
      Text: { Data: mail.text, Charset: "UTF-8" as const },
      Html: { Data: mail.html, Charset: "UTF-8" as const },
    },
  };
}

function normalizeLocale(locale?: string): AuthMailLocale {
  const raw = (locale || "de").trim().toLowerCase();
  if (raw.startsWith("de")) return "de";
  return "de";
}

/** HTML-Footer: ohne zusaetzliche Links (Spam-Filter). */
export function buildAuthMailFooterHtml(studioName?: string | null): string {
  const studio = resolveStudioDisplayName(studioName);
  const lines = [PLATFORM_BLURB];
  if (hasNamedStudio(studio)) {
    lines.push(`Studio: <strong>${studio}</strong>`);
  }
  return (
    `<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px;" />` +
    `<p style="font-size:12px;line-height:1.5;color:#666;">${lines.join("<br/>")}</p>`
  );
}

/** Plain-Text-Footer; Studio-URL optional als reiner Text (kein zweites HTML-Anchor). */
export function buildAuthMailFooterText(
  studioName?: string | null,
  studioUrl?: string | null,
): string {
  const studio = resolveStudioDisplayName(studioName);
  const lines = [PLATFORM_BLURB];
  if (hasNamedStudio(studio)) {
    lines.push(`Studio: ${studio}`);
  }
  const url = studioUrl?.trim();
  if (url) {
    lines.push(url);
  }
  return lines.join("\n");
}

/** @deprecated Use buildAuthMailFooterHtml — kept for existing imports/tests. */
export function buildAuthMailFooter(
  studioName?: string | null,
  _studioUrl?: string | null,
): string {
  return buildAuthMailFooterHtml(studioName);
}

function composeMail(params: {
  subject: string;
  htmlBody: string;
  textBody: string;
  studioName?: string | null;
  studioUrl?: string | null;
}): MailTemplate {
  return {
    subject: params.subject,
    html: `${params.htmlBody.trim()}\n${buildAuthMailFooterHtml(params.studioName)}`,
    text: `${params.textBody.trim()}\n\n--\n${buildAuthMailFooterText(params.studioName, params.studioUrl)}`,
  };
}

type InviteMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  link: string;
};

type RecoveryMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  link: string;
};

type ReactivationMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  loginUrl: string;
};

type InvitePreparationMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
};

type StudioAccessRemovedMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  /**
   * True when the person never finished registration (invite withdrawn).
   * Wording differs from studio-exit for an already registered account.
   */
  inviteWithdrawn?: boolean;
};

export type AccountPurgeScope = "studio_only" | "full_account";

type AccountPurgedMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  /** #271: how far permanent delete went. */
  purgeScope: AccountPurgeScope;
};

type EmailChangedNewAddressMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  loginUrl: string;
  newEmail: string;
  /** When set (#350), include mandatory password-reset CTA in the same mail. */
  passwordResetLink?: string;
};

type EmailChangedOldAddressMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  loginUrl: string;
  newEmail: string;
};

type RoleChangedMailInput = StudioMailFields & {
  nickname: string;
  displayName?: string | null;
  loginUrl: string;
  oldRole: string;
  newRole: string;
};

type DisplayNameChangedMailInput = StudioMailFields & {
  nickname: string;
  /** Greeting: previous visible name before the change. */
  displayName?: string | null;
  loginUrl: string;
  oldDisplayName: string;
  newDisplayName: string;
};

export function buildInviteMail(input: InviteMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: Einladung`, html: "", text: "" };
  }

  const inviteHtml = hasNamedStudio(studio)
    ? `<strong>${studio}</strong> hat dich zu YogaSwap eingeladen, einer Plattform zum Tauschen von Yogakurs-Terminen.`
    : `Du wurdest zu YogaSwap eingeladen, einer Plattform zum Tauschen von Yogakurs-Terminen.`;
  const inviteText = hasNamedStudio(studio)
    ? `"${studio}" hat dich zu YogaSwap eingeladen, einer Plattform zum Tauschen von Yogakurs-Terminen.`
    : `Du wurdest zu YogaSwap eingeladen, einer Plattform zum Tauschen von Yogakurs-Terminen.`;

  return composeMail({
    subject: `${studio}: Einladung`,
    studioName: studio,
    studioUrl: input.studioUrl,
    htmlBody: `
        <h2>Willkommen ${greeting}!</h2>
        <p>${inviteHtml}</p>
        <p>${loginNameLineHtml(input.nickname)}</p>
        <p><a href="${input.link}">Passwort fuer YogaSwap festlegen</a></p>
        <p>Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.</p>
        <p>Falls Du diese Einladung nicht erwartet hast, kannst Du die E-Mail ignorieren oder Dein Studio kontaktieren.</p>
      `,
    textBody: [
      `Willkommen ${greeting}!`,
      "",
      inviteText,
      loginNameLineText(input.nickname),
      "",
      `Passwort festlegen: ${input.link}`,
      "",
      "Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.",
      "Falls Du diese Einladung nicht erwartet hast, kannst Du die E-Mail ignorieren oder Dein Studio kontaktieren.",
    ].join("\n"),
  });
}

export function buildRecoveryMail(input: RecoveryMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: Passwort zuruecksetzen`, html: "", text: "" };
  }

  return composeMail({
    subject: `${studio}: Passwort zuruecksetzen`,
    studioName: studio,
    studioUrl: input.studioUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} das Passwort zurueckgesetzt
        (durch Dich selbst oder durch Dein Studio).</p>
        <p>${loginNameStillHtml(input.nickname)}</p>
        <p><a href="${input.link}">Neues Passwort fuer YogaSwap festlegen</a></p>
        <p>Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.</p>
        <p>Falls Du das nicht angefordert hast, kontaktiere bitte Dein Studio.</p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} das Passwort zurueckgesetzt (durch Dich selbst oder durch Dein Studio).`,
      loginNameStillText(input.nickname),
      "",
      `Neues Passwort festlegen: ${input.link}`,
      "",
      "Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.",
      "Falls Du das nicht angefordert hast, kontaktiere bitte Dein Studio.",
    ].join("\n"),
  });
}

export function buildReactivationMail(input: ReactivationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: Zugang freigeschaltet`, html: "", text: "" };
  }

  const accessHtml = hasNamedStudio(studio)
    ? `Auf YogaSwap wurde Dein Zugang fuer <strong>${studio}</strong> freigeschaltet.`
    : "Auf YogaSwap wurde Dein Zugang freigeschaltet.";
  const accessText = hasNamedStudio(studio)
    ? `Auf YogaSwap wurde Dein Zugang fuer "${studio}" freigeschaltet.`
    : "Auf YogaSwap wurde Dein Zugang freigeschaltet.";

  return composeMail({
    subject: `${studio}: Zugang freigeschaltet`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>${accessHtml}</p>
        <p>${loginNameLineHtml(input.nickname)}</p>
        <p>Du kannst Dich mit Deinem bestehenden Passwort anmelden.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      accessText,
      loginNameLineText(input.nickname),
      "",
      "Du kannst Dich mit Deinem bestehenden Passwort anmelden.",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

export function buildInvitePreparationMail(input: InvitePreparationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: Einladung`, html: "", text: "" };
  }

  const prepHtml = hasNamedStudio(studio)
    ? `Dein Zugang fuer <strong>${studio}</strong> auf YogaSwap wird vorbereitet.`
    : "Dein Zugang auf YogaSwap wird vorbereitet.";
  const prepText = hasNamedStudio(studio)
    ? `Dein Zugang fuer "${studio}" auf YogaSwap wird vorbereitet.`
    : "Dein Zugang auf YogaSwap wird vorbereitet.";

  return composeMail({
    subject: `${studio}: Einladung`,
    studioName: studio,
    studioUrl: input.studioUrl,
    htmlBody: `
        <h2>Willkommen ${greeting}!</h2>
        <p>${prepHtml}</p>
        <p>${loginNameLineHtml(input.nickname)}</p>
        <p>Bitte kontaktiere Dein Studio, falls Du keinen gueltigen Einladungslink erhalten hast.</p>
      `,
    textBody: [
      `Willkommen ${greeting}!`,
      "",
      prepText,
      loginNameLineText(input.nickname),
      "",
      "Bitte kontaktiere Dein Studio, falls Du keinen gueltigen Einladungslink erhalten hast.",
    ].join("\n"),
  });
}

export function buildStudioAccessRemovedMail(input: StudioAccessRemovedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return {
      subject: input.inviteWithdrawn
        ? `${studio}: Einladung zurueckgezogen`
        : `${studio}: Zugang entfernt`,
      html: "",
      text: "",
    };
  }

  if (input.inviteWithdrawn) {
    const withdrawnHtml = hasNamedStudio(studio)
      ? `Die Einladung zu YogaSwap fuer <strong>${studio}</strong> wurde zurueckgezogen.`
      : "Die Einladung zu YogaSwap wurde zurueckgezogen.";
    const withdrawnText = hasNamedStudio(studio)
      ? `Die Einladung zu YogaSwap fuer "${studio}" wurde zurueckgezogen.`
      : "Die Einladung zu YogaSwap wurde zurueckgezogen.";
    return composeMail({
      subject: `${studio}: Einladung zurueckgezogen`,
      studioName: studio,
      studioUrl: input.studioUrl,
      htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>${withdrawnHtml}</p>
        <p>Bitte nutze den Link aus der Einladungs-Mail nicht mehr — er fuehrt nicht mehr zu einem gueltigen Studio-Zugang
        fuer den Login-Namen <strong>${input.nickname}</strong>.</p>
        <p>Falls das ein Versehen war, melde Dich bitte bei Deinem Studio.</p>
      `,
      textBody: [
        `Hallo ${greeting}!`,
        "",
        withdrawnText,
        `Bitte nutze den Link aus der Einladungs-Mail nicht mehr — er fuehrt nicht mehr zu einem gueltigen Studio-Zugang fuer den Login-Namen "${input.nickname}".`,
        "",
        "Falls das ein Versehen war, melde Dich bitte bei Deinem Studio.",
      ].join("\n"),
    });
  }

  const removedHtml = hasNamedStudio(studio)
    ? `Auf YogaSwap wurde Dein Zugang fuer <strong>${studio}</strong> entfernt.`
    : "Auf YogaSwap wurde Dein Zugang entfernt.";
  const removedText = hasNamedStudio(studio)
    ? `Auf YogaSwap wurde Dein Zugang fuer "${studio}" entfernt.`
    : "Auf YogaSwap wurde Dein Zugang entfernt.";

  return composeMail({
    subject: `${studio}: Zugang entfernt`,
    studioName: studio,
    studioUrl: input.studioUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>${removedHtml}</p>
        <p>Dein Konto fuer den Login-Namen <strong>${input.nickname}</strong> ist nur deaktiviert
        und noch nicht vollstaendig geloescht.</p>
        <p>Wenn Du eine vollstaendige Entfernung Deines Kontos moechtest, schreibe bitte an support@yogaswap.de.</p>
        <p>Falls das ein Versehen war, melde Dich bitte bei Deinem Studio.</p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      removedText,
      `Dein Konto fuer den Login-Namen "${input.nickname}" ist nur deaktiviert und noch nicht vollstaendig geloescht.`,
      "",
      "Wenn Du eine vollstaendige Entfernung Deines Kontos moechtest, schreibe bitte an support@yogaswap.de.",
      "Falls das ein Versehen war, melde Dich bitte bei Deinem Studio.",
    ].join("\n"),
  });
}

/** Permanent delete confirmation (#271) — studio-only vs full Cognito account. */
export function buildAccountPurgedMail(input: AccountPurgedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  const fullAccount = input.purgeScope === "full_account";

  if (locale !== "de") {
    return {
      subject: fullAccount
        ? `${studio}: Konto geloescht`
        : `${studio}: Studio-Daten geloescht`,
      html: "",
      text: "",
    };
  }

  if (fullAccount) {
    const html = hasNamedStudio(studio)
      ? `Auf Wunsch wurden Deine Daten bei <strong>${studio}</strong> und Dein YogaSwap-Login (Login-Name <strong>${input.nickname}</strong>) endgueltig geloescht.`
      : `Auf Wunsch wurden Deine Studio-Daten und Dein YogaSwap-Login (Login-Name <strong>${input.nickname}</strong>) endgueltig geloescht.`;
    const text = hasNamedStudio(studio)
      ? `Auf Wunsch wurden Deine Daten bei "${studio}" und Dein YogaSwap-Login (Login-Name "${input.nickname}") endgueltig geloescht.`
      : `Auf Wunsch wurden Deine Studio-Daten und Dein YogaSwap-Login (Login-Name "${input.nickname}") endgueltig geloescht.`;
    return composeMail({
      subject: `${studio}: Konto geloescht`,
      studioName: studio,
      studioUrl: input.studioUrl,
      htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>${html}</p>
        <p>Eine Anmeldung mit diesem Login ist nicht mehr moeglich.</p>
      `,
      textBody: [
        `Hallo ${greeting}!`,
        "",
        text,
        "",
        "Eine Anmeldung mit diesem Login ist nicht mehr moeglich.",
      ].join("\n"),
    });
  }

  const htmlStudio = hasNamedStudio(studio)
    ? `Auf Wunsch wurden Deine Daten fuer <strong>${studio}</strong> endgueltig aus YogaSwap entfernt (Login-Name <strong>${input.nickname}</strong>).`
    : `Auf Wunsch wurden Deine Studio-Daten endgueltig aus YogaSwap entfernt (Login-Name <strong>${input.nickname}</strong>).`;
  const textStudio = hasNamedStudio(studio)
    ? `Auf Wunsch wurden Deine Daten fuer "${studio}" endgueltig aus YogaSwap entfernt (Login-Name "${input.nickname}").`
    : `Auf Wunsch wurden Deine Studio-Daten endgueltig aus YogaSwap entfernt (Login-Name "${input.nickname}").`;
  return composeMail({
    subject: `${studio}: Studio-Daten geloescht`,
    studioName: studio,
    studioUrl: input.studioUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>${htmlStudio}</p>
        <p>Dein YogaSwap-Login bleibt bestehen, weil Du noch mit mindestens einem anderen Studio verknuepft bist
        (aktiv oder ehemalig).</p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      textStudio,
      "",
      "Dein YogaSwap-Login bleibt bestehen, weil Du noch mit mindestens einem anderen Studio verknuepft bist (aktiv oder ehemalig).",
    ].join("\n"),
  });
}

export function buildEmailChangedNewAddressMail(
  input: EmailChangedNewAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: E-Mail-Adresse aktualisiert`, html: "", text: "" };
  }

  const resetLink = input.passwordResetLink?.trim();
  const resetHtml = resetLink
    ? `
        <p>Aus Sicherheitsgruenden musst Du ein neues Passwort festlegen, bevor Du Dich wieder anmelden kannst.</p>
        <p><a href="${resetLink}">Neues Passwort fuer YogaSwap festlegen</a></p>
        <p>Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.</p>
      `
    : `<p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>`;
  const resetText = resetLink
    ? [
        "Aus Sicherheitsgruenden musst Du ein neues Passwort festlegen, bevor Du Dich wieder anmelden kannst.",
        "",
        `Neues Passwort festlegen: ${resetLink}`,
        "",
        "Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.",
      ].join("\n")
    : `Anmeldung: ${input.loginUrl}`;

  return composeMail({
    subject: resetLink
      ? `${studio}: E-Mail geaendert — Passwort neu setzen`
      : `${studio}: E-Mail-Adresse aktualisiert`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} die Login-E-Mail-Adresse
        auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p>${loginNameStillHtml(input.nickname)}</p>
        ${resetHtml}
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} die Login-E-Mail-Adresse auf "${input.newEmail}" geaendert.`,
      loginNameStillText(input.nickname),
      "",
      resetText,
    ].join("\n"),
  });
}

export function buildEmailChangedOldAddressMail(
  input: EmailChangedOldAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return {
      subject: `${studio}: Sicherheitshinweis E-Mail geaendert`,
      html: "",
      text: "",
    };
  }

  return composeMail({
    subject: `${studio}: Sicherheitshinweis E-Mail geaendert`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} die Login-E-Mail-Adresse
        auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p>${loginNameStillHtml(input.nickname)}</p>
        <p>Falls das nicht von Dir veranlasst wurde, kontaktiere bitte umgehend Dein Studio.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} die Login-E-Mail-Adresse auf "${input.newEmail}" geaendert.`,
      loginNameStillText(input.nickname),
      "",
      "Falls das nicht von Dir veranlasst wurde, kontaktiere bitte umgehend Dein Studio.",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

export function buildRoleChangedMail(input: RoleChangedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: Rolle aktualisiert`, html: "", text: "" };
  }

  return composeMail({
    subject: `${studio}: Rolle aktualisiert`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} Deine Rolle von
        <strong>${input.oldRole}</strong> &rarr; <strong>${input.newRole}</strong> geaendert.</p>
        <p>${loginNameStillHtml(input.nickname)}</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} Deine Rolle von "${input.oldRole}" -> "${input.newRole}" geaendert.`,
      loginNameStillText(input.nickname),
      "",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

/** Info-Mail when studio changes a registered member's display name (#345). */
export function buildDisplayNameChangedMail(input: DisplayNameChangedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const greeting = resolveAuthMailGreetingName(input);
  if (locale !== "de") {
    return { subject: `${studio}: Anzeigename aktualisiert`, html: "", text: "" };
  }

  return composeMail({
    subject: `${studio}: Anzeigename aktualisiert`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${greeting}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} Dein Anzeigename von
        <strong>${input.oldDisplayName}</strong> &rarr; <strong>${input.newDisplayName}</strong> geaendert.</p>
        <p>${loginNameStillHtml(input.nickname)}</p>
        <p>Falls Du Rueckfragen oder einen anderen Vorschlag hast, melde Dich bitte bei Deinem Studio.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${greeting}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} Dein Anzeigename von "${input.oldDisplayName}" -> "${input.newDisplayName}" geaendert.`,
      loginNameStillText(input.nickname),
      "",
      "Falls Du Rueckfragen oder einen anderen Vorschlag hast, melde Dich bitte bei Deinem Studio.",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

type CognitoPasswordResetCodeMailInput = {
  locale?: string;
  nickname: string;
  codeParameter: string;
};

/** Cognito Custom Message body for ForgotPassword / AdminResetUserPassword (#107). */
export function buildCognitoPasswordResetCodeMail(
  input: CognitoPasswordResetCodeMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const code = input.codeParameter || "{####}";
  if (locale !== "de") {
    return { subject: "YogaSwap Bestaetigungscode", html: "", text: "" };
  }

  return composeMail({
    subject: "YogaSwap Bestaetigungscode",
    htmlBody: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Bestaetigungscode fuer YogaSwap lautet:</p>
        <p style="font-size:1.4em;font-weight:bold;letter-spacing:0.05em;">${code}</p>
        <p>Gib diesen Code in der App ein, um Dein neues Passwort festzulegen.</p>
        <p>Wenn Du das nicht angefordert hast, kannst Du diese E-Mail ignorieren.</p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      `Dein Bestaetigungscode fuer YogaSwap lautet: ${code}`,
      "",
      "Gib diesen Code in der App ein, um Dein neues Passwort festzulegen.",
      "Wenn Du das nicht angefordert hast, kannst Du diese E-Mail ignorieren.",
    ].join("\n"),
  });
}
