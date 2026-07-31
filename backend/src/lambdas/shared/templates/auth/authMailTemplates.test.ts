import {
  buildCognitoPasswordResetCodeMail,
  buildEmailChangedNewAddressMail,
  buildEmailChangedOldAddressMail,
  buildInviteMail,
  buildInvitePreparationMail,
  buildRecoveryMail,
  buildReactivationMail,
  buildRoleChangedMail,
  buildStudioAccessRemovedMail,
  resolveStudioDisplayName,
} from "./authMailTemplates";

describe("authMailTemplates", () => {
  test("resolveStudioDisplayName falls back to YogaSwap", () => {
    expect(resolveStudioDisplayName(undefined)).toBe("YogaSwap");
    expect(resolveStudioDisplayName("")).toBe("YogaSwap");
    expect(resolveStudioDisplayName("  ")).toBe("YogaSwap");
    expect(resolveStudioDisplayName("Beharmony")).toBe("Beharmony");
  });

  test("buildInviteMail returns german template with placeholders", () => {
    const mail = buildInviteMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/invite-token",
    });

    expect(mail.subject).toBe("YogaSwap: Einladung");
    expect(mail.html).toContain("Willkommen Karin");
    expect(mail.html).toContain("Karin</strong> ist dein Accountname");
    expect(mail.html).toContain("https://example.com/invite-token");
    expect(mail.html).toContain("YogaSwap");
    expect(mail.html).toContain("eingeladen");
    expect(mail.html).toContain("Plattform zum Tauschen");
  });

  test("buildInviteMail includes studio name as inviting studio", () => {
    const mail = buildInviteMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/invite-token",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Einladung");
    expect(mail.html).toContain("von <strong>Beharmony</strong> zu YogaSwap");
    expect(mail.html).toContain("Plattform zum Tauschen");
  });

  test("buildRecoveryMail explains studio and platform origin", () => {
    const mail = buildRecoveryMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/recovery-token",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Passwort zuruecksetzen");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Karin</strong> ist dein Accountname");
    expect(mail.html).toContain("https://example.com/recovery-token");
    expect(mail.html).toContain("<strong>Beharmony</strong> auf YogaSwap");
    expect(mail.html).toContain("durch dich selbst oder durch dein Studio");
  });

  test("buildCognitoPasswordResetCodeMail includes Cognito code placeholder", () => {
    const mail = buildCognitoPasswordResetCodeMail({
      locale: "de",
      nickname: "Karin",
      codeParameter: "{####}",
    });

    expect(mail.subject).toBe("YogaSwap Bestaetigungscode");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("{####}");
    expect(mail.html).toContain("Bestaetigungscode fuer YogaSwap");
  });

  test("buildReactivationMail returns german template with placeholders", () => {
    const mail = buildReactivationMail({
      locale: "de",
      nickname: "Karin",
      loginUrl: "https://example.com/login",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Reaktivierung");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Dein Studio hat deinen Zugang");
    expect(mail.html).toContain("https://example.com/login");
    expect(mail.html).toContain("Beharmony");
  });

  test("buildInvitePreparationMail returns german fallback template", () => {
    const mail = buildInvitePreparationMail({
      locale: "de",
      nickname: "Karin",
    });

    expect(mail.subject).toBe("YogaSwap: Einladung");
    expect(mail.html).toContain("Willkommen Karin");
    expect(mail.html).toContain("Karin</strong> ist dein Accountname");
    expect(mail.html).toContain("wird vorbereitet");
  });

  test("buildStudioAccessRemovedMail returns german template with nickname", () => {
    const mail = buildStudioAccessRemovedMail({
      locale: "de",
      nickname: "Karin",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Zugang entfernt");
    expect(mail.html).toContain("Dein Studio hat deinen Zugang");
    expect(mail.html).toContain("<strong>Beharmony</strong>");
    expect(mail.html).toContain("Karin</strong> ist dein Accountname");
  });

  test("buildEmailChangedNewAddressMail returns german template with app link", () => {
    const mail = buildEmailChangedNewAddressMail({
      locale: "de",
      nickname: "Karin",
      newEmail: "karin.neu@example.com",
      loginUrl: "https://app.yogaswap.de",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: E-Mail-Adresse aktualisiert");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("karin.neu@example.com");
    expect(mail.html).toContain("https://app.yogaswap.de");
    expect(mail.html).toContain("Beharmony");
    expect(mail.html).toContain("durch dich oder dein Studio");
  });

  test("buildEmailChangedOldAddressMail returns german security template", () => {
    const mail = buildEmailChangedOldAddressMail({
      locale: "de",
      nickname: "Karin",
      newEmail: "karin.neu@example.com",
      loginUrl: "https://app.yogaswap.de",
    });

    expect(mail.subject).toBe("YogaSwap: Sicherheitshinweis E-Mail geaendert");
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
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Rolle aktualisiert");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("Dein Studio hat deine Rolle");
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

    expect(invite.subject).toBe("YogaSwap: Einladung");
    expect(invite.html).toContain("eingeladen");
    expect(recovery.subject).toBe("YogaSwap: Passwort zuruecksetzen");
    expect(recovery.html).toContain("Passwort-Reset");
    expect(reactivation.subject).toBe("YogaSwap: Reaktivierung");
    expect(reactivation.html).toContain("wieder freigeschaltet");
    expect(preparation.subject).toBe("YogaSwap: Einladung");
    expect(preparation.html).toContain("wird vorbereitet");
  });

  test("missing locale defaults to german", () => {
    const mail = buildInviteMail({
      nickname: "Karin",
      link: "https://example.com/invite",
    });

    expect(mail.subject).toBe("YogaSwap: Einladung");
    expect(mail.html).toContain("Willkommen Karin");
  });
});
