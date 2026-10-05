import { describe, expect, it } from "vitest";
import {
  deriveLegacyOverrideDeltas,
  resolveEffectiveTermParticipants,
  withRegularCancellation,
  withoutRegularCancellation,
} from "shared/overrideOccupancy";

describe("resolveEffectiveTermParticipants", () => {
  const course = { participants: ["luna", "karin"] };

  it("returns stem when no override exists", () => {
    expect(resolveEffectiveTermParticipants(course, null).participants).toEqual(["luna", "karin"]);
  });

  it("uses explicit cancelledParticipants + swapped (delta mode)", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: [],
      cancelledParticipants: ["karin"],
      swapped: ["maya"],
    });
    expect(resolved.participants).toEqual(["luna", "maya"]);
    expect(resolved.usedLegacySnapshot).toBe(false);
  });

  it("keeps SN users in effective list (slot stays occupied)", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: [],
      cancelledParticipants: [],
      shortNoticeCancellations: ["karin"],
    });
    expect(resolved.participants).toEqual(["luna", "karin"]);
  });

  it("guest-only override does not drop stem", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: [],
      cancelledParticipants: [],
    });
    expect(resolved.participants).toEqual(["luna", "karin"]);
    expect(resolved.usedLegacySnapshot).toBe(false);
  });

  it("legacy empty named stub keeps stem (guest/waitlist without cancelledParticipants)", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: [],
    });
    expect(resolved.participants).toEqual(["luna", "karin"]);
    expect(resolved.cancelledParticipants).toEqual([]);
    expect(resolved.usedLegacySnapshot).toBe(true);
  });

  it("derives legacy snapshot: RC and swap-in", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: ["luna", "maya"],
      swapped: ["maya"],
    });
    expect(resolved.cancelledParticipants).toEqual(["karin"]);
    expect(resolved.participants).toEqual(["luna", "maya"]);
    expect(resolved.usedLegacySnapshot).toBe(true);
  });

  it("unions legacy swapped into effective occupancy (#376)", () => {
    const resolved = resolveEffectiveTermParticipants(
      { participants: ["alice", "bob"] },
      {
        participants: ["carol"],
        swapped: ["alice"],
      },
    );
    expect(resolved.participants).toEqual(["carol", "alice"]);
    expect(resolved.usedLegacySnapshot).toBe(true);
  });

  it("treats empty snapshot + swapped as stem plus swap-ins (#376)", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: [],
      swapped: ["maya"],
    });
    expect(resolved.participants).toEqual(["luna", "karin", "maya"]);
    expect(resolved.cancelledParticipants).toEqual([]);
    expect(resolved.swapped).toEqual(["maya"]);
    expect(resolved.usedLegacySnapshot).toBe(true);
  });

  it("keeps swap-in on effective list when marking SN in legacy form (#376)", () => {
    const resolved = resolveEffectiveTermParticipants(
      { participants: ["alice"] },
      {
        participants: [],
        swapped: ["charlie"],
        shortNoticeCancellations: ["charlie"],
      },
    );
    expect(resolved.participants).toContain("charlie");
    expect(resolved.participants).toContain("alice");
  });

  it("accepts explicit stemParticipants override (#303)", () => {
    const resolved = resolveEffectiveTermParticipants(
      course,
      {
        participants: [],
        cancelledParticipants: ["mia"],
        swapped: [],
      },
      { stemParticipants: ["mia", "zoe"] },
    );
    expect(resolved.participants).toEqual(["zoe"]);
  });
});

describe("deriveLegacyOverrideDeltas", () => {
  it("maps stem minus snapshot to cancellations", () => {
    expect(deriveLegacyOverrideDeltas(["a", "b"], ["a"])).toEqual({
      cancelledParticipants: ["b"],
      swapped: [],
    });
  });
});

describe("regular cancellation helpers", () => {
  it("adds and removes cancelled users case-insensitively", () => {
    const withCancel = withRegularCancellation(["Luna"], "karin");
    expect(withCancel).toEqual(["Luna", "karin"]);
    expect(withoutRegularCancellation(withCancel, "KARIN")).toEqual(["Luna"]);
  });
});
