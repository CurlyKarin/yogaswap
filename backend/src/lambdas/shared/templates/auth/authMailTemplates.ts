export type AuthMailLocale = "de";

const DEFAULT_STUDIO_LABEL = "YogaSwap";
const PLATFORM_BLURB =
  "YogaSwap ist eine Plattform zum Tauschen von Yogakurs-Terminen.";

/** Anzeigename für Auth-Mails; Fallback „YogaSwap“, wenn Name fehlt (#268). */
export function resolveStudioDisplayName(studioName?: string | null): string {
  const trimmed = studioName?.trim();
  return trimmed || DEFAULT_STUDIO_LABEL;
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
  link: string;
};

type RecoveryMailInput = StudioMailFields & {
  nickname: string;
  link: string;
};

type ReactivationMailInput = StudioMailFields & {
  nickname: string;
  loginUrl: string;
};

type InvitePreparationMailInput = StudioMailFields & {
  nickname: string;
};

type StudioAccessRemovedMailInput = StudioMailFields & {
  nickname: string;
};

type EmailChangedNewAddressMailInput = StudioMailFields & {
  nickname: string;
  loginUrl: string;
  newEmail: string;
};

type EmailChangedOldAddressMailInput = StudioMailFields & {
  nickname: string;
  loginUrl: string;
  newEmail: string;
};

type RoleChangedMailInput = StudioMailFields & {
  nickname: string;
  loginUrl: string;
  oldRole: string;
  newRole: string;
};

export function buildInviteMail(input: InviteMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
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
        <h2>Willkommen ${input.nickname}!</h2>
        <p>${inviteHtml}</p>
        <p>Dein Accountname auf YogaSwap ist <strong>${input.nickname}</strong>.</p>
        <p><a href="${input.link}">Passwort fuer YogaSwap festlegen</a></p>
        <p>Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.</p>
        <p>Falls Du diese Einladung nicht erwartet hast, kannst Du die E-Mail ignorieren oder Dein Studio kontaktieren.</p>
      `,
    textBody: [
      `Willkommen ${input.nickname}!`,
      "",
      inviteText,
      `Dein Accountname auf YogaSwap ist "${input.nickname}".`,
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
  if (locale !== "de") {
    return { subject: `${studio}: Passwort zuruecksetzen`, html: "", text: "" };
  }

  return composeMail({
    subject: `${studio}: Passwort zuruecksetzen`,
    studioName: studio,
    studioUrl: input.studioUrl,
    htmlBody: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} das Passwort zurueckgesetzt
        (durch Dich selbst oder durch Dein Studio).</p>
        <p>Dein Accountname ist weiterhin <strong>${input.nickname}</strong>.</p>
        <p><a href="${input.link}">Neues Passwort fuer YogaSwap festlegen</a></p>
        <p>Danach erhaeltst Du eine weitere E-Mail mit einem Bestaetigungscode.</p>
        <p>Falls Du das nicht angefordert hast, kontaktiere bitte Dein Studio.</p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} das Passwort zurueckgesetzt (durch Dich selbst oder durch Dein Studio).`,
      `Dein Accountname ist weiterhin "${input.nickname}".`,
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
  if (locale !== "de") {
    return { subject: `${studio}: Reaktivierung`, html: "", text: "" };
  }

  const accessHtml = hasNamedStudio(studio)
    ? `Auf YogaSwap wurde Dein Zugang fuer <strong>${studio}</strong> wieder freigeschaltet.`
    : "Auf YogaSwap wurde Dein Zugang wieder freigeschaltet.";
  const accessText = hasNamedStudio(studio)
    ? `Auf YogaSwap wurde Dein Zugang fuer "${studio}" wieder freigeschaltet.`
    : "Auf YogaSwap wurde Dein Zugang wieder freigeschaltet.";

  return composeMail({
    subject: `${studio}: Reaktivierung`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>${accessHtml}</p>
        <p>Dein Accountname auf YogaSwap ist <strong>${input.nickname}</strong>.</p>
        <p>Du kannst Dich mit Deinem bestehenden Passwort wieder anmelden.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      accessText,
      `Dein Accountname auf YogaSwap ist "${input.nickname}".`,
      "",
      "Du kannst Dich mit Deinem bestehenden Passwort wieder anmelden.",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

export function buildInvitePreparationMail(input: InvitePreparationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
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
        <h2>Willkommen ${input.nickname}!</h2>
        <p>${prepHtml}</p>
        <p>Dein Accountname auf YogaSwap ist <strong>${input.nickname}</strong>.</p>
        <p>Bitte kontaktiere Dein Studio, falls Du keinen gueltigen Einladungslink erhalten hast.</p>
      `,
    textBody: [
      `Willkommen ${input.nickname}!`,
      "",
      prepText,
      `Dein Accountname auf YogaSwap ist "${input.nickname}".`,
      "",
      "Bitte kontaktiere Dein Studio, falls Du keinen gueltigen Einladungslink erhalten hast.",
    ].join("\n"),
  });
}

export function buildStudioAccessRemovedMail(input: StudioAccessRemovedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale !== "de") {
    return { subject: `${studio}: Zugang entfernt`, html: "", text: "" };
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
        <h2>Hallo ${input.nickname}!</h2>
        <p>${removedHtml}</p>
        <p>Dein Konto fuer den Account <strong>${input.nickname}</strong> ist nur deaktiviert
        und noch nicht vollstaendig geloescht.</p>
        <p>Wenn Du eine vollstaendige Entfernung Deines Kontos moechtest, schreibe bitte an support@yogaswap.de.</p>
        <p>Falls das ein Versehen war, melde Dich bitte bei Deinem Studio.</p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      removedText,
      `Dein Konto fuer den Account "${input.nickname}" ist nur deaktiviert und noch nicht vollstaendig geloescht.`,
      "",
      "Wenn Du eine vollstaendige Entfernung Deines Kontos moechtest, schreibe bitte an support@yogaswap.de.",
      "Falls das ein Versehen war, melde Dich bitte bei Deinem Studio.",
    ].join("\n"),
  });
}

export function buildEmailChangedNewAddressMail(
  input: EmailChangedNewAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale !== "de") {
    return { subject: `${studio}: E-Mail-Adresse aktualisiert`, html: "", text: "" };
  }

  return composeMail({
    subject: `${studio}: E-Mail-Adresse aktualisiert`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} die Login-E-Mail-Adresse
        auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p>Dein Accountname ist weiterhin <strong>${input.nickname}</strong>.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} die Login-E-Mail-Adresse auf "${input.newEmail}" geaendert.`,
      `Dein Accountname ist weiterhin "${input.nickname}".`,
      "",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

export function buildEmailChangedOldAddressMail(
  input: EmailChangedOldAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
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
        <h2>Hallo ${input.nickname}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} die Login-E-Mail-Adresse
        auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p>Dein Accountname ist weiterhin <strong>${input.nickname}</strong>.</p>
        <p>Falls das nicht von Dir veranlasst wurde, kontaktiere bitte umgehend Dein Studio.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} die Login-E-Mail-Adresse auf "${input.newEmail}" geaendert.`,
      `Dein Accountname ist weiterhin "${input.nickname}".`,
      "",
      "Falls das nicht von Dir veranlasst wurde, kontaktiere bitte umgehend Dein Studio.",
      `Anmeldung: ${input.loginUrl}`,
    ].join("\n"),
  });
}

export function buildRoleChangedMail(input: RoleChangedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale !== "de") {
    return { subject: `${studio}: Rolle aktualisiert`, html: "", text: "" };
  }

  return composeMail({
    subject: `${studio}: Rolle aktualisiert`,
    studioName: studio,
    studioUrl: input.studioUrl ?? input.loginUrl,
    htmlBody: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Auf YogaSwap wurde ${forStudioAccessHtml(studio)} Deine Rolle von
        <strong>${input.oldRole}</strong> &rarr; <strong>${input.newRole}</strong> geaendert.</p>
        <p>Dein Accountname ist weiterhin <strong>${input.nickname}</strong>.</p>
        <p><a href="${input.loginUrl}">Zur YogaSwap-Anmeldung</a></p>
      `,
    textBody: [
      `Hallo ${input.nickname}!`,
      "",
      `Auf YogaSwap wurde ${forStudioAccessText(studio)} Deine Rolle von "${input.oldRole}" -> "${input.newRole}" geaendert.`,
      `Dein Accountname ist weiterhin "${input.nickname}".`,
      "",
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
