import { resolveSelfServiceAbsenceKind } from "./resolveSelfServiceAbsenceKind";

describe("resolveSelfServiceAbsenceKind", () => {
  const baseParticipants = ["luna", "bob"];
  const dateIso = "2099-06-16";
  const courseTime = "18:00";

  test("detects rechtzeitige Absage (Platz freigegeben)", () => {
    expect(
      resolveSelfServiceAbsenceKind({
        actorNickname: "luna",
        courseTime,
        dateIso,
        before: {
          courseId: 1,
          date: dateIso,
          participants: ["luna", "bob"],
        },
        after: {
          courseId: 1,
          date: dateIso,
          participants: ["bob"],
        },
        baseParticipants,
      }),
    ).toBe("term_released");
  });

  test("sends no mail for kurzfristige Absage", () => {
    expect(
      resolveSelfServiceAbsenceKind({
        actorNickname: "luna",
        courseTime,
        dateIso: "2000-01-01",
        before: {
          courseId: 1,
          date: "2000-01-01",
          participants: ["luna"],
        },
        after: {
          courseId: 1,
          date: "2000-01-01",
          participants: ["luna"],
          shortNoticeCancellations: ["luna"],
        },
        baseParticipants: ["luna"],
        now: new Date("1999-12-31T12:00:00"),
      }),
    ).toBeNull();
  });
});
