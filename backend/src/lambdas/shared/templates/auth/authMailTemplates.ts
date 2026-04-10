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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
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
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
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

type StudioAccessRemovedMailInput = {
  locale?: string;
  nickname: string;
};

type EmailChangedNewAddressMailInput = {
  locale?: string;
  nickname: string;
  loginUrl: string;
  newEmail: string;
};

type EmailChangedOldAddressMailInput = {
  locale?: string;
  nickname: string;
  loginUrl: string;
  newEmail: string;
};

export function buildStudioAccessRemovedMail(input: StudioAccessRemovedMailInput): MailTemplate {
  const locale = normalizeLocale(input.locale);
  if (locale === "de") {
    return {
      subject: "YogaSwap: Zugang im Studio entfernt",
      html:
        `<p>Dein Zugang zu diesem YogaSwap-Studio wurde entfernt.</p>` +
        `<p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>` +
        "<p>Dein Konto ist aktuell nur deaktiviert und noch nicht vollstaendig geloescht.</p>" +
        "<p>Wenn du eine vollstaendige Entfernung deines Kontos moechtest, schreibe bitte an support@yogaswap.de.</p>" +
        "<p>Falls das ein Versehen war, melde dich bitte beim Studio-Team.</p>",
    };
  }
  return {
    subject: "YogaSwap: Zugang im Studio entfernt",
    html: "",
  };
}

export function buildEmailChangedNewAddressMail(
  input: EmailChangedNewAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  if (locale === "de") {
    return {
      subject: "YogaSwap: E-Mail-Adresse aktualisiert",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Deine Login-E-Mail-Adresse wurde auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: "YogaSwap: E-Mail-Adresse aktualisiert",
    html: "",
  };
}

export function buildEmailChangedOldAddressMail(
  input: EmailChangedOldAddressMailInput,
): MailTemplate {
  const locale = normalizeLocale(input.locale);
  if (locale === "de") {
    return {
      subject: "YogaSwap Sicherheitshinweis: E-Mail-Adresse geaendert",
      html: `
        <h2>Hallo ${input.nickname}!</h2>
        <p><strong>Dein Accountname (Spitzname): ${input.nickname}</strong></p>
        <p>Fuer deinen Zugang wurde die Login-E-Mail-Adresse auf <strong>${input.newEmail}</strong> geaendert.</p>
        <p>Falls das nicht von dir veranlasst wurde, kontaktiere bitte umgehend dein Studio.</p>
        <p><a href="${input.loginUrl}">Zur Anmeldung</a></p>
      `,
    };
  }
  return {
    subject: "YogaSwap Sicherheitshinweis: E-Mail-Adresse geaendert",
    html: "",
  };
}
