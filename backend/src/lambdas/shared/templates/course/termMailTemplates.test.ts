import { buildParticipantTermReleasedMail, buildStudioTermCancelledMail } from "./termMailTemplates";

describe("termMailTemplates", () => {
  const base = {
    nickname: "Luna",
    courseName: "Morgenyoga",
    dateIso: "2026-06-20",
    time: "18:00",
  };

  test("buildStudioTermCancelledMail formats date and time", () => {
    const mail = buildStudioTermCancelledMail(base);
    expect(mail.subject).toMatch(/Terminabsage/);
    expect(mail.html).toMatch(/Samstag/);
    expect(mail.html).toMatch(/20\.06\.2026/);
    expect(mail.html).toMatch(/18:00/);
  });

  test("buildStudioTermCancelledMail includes studio contact (#272)", () => {
    const mail = buildStudioTermCancelledMail({
      ...base,
      studioContact: { email: "info@beharmony.yoga", name: "Beharmony" },
    });
    expect(mail.html).toContain("Bei Fragen wende Dich an Dein Studio");
    expect(mail.html).toContain("info@beharmony.yoga");
  });

  test("buildParticipantTermReleasedMail describes freed slot and Ersatztermin", () => {
    const mail = buildParticipantTermReleasedMail(base);
    expect(mail.subject).toMatch(/freigegeben/);
    expect(mail.html).toMatch(/Samstag/);
    expect(mail.html).toMatch(/Ersatztermin/);
    expect(mail.html).toMatch(/Warteliste/);
  });

});
