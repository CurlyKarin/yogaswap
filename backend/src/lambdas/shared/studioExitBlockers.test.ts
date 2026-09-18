import {
  enrollmentBlocksStudioExit,
  hasStudioExitBlockers,
  listIncludesParticipantRef,
  matchRefsForParticipant,
  type StudioExitBlockers,
} from "./studioExitBlockers";

describe("studioExitBlockers helpers", () => {
  test("matchRefsForParticipant includes nickname and participantId", () => {
    expect([...matchRefsForParticipant("Alice", "pid-1")].sort()).toEqual([
      "alice",
      "pid-1",
    ]);
  });

  test("listIncludesParticipantRef is case-insensitive", () => {
    const refs = matchRefsForParticipant("Alice");
    expect(listIncludesParticipantRef(["bob", "ALICE"], refs)).toBe(true);
    expect(listIncludesParticipantRef(["bob"], refs)).toBe(false);
  });

  test("enrollmentBlocksStudioExit for open and future until", () => {
    expect(enrollmentBlocksStudioExit({}, "2026-09-18")).toBe(true);
    expect(enrollmentBlocksStudioExit({ validUntil: "" }, "2026-09-18")).toBe(true);
    expect(enrollmentBlocksStudioExit({ validUntil: "2026-09-18" }, "2026-09-18")).toBe(true);
    expect(enrollmentBlocksStudioExit({ validUntil: "2026-09-19" }, "2026-09-18")).toBe(true);
    expect(enrollmentBlocksStudioExit({ validUntil: "2026-09-17" }, "2026-09-18")).toBe(false);
  });

  test("hasStudioExitBlockers", () => {
    const empty: StudioExitBlockers = {
      asOf: "2026-09-18",
      courses: [],
      swaps: [],
      waitlist: [],
    };
    expect(hasStudioExitBlockers(empty)).toBe(false);
    expect(
      hasStudioExitBlockers({
        ...empty,
        courses: [{ courseId: 1, reason: "enrollment" }],
      }),
    ).toBe(true);
  });
});
