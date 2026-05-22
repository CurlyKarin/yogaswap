import {
  buildPlannedEndDateClearedMail,
  buildPlannedEndDateMail,
  formatIsoDateDe,
} from "./courseMailTemplates";

describe("courseMailTemplates", () => {
  test("formatIsoDateDe formats UTC date in german locale", () => {
    expect(formatIsoDateDe("2026-06-20")).toMatch(/20\.06\.2026/);
  });

  test("buildPlannedEndDateMail includes course and planned end", () => {
    const mail = buildPlannedEndDateMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      plannedEndDateIso: "2026-06-20",
      loginUrl: "https://app.example.com",
    });
    expect(mail.subject).toMatch(/Morgenyoga/);
    expect(mail.html).toMatch(/Luna/);
    expect(mail.html).toMatch(/20\.06\.2026/);
    expect(mail.html).toMatch(/app\.example\.com/);
  });

  test("buildPlannedEndDateClearedMail describes removed end date", () => {
    const mail = buildPlannedEndDateClearedMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      previousPlannedEndDateIso: "2026-06-20",
    });
    expect(mail.subject).toMatch(/aufgehoben/);
    expect(mail.html).toMatch(/aufgehoben/);
    expect(mail.html).toMatch(/20\.06\.2026/);
  });
});
