import {
  buildInviteMail,
  buildInvitePreparationMail,
  buildRecoveryMail,
  buildReactivationMail,
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
    expect(mail.html).toContain("Dein Zugang wird vorbereitet");
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
