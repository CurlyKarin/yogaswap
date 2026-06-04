import type { CourseDateOverride } from "@yogaswap/shared";
import {
  validateSelfServiceOverrideTransition,
  validateShortNoticeParticipantsInvariant,
} from "./cutoffOverrideValidation";

function makeOverride(partial: Partial<CourseDateOverride> = {}): CourseDateOverride {
  return {
    courseId: 1,
    date: "2099-06-15",
    participants: ["alice"],
    swapped: [],
    waitlist: [],
    shortNoticeCancellations: [],
    ...partial,
  };
}

describe("cutoffOverrideValidation", () => {
  const baseInput = {
    actorNickname: "alice",
    courseTime: "10:00",
    dateIso: "2099-06-15",
    tenantSettings: { cancellationSwapCutoffMinutesBeforeStart: 60 },
    baseParticipants: ["alice"],
  };

  it("fordert für SN-Einträge auch participants", () => {
    const error = validateShortNoticeParticipantsInvariant(
      makeOverride({
        participants: [],
        shortNoticeCancellations: ["alice"],
      }),
    );
    expect(error).toBe("Kurzfristig abgesagte Teilnehmer müssen in der Teilnehmerliste stehen.");
  });

  it("blockiert SN-Setzen außerhalb des Cutoff", () => {
    const before = makeOverride();
    const after = makeOverride({ shortNoticeCancellations: ["alice"] });
    const error = validateSelfServiceOverrideTransition({
      ...baseInput,
      before,
      after,
      now: new Date(2099, 5, 15, 8, 0),
    });
    expect(error).toBe("Kurzfristige Absage ist nur kurz vor Kursbeginn möglich.");
  });

  it("erlaubt SN-Setzen innerhalb des Cutoff bei bestehendem participants-Eintrag", () => {
    const before = makeOverride();
    const after = makeOverride({ shortNoticeCancellations: ["alice"] });
    const error = validateSelfServiceOverrideTransition({
      ...baseInput,
      before,
      after,
      now: new Date(2099, 5, 15, 9, 30),
    });
    expect(error).toBeNull();
  });

  it("erlaubt SN-Rücknahme innerhalb des Cutoff", () => {
    const before = makeOverride({ shortNoticeCancellations: ["alice"] });
    const after = makeOverride({ shortNoticeCancellations: [] });
    const error = validateSelfServiceOverrideTransition({
      ...baseInput,
      before,
      after,
      now: new Date(2099, 5, 15, 9, 30),
    });
    expect(error).toBeNull();
  });

  it("sperrt RC-Entfernung aus participants im Cutoff", () => {
    const before = makeOverride();
    const after = makeOverride({ participants: [] });
    const error = validateSelfServiceOverrideTransition({
      ...baseInput,
      before,
      after,
      now: new Date(2099, 5, 15, 9, 30),
    });
    expect(error).toBe("In diesem Zeitfenster nur kurzfristige Absage möglich (Platz bleibt belegt).");
  });

  it("erlaubt unveränderte Actor-Werte", () => {
    const before = makeOverride();
    const after = makeOverride({ waitlist: ["mia"] });
    const error = validateSelfServiceOverrideTransition({
      ...baseInput,
      before,
      after,
      now: new Date(2099, 5, 15, 9, 30),
    });
    expect(error).toBeNull();
  });
});
