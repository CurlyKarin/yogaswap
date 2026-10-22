import {
  buildCourseActivatedMail,
  buildCourseMembershipExitChangedMail,
  buildCourseMembershipExitClearedMail,
  buildCourseMembershipExitMail,
  buildCourseMembershipJoinCancelledMail,
  buildCourseMembershipJoinChangedMail,
  buildCourseMembershipMail,
  buildInstructorParticipantListChangedMail,
  buildPlannedEndDateClearedMail,
  buildPlannedEndDateMail,
  formatCourseWeekdayDe,
  formatIsoDateDe,
  formatIsoWeekdayDe,
  formatTermDateTimeDe,
} from "./courseMailTemplates";

describe("courseMailTemplates", () => {
  test("formatIsoDateDe formats UTC date in german locale", () => {
    expect(formatIsoDateDe("2026-06-20")).toMatch(/20\.06\.2026/);
  });

  test("formatIsoWeekdayDe uses german weekday name", () => {
    expect(formatIsoWeekdayDe("2026-06-20")).toBe("Samstag");
  });

  test("formatCourseWeekdayDe maps english abbreviations", () => {
    expect(formatCourseWeekdayDe("Mon")).toBe("Montag");
    expect(formatCourseWeekdayDe("Tue")).toBe("Dienstag");
  });

  test("formatTermDateTimeDe includes weekday and time", () => {
    expect(formatTermDateTimeDe("2026-06-20", "18:00")).toMatch(/Samstag/);
    expect(formatTermDateTimeDe("2026-06-20", "18:00")).toMatch(/20\.06\.2026/);
    expect(formatTermDateTimeDe("2026-06-20", "18:00")).toMatch(/18:00/);
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

  test("buildCourseMembershipMail uses the personal start term", () => {
    const mail = buildCourseMembershipMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      weekday: "Mon",
      time: "18:00",
      termDateIso: "2026-09-02",
    });
    expect(mail.subject).toMatch(/Kursbeitritt/);
    expect(mail.html).toMatch(/nimmst ab dem Termin/);
    expect(mail.html).toMatch(/02\.09\.2026/);
    expect(mail.html).toMatch(/18:00/);
    expect(mail.html).not.toMatch(/nächster Termin/);
    expect(mail.html).not.toMatch(/hinzugefügt/);
  });

  test("buildCourseMembershipMail falls back without a start term", () => {
    const mail = buildCourseMembershipMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      weekday: "Mon",
      time: "18:00",
    });
    expect(mail.html).toMatch(/hinzugefügt/);
    expect(mail.html).toMatch(/Montag/);
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
    expect(mail.html).toMatch(/Samstag/);
    expect(mail.html).toMatch(/20\.06\.2026/);
  });

  test("buildInstructorParticipantListChangedMail lists adds and removes with dates", () => {
    const mail = buildInstructorParticipantListChangedMail({
      nickname: "Instructor",
      courseName: "Morgenyoga",
      addedParticipants: ["Luna"],
      removedParticipants: ["Bob"],
      addedFromByUser: { luna: "2026-09-02" },
      removedUntilByUser: { bob: "2026-08-17" },
    });
    expect(mail.html).toMatch(/Luna \(ab 02\.09\.2026\)/);
    expect(mail.html).toMatch(/Bob \(letzter Termin 17\.08\.2026\)/);
  });

  test("buildCourseMembershipJoinChangedMail notes the new start term (#310)", () => {
    const mail = buildCourseMembershipJoinChangedMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      time: "18:00",
      termDateIso: "2026-09-09",
    });
    expect(mail.subject).toMatch(/Beitrittstermin geändert/);
    expect(mail.html).toMatch(/Änderung/);
    expect(mail.html).toMatch(/09\.09\.2026/);
  });

  test("buildCourseMembershipJoinCancelledMail cancels planned join (#310)", () => {
    const mail = buildCourseMembershipJoinCancelledMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      time: "18:00",
      termDateIso: "2026-09-02",
    });
    expect(mail.subject).toMatch(/Beitritt entfällt/);
    expect(mail.html).toMatch(/entfällt/);
    expect(mail.html).toMatch(/02\.09\.2026/);
  });

  test("buildCourseMembershipExitMail states inclusive last term (#310)", () => {
    const mail = buildCourseMembershipExitMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      time: "18:00",
      termDateIso: "2026-08-17",
    });
    expect(mail.subject).toMatch(/Kursaustritt/);
    expect(mail.html).toMatch(/letzter Termin/);
    expect(mail.html).toMatch(/inklusive/);
    expect(mail.html).toMatch(/17\.08\.2026/);
  });

  test("buildCourseMembershipExitChangedMail notes shifted exit (#310)", () => {
    const mail = buildCourseMembershipExitChangedMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      time: "18:00",
      termDateIso: "2026-08-31",
    });
    expect(mail.subject).toMatch(/Austrittstermin geändert/);
    expect(mail.html).toMatch(/Änderung/);
    expect(mail.html).toMatch(/31\.08\.2026/);
  });

  test("buildCourseMembershipExitClearedMail confirms continued membership (#310)", () => {
    const mail = buildCourseMembershipExitClearedMail({
      nickname: "Luna",
      courseName: "Morgenyoga",
      weekday: "Mon",
      time: "18:00",
    });
    expect(mail.subject).toMatch(/Austritt aufgehoben/);
    expect(mail.html).toMatch(/zurückgenommen/);
    expect(mail.html).toMatch(/Stammmitglied/);
  });
});
