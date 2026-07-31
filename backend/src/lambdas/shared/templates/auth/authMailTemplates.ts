export type AuthMailLocale = "de";

const DEFAULT_STUDIO_LABEL = "YogaSwap";
const PLATFORM_BLURB =
  "YogaSwap, einer Plattform zum Tauschen von Yogakurs-Terminen";

/** Anzeigename für Auth-Mails; Fallback „YogaSwap“, wenn Name fehlt (#268). */
export function resolveStudioDisplayName(studioName?: string | null): string {
  const trimmed = studioName?.trim();
  return trimmed || DEFAULT_STUDIO_LABEL;
}

function hasNamedStudio(studio: string): boolean {
  return studio !== DEFAULT_STUDIO_LABEL;
}

/** Kurzer Herkunftshinweis: Studio + Plattform (ohne doppeltes „YogaSwap“). */
function originPhrase(studio: string): string {
  if (hasNamedStudio(studio)) {
    return `<strong>${studio}</strong> auf ${PLATFORM_BLURB}`;
  }
  return PLATFORM_BLURB;
}

type StudioMailFields = {
  locale?: string;
  /** Tenant-/Studio-Anzeigename; fehlt → Fallback „YogaSwap“. */
  studioName?: string | null;
};

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

type MailTemplate = {
  subject: string;
  html: string;
};

function normalizeLocale(locale?: string): AuthMailLocale {
  const raw = (locale || "de").trim().toLowerCase();
  if (raw.startsWith("de")) return "de";
  return "de";
}

export function buildInviteMail(input: InviteMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  const invitedBy = hasNamedStudio(studio)
    ? `von <strong>${studio}</strong> zu ${PLATFORM_BLURB}`
    : `zu ${PLATFORM_BLURB}`;
  if (locale === "de") {
    return {
      subject: `${studio}: Einladung`,
      html: `
        <h2>Willkommen ${input.nickname}!</h2>
        <p>Du wurdest ${invitedBy} eingeladen.</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p><a href="${input.link}">Klicke hier, um dein Passwort festzulegen</a></p>
        <p>Danach erhaeltst du eine weitere E-Mail mit einem Bestaetigungscode.</p>
        <p>Falls du diese Einladung nicht erwartet hast, kannst du die E-Mail ignorieren oder dein Studio kontaktieren.</p>
      `,
    };
  }
  return {
    subject: `${studio}: Einladung`,
    html: "",
  };
}

export function buildRecoveryMail(input: RecoveryMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: Passwort zuruecksetzen`,
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Fuer deinen Zugang bei ${originPhrase(studio)} wurde ein Passwort-Reset ausgeloest
        (durch dich selbst oder durch dein Studio).</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p><a href="${input.link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
        <p>Danach erhaeltst du eine weitere E-Mail mit einem Bestaetigungscode.</p>
        <p>Falls du das nicht angefordert hast, kontaktiere bitte dein Studio.</p>
      `,
    };
  }
  return {
    subject: `${studio}: Passwort zuruecksetzen`,
    html: "",
  };
}

export function buildReactivationMail(input: ReactivationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: Reaktivierung`,
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Studio hat deinen Zugang bei ${originPhrase(studio)} wieder freigeschaltet.</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p>Du kannst dich mit deinem bestehenden Passwort wieder anmelden.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: `${studio}: Reaktivierung`,
    html: "",
  };
}

type InvitePreparationMailInput = StudioMailFields & {
  nickname: string;
};

export function buildInvitePreparationMail(input: InvitePreparationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: Einladung`,
      html: `
        <h2>Willkommen ${input.nickname}!</h2>
        <p>Dein Zugang bei ${originPhrase(studio)} wird vorbereitet.</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p>Bitte kontaktiere dein Studio, falls du keinen gueltigen Einladungslink erhalten hast.</p>
      `,
    };
  }
  return {
    subject: `${studio}: Einladung`,
    html: "",
  };
}

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

export function buildStudioAccessRemovedMail(input: StudioAccessRemovedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: Zugang entfernt`,
      html:
        `<h2>Hallo ${input.nickname}!</h2>` +
        `<p>Dein Studio hat deinen Zugang bei ${originPhrase(studio)} entfernt.</p>` +
        `<p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>` +
        "<p>Dein Konto ist aktuell nur deaktiviert und noch nicht vollstaendig geloescht.</p>" +
        "<p>Wenn du eine vollstaendige Entfernung deines Kontos moechtest, schreibe bitte an support@yogaswap.de.</p>" +
        "<p>Falls das ein Versehen war, melde dich bitte bei deinem Studio.</p>",
    };
  }
  return {
    subject: `${studio}: Zugang entfernt`,
    html: "",
  };
}

export function buildEmailChangedNewAddressMail(
  input: EmailChangedNewAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: E-Mail-Adresse aktualisiert`,
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Fuer deinen Zugang bei ${originPhrase(studio)} wurde die Login-E-Mail-Adresse
        auf <strong>${input.newEmail}</strong> geaendert (durch dich oder dein Studio).</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: `${studio}: E-Mail-Adresse aktualisiert`,
    html: "",
  };
}

export function buildEmailChangedOldAddressMail(
  input: EmailChangedOldAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: Sicherheitshinweis E-Mail geaendert`,
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Fuer deinen Zugang bei ${originPhrase(studio)} wurde die Login-E-Mail-Adresse
        auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p>Falls das nicht von dir veranlasst wurde, kontaktiere bitte umgehend dein Studio.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: `${studio}: Sicherheitshinweis E-Mail geaendert`,
    html: "",
  };
}

export function buildRoleChangedMail(input: RoleChangedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const studio = resolveStudioDisplayName(input.studioName);
  if (locale === "de") {
    return {
      subject: `${studio}: Rolle aktualisiert`,
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Studio hat deine Rolle bei ${originPhrase(studio)} geaendert:
        <strong>${input.oldRole}</strong> -> <strong>${input.newRole}</strong>.</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: `${studio}: Rolle aktualisiert`,
    html: "",
  };
}

type CognitoPasswordResetCodeMailInput = {
  locale?: string;
  nickname: string;
  /** Cognito placeholder, typically `{####}` — must appear literally in the body. */
  codeParameter: string;
};

/** Cognito Custom Message body for ForgotPassword / AdminResetUserPassword (#107). */
export function buildCognitoPasswordResetCodeMail(
  input: CognitoPasswordResetCodeMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  const code = input.codeParameter || "{####}";
  if (locale === "de") {
    return {
      subject: "YogaSwap Bestaetigungscode",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Bestaetigungscode fuer YogaSwap lautet:</p>
        <p style="font-size:1.4em;font-weight:bold;letter-spacing:0.05em;">${code}</p>
        <p><strong>${input.nickname}</strong> ist dein Accountname auf der Plattform.</p>
        <p>Gib diesen Code in der App ein, um dein neues Passwort festzulegen.</p>
        <p>Wenn du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
      `,
    };
  }
  return {
    subject: "YogaSwap Bestaetigungscode",
    html: "",
  };
}
