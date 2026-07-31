import {
  buildAuthMailFooter,
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
  toSesAuthMessage,
} from "./authMailTemplates";

describe("authMailTemplates", () => {
  test("resolveStudioDisplayName falls back to YogaSwap", () => {
    expect(resolveStudioDisplayName(undefined)).toBe("YogaSwap");
    expect(resolveStudioDisplayName("")).toBe("YogaSwap");
    expect(resolveStudioDisplayName("  ")).toBe("YogaSwap");
    expect(resolveStudioDisplayName("Beharmony")).toBe("Beharmony");
  });

  test("HTML footer has studio name but no extra links", () => {
    const footer = buildAuthMailFooter("Beharmony", "https://beharmony.app.yogaswap.de");
    expect(footer).toContain("YogaSwap ist eine Plattform zum Tauschen");
    expect(footer).toContain("Beharmony");
    expect(footer).not.toContain("<a href");
  });

  test("toSesAuthMessage includes Text and Html parts", () => {
    const mail = buildInviteMail({
      nickname: "Karin",
      link: "https://example.com/invite",
      studioName: "Beharmony",
    });
    const message = toSesAuthMessage(mail);
    expect(message.Body.Text?.Data).toContain("Willkommen Karin");
    expect(message.Body.Html?.Data).toContain("Willkommen Karin");
  });

  test("buildInviteMail uses studio-as-inviter wording", () => {
    const mail = buildInviteMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/invite-token",
      studioName: "Beharmony",
      studioUrl: "https://beharmony.app.yogaswap.de",
    });

    expect(mail.subject).toBe("Beharmony: Einladung");
    expect(mail.html).toContain("Willkommen Karin");
    expect(mail.html).toContain(
      "<strong>Beharmony</strong> hat dich zu YogaSwap eingeladen, einer Plattform zum Tauschen",
    );
    expect(mail.html).toContain("Dein Accountname auf YogaSwap ist <strong>Karin</strong>");
    expect(mail.html).toContain("Passwort fuer YogaSwap festlegen");
    expect(mail.html).not.toContain("Klicke hier");
    // nur ein HTML-Link (CTA), kein zweiter Footer-Link
    expect(mail.html.match(/<a href=/g)?.length).toBe(1);
    expect(mail.text).toContain("Passwort festlegen: https://example.com/invite-token");
    expect(mail.text).toContain("https://beharmony.app.yogaswap.de");
  });

  test("buildInviteMail without studio name avoids double YogaSwap inviter", () => {
    const mail = buildInviteMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/invite-token",
    });

    expect(mail.subject).toBe("YogaSwap: Einladung");
    expect(mail.html).toContain("Du wurdest zu YogaSwap eingeladen");
    expect(mail.html).not.toContain("YogaSwap</strong> hat dich zu YogaSwap");
  });

  test("buildRecoveryMail explains studio access password reset", () => {
    const mail = buildRecoveryMail({
      locale: "de",
      nickname: "Karin",
      link: "https://example.com/recovery-token",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Passwort zuruecksetzen");
    expect(mail.html).toContain("Auf YogaSwap wurde fuer Deinen Zugang bei <strong>Beharmony</strong>");
    expect(mail.html).toContain("das Passwort zurueckgesetzt");
    expect(mail.html).toContain("Dein Accountname ist weiterhin <strong>Karin</strong>");
    expect(mail.text).toContain("https://example.com/recovery-token");
  });

  test("buildCognitoPasswordResetCodeMail has no account-name sentence", () => {
    const mail = buildCognitoPasswordResetCodeMail({
      locale: "de",
      nickname: "Karin",
      codeParameter: "{####}",
    });

    expect(mail.subject).toBe("YogaSwap Bestaetigungscode");
    expect(mail.html).toContain("Hallo Karin");
    expect(mail.html).toContain("{####}");
    expect(mail.html).not.toContain("Accountname");
    expect(mail.html).toContain("YogaSwap ist eine Plattform");
  });

  test("buildReactivationMail uses YogaSwap/studio access wording", () => {
    const mail = buildReactivationMail({
      locale: "de",
      nickname: "Karin",
      loginUrl: "https://example.com/login",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Reaktivierung");
    expect(mail.html).toContain(
      "Auf YogaSwap wurde Dein Zugang fuer <strong>Beharmony</strong> wieder freigeschaltet",
    );
    expect(mail.html).toContain("Dein Accountname auf YogaSwap ist <strong>Karin</strong>");
  });

  test("buildInvitePreparationMail returns german fallback template", () => {
    const mail = buildInvitePreparationMail({
      locale: "de",
      nickname: "Karin",
    });

    expect(mail.subject).toBe("YogaSwap: Einladung");
    expect(mail.html).toContain("Willkommen Karin");
    expect(mail.html).toContain("Dein Accountname auf YogaSwap ist <strong>Karin</strong>");
    expect(mail.html).toContain("wird vorbereitet");
  });

  test("buildStudioAccessRemovedMail uses YogaSwap/studio removed wording", () => {
    const mail = buildStudioAccessRemovedMail({
      locale: "de",
      nickname: "Karin",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Zugang entfernt");
    expect(mail.html).toContain(
      "Auf YogaSwap wurde Dein Zugang fuer <strong>Beharmony</strong> entfernt",
    );
    expect(mail.html).toContain(
      "Dein Konto fuer den Account <strong>Karin</strong> ist nur deaktiviert",
    );
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
    expect(mail.html).toContain("Auf YogaSwap wurde fuer Deinen Zugang bei <strong>Beharmony</strong>");
    expect(mail.html).toContain("karin.neu@example.com");
    expect(mail.html).toContain("Dein Accountname ist weiterhin <strong>Karin</strong>");
  });

  test("buildEmailChangedOldAddressMail returns german security template", () => {
    const mail = buildEmailChangedOldAddressMail({
      locale: "de",
      nickname: "Karin",
      newEmail: "karin.neu@example.com",
      loginUrl: "https://app.yogaswap.de",
      studioName: "Beharmony",
    });

    expect(mail.subject).toBe("Beharmony: Sicherheitshinweis E-Mail geaendert");
    expect(mail.html).toContain("Auf YogaSwap wurde fuer Deinen Zugang bei <strong>Beharmony</strong>");
    expect(mail.html).toContain("karin.neu@example.com");
    expect(mail.html).toContain("Falls das nicht von Dir veranlasst wurde");
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
    expect(mail.html).toContain("Auf YogaSwap wurde fuer Deinen Zugang bei <strong>Beharmony</strong>");
    expect(mail.html).toContain("Deine Rolle von");
    expect(mail.html).toContain("participant");
    expect(mail.html).toContain("instructor");
    expect(mail.html).toContain("Dein Accountname ist weiterhin <strong>Karin</strong>");
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
    expect(recovery.html).toContain("Passwort zurueckgesetzt");
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
