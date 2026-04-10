import {
  buildEmailChangedNewAddressMail,
  buildEmailChangedOldAddressMail,
  buildInviteMail,
  buildInvitePreparationMail,
  buildRecoveryMail,
  buildReactivationMail,
  buildRoleChangedMail,
  buildStudioAccessRemovedMail,
} from "./authMailTemplates";

describe("authMailTemplates", () => {
  test("buildInviteMail returns german template with placeholders", () => {
    const mail = buildInviteMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/invite-token",
    });

    expect(mail.subject).toBe("YogaSwap Einladung");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Accountname (Spitzname): Karin");
    expect(mail.html).toContain("https://example.com/invite-token");
    expect(mail.html).toContain("eingeladen");
  });

  test("buildRecoveryMail returns german template with placeholders", () => {
    const mail = buildRecoveryMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/recovery-token",
    });

    expect(mail.subject).toBe("YogaSwap Passwort zuruecksetzen");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Accountname (Spitzname): Karin");
    expect(mail.html).toContain("https://example.com/recovery-token");
    expect(mail.html).toContain("Passwort fuer YogaSwap wurde zurueckgesetzt");
  });

  test("buildReactivationMail returns german template with placeholders", () => {
    const mail = buildReactivationMail({
      locale: "de",
      nickname: "Karin",
      loginUrl: "https://example.com/login",
    });

    expect(mail.subject).toBe("YogaSwap Reaktivierung");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Accountname (Spitzname): Karin");
    expect(mail.html).toContain("https://example.com/login");
    expect(mail.html).toContain("reaktiviert");
  });

  test("buildInvitePreparationMail returns german fallback template", () => {
    const mail = buildInvitePreparationMail({
      locale: "de",
      nickname: "Karin",
    });

    expect(mail.subject).toBe("YogaSwap Einladung");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Accountname (Spitzname): Karin");
    expect(mail.html).toContain("Dein Zugang wird vorbereitet");
  });

  test("buildStudioAccessRemovedMail returns german template with nickname", () => {
    const mail = buildStudioAccessRemovedMail({
      locale: "de",
      nickname: "Karin",
    });

    expect(mail.subject).toBe("YogaSwap: Zugang im Studio entfernt");
    expect(mail.html).toContain("Zugang zu diesem YogaSwap-Studio wurde entfernt");
    expect(mail.html).toContain("Accountname (Spitzname): Karin");
  });

  test("buildEmailChangedNewAddressMail returns german template with app link", () => {
    const mail = buildEmailChangedNewAddressMail({
      locale: "de",
      nickname: "Karin",
      newEmail: "karin.neu@example.com",
      loginUrl: "https://app.yogaswap.de",
    });

    expect(mail.subject).toBe("YogaSwap: E-Mail-Adresse aktualisiert");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("karin.neu@example.com");
    expect(mail.html).toContain("https://app.yogaswap.de");
  });

  test("buildEmailChangedOldAddressMail returns german security template", () => {
    const mail = buildEmailChangedOldAddressMail({
      locale: "de",
      nickname: "Karin",
      newEmail: "karin.neu@example.com",
      loginUrl: "https://app.yogaswap.de",
    });

    expect(mail.subject).toBe("YogaSwap Sicherheitshinweis: E-Mail-Adresse geaendert");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("karin.neu@example.com");
    expect(mail.html).toContain("Falls das nicht von dir veranlasst wurde");
  });

  test("buildRoleChangedMail returns german role-change template", () => {
    const mail = buildRoleChangedMail({
      locale: "de",
      nickname: "Karin",
      oldRole: "participant",
      newRole: "instructor",
      loginUrl: "https://app.yogaswap.de",
    });

    expect(mail.subject).toBe("YogaSwap: Rolle aktualisiert");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Accountname (Spitzname): Karin");
    expect(mail.html).toContain("participant");
    expect(mail.html).toContain("instructor");
    expect(mail.html).toContain("https://app.yogaswap.de");
  });

  test("unknown locale falls back to german for all builders", () => {
    const invite = buildInviteMail({
      locale: "en",
      nickname: "User",
      link: "https://example.com/invite",
    });
    const recovery = buildRecoveryMail({
      locale: "fr",
      nickname: "User",
      link: "https://example.com/recovery",
    });
    const reactivation = buildReactivationMail({
      locale: "es",
      nickname: "User",
      loginUrl: "https://example.com/login",
    });
    const preparation = buildInvitePreparationMail({
      locale: "it",
      nickname: "User",
    });

    expect(invite.subject).toBe("YogaSwap Einladung");
    expect(invite.html).toContain("eingeladen");
    expect(recovery.subject).toBe("YogaSwap Passwort zuruecksetzen");
    expect(recovery.html).toContain("zurueckgesetzt");
    expect(reactivation.subject).toBe("YogaSwap Reaktivierung");
    expect(reactivation.html).toContain("reaktiviert");
    expect(preparation.subject).toBe("YogaSwap Einladung");
    expect(preparation.html).toContain("wird vorbereitet");
  });

  test("missing locale defaults to german", () => {
    const mail = buildInviteMail({
      nickname: "Karin",
      link: "https://example.com/invite",
    });

    expect(mail.subject).toBe("YogaSwap Einladung");
    expect(mail.html).toContain("Hallo Karin");
  });
});
