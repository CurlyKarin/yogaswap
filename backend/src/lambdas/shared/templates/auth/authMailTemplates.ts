export type AuthMailLocale = "de";

const DEFAULT_STUDIO_LABEL = "YogaSwap";

/** Anzeigename für Auth-Mails; Fallback „YogaSwap“, wenn Name fehlt (#268). */
export function resolveStudioDisplayName(studioName?: string | null): string {
  const trimmed = studioName?.trim();
  return trimmed || DEFAULT_STUDIO_LABEL;
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
  if (locale === "de") {
    return {
      subject: `${studio}: Einladung`,
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Du wurdest zu <strong>${studio}</strong> (YogaSwap) eingeladen.</p>
        <p><a href="${input.link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
        <p>Danach erhältst du eine E-Mail mit einem Code zur Bestätigung.</p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Dein Passwort fuer <strong>${studio}</strong> (YogaSwap) wurde zurueckgesetzt.</p>
        <p><a href="${input.link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
        <p>Danach erhältst du eine E-Mail mit einem Code zur Bestätigung.</p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Dein Zugang zu <strong>${studio}</strong> (YogaSwap) wurde reaktiviert.</p>
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
        <h2>Hallo ${input.nickname}!</h2>
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Dein Zugang zu <strong>${studio}</strong> wird vorbereitet.</p>
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
        `<p>Dein Zugang zu <strong>${studio}</strong> (YogaSwap) wurde entfernt.</p>` +
        `<p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>` +
        "<p>Dein Konto ist aktuell nur deaktiviert und noch nicht vollstaendig geloescht.</p>" +
        "<p>Wenn du eine vollstaendige Entfernung deines Kontos moechtest, schreibe bitte an support@yogaswap.de.</p>" +
        "<p>Falls das ein Versehen war, melde dich bitte beim Studio-Team.</p>",
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Deine Login-E-Mail-Adresse fuer <strong>${studio}</strong> wurde auf <strong>${input.newEmail}</strong> geaendert.</p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Fuer deinen Zugang zu <strong>${studio}</strong> wurde die Login-E-Mail-Adresse auf <strong>${input.newEmail}</strong> geaendert.</p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Deine Rolle in <strong>${studio}</strong> wurde geaendert: <strong>${input.oldRole}</strong> -> <strong>${input.newRole}</strong>.</p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Dein Bestaetigungscode fuer YogaSwap lautet:</p>
        <p style="font-size:1.4em;font-weight:bold;letter-spacing:0.05em;">${code}</p>
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
