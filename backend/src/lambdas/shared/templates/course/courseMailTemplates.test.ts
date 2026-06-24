import {
  buildCourseActivatedMail,
  buildCourseMembershipMail,
  buildInstructorParticipantListChangedMail,
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

  test("buildCourseMembershipMail welcomes new participant", () => {
    const mail = buildCourseMembershipMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      weekday: "Mon",
      time: "18:00",
      termDateIso: "2026-06-20",
    });
    expect(mail.subject).toMatch(/Kursbeitritt/);
    expect(mail.html).toMatch(/hinzugefügt/);
    expect(mail.html).toMatch(/nächster Termin/);
    expect(mail.html).toMatch(/20\.06\.2026/);
  });

  test("buildCourseActivatedMail announces active course", () => {
    const mail = buildCourseActivatedMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      termDateIso: "2026-06-20",
      time: "18:00",
    });
    expect(mail.subject).toMatch(/aktiv/);
    expect(mail.html).toMatch(/erste Termin/);
    expect(mail.html).toMatch(/20\.06\.2026/);
  });

  test("buildInstructorParticipantListChangedMail lists adds and removes", () => {
    const mail = buildInstructorParticipantListChangedMail({
      nickname: "Instructor",
      courseName: "Morgenyoga",
      addedParticipants: ["Luna"],
      removedParticipants: ["Bob"],
    });
    expect(mail.html).toMatch(/Luna/);
    expect(mail.html).toMatch(/Bob/);
  });
});
