import { buildSwapSuccessMail, buildWaitlistPromotionMail } from "./swapMailTemplates";

describe("swapMailTemplates", () => {
  test("buildSwapSuccessMail includes target term and login link", () => {
    const mail = buildSwapSuccessMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      dateIso: "2026-06-20",
      time: "18:00",
      loginUrl: "https://app.example.com",
    });

    expect(mail.subject).toMatch(/Tausch bestätigt/);
    expect(mail.html).toMatch(/Morgenyoga/);
    expect(mail.html).toMatch(/20\.06\.2026/);
    expect(mail.html).toMatch(/18:00/);
    expect(mail.html).toMatch(/Kalender-Anhang/);
    expect(mail.html).toMatch(/app\.example\.com/);
  });

  test("buildWaitlistPromotionMail describes promotion", () => {
    const mail = buildWaitlistPromotionMail({
      nickname: "Bob",
      courseName: "Abendflow",
      dateIso: "2026-06-21",
      time: "19:30",
    });

    expect(mail.subject).toMatch(/Nachrücken/);
    expect(mail.html).toMatch(/Warteliste/);
    expect(mail.html).toMatch(/Abendflow/);
  });
});
