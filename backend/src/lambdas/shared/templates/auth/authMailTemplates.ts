export type AuthMailLocale = "de";

type InviteMailInput = {
  locale?: string;
  nickname: string;
  link: string;
};

type RecoveryMailInput = {
  locale?: string;
  nickname: string;
  link: string;
};

type ReactivationMailInput = {
  locale?: string;
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
  if (locale === "de") {
    return {
      subject: "YogaSwap Einladung",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Du wurdest zu YogaSwap eingeladen.</p>
        <p><a href="${input.link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
        <p>Danach erhältst du eine E-Mail mit einem Code zur Bestätigung.</p>
      `,
    };
  }
  return {
    subject: "YogaSwap Einladung",
    html: "",
  };
}

export function buildRecoveryMail(input: RecoveryMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  if (locale === "de") {
    return {
      subject: "YogaSwap Passwort zuruecksetzen",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Passwort fuer YogaSwap wurde zurueckgesetzt.</p>
        <p><a href="${input.link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
        <p>Danach erhältst du eine E-Mail mit einem Code zur Bestätigung.</p>
      `,
    };
  }
  return {
    subject: "YogaSwap Passwort zuruecksetzen",
    html: "",
  };
}

export function buildReactivationMail(input: ReactivationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  if (locale === "de") {
    return {
      subject: "YogaSwap Reaktivierung",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Zugang zu YogaSwap wurde fuer dieses Studio reaktiviert.</p>
        <p>Du kannst dich mit deinem bestehenden Passwort wieder anmelden.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: "YogaSwap Reaktivierung",
    html: "",
  };
}

type InvitePreparationMailInput = {
  locale?: string;
  nickname: string;
};

export function buildInvitePreparationMail(input: InvitePreparationMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  if (locale === "de") {
    return {
      subject: "YogaSwap Einladung",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p>Dein Zugang wird vorbereitet.</p>
        <p>Bitte kontaktiere dein Studio, falls du keinen gueltigen Einladungslink erhalten hast.</p>
      `,
    };
  }
  return {
    subject: "YogaSwap Einladung",
    html: "",
  };
}
