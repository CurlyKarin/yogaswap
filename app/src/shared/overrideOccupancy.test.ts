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

  it("derives legacy snapshot: RC and swap-in", () => {
    const resolved = resolveEffectiveTermParticipants(course, {
      participants: ["luna", "maya"],
      swapped: ["maya"],
    });
    expect(resolved.cancelledParticipants).toEqual(["karin"]);
    expect(resolved.participants).toEqual(["luna", "maya"]);
    expect(resolved.usedLegacySnapshot).toBe(true);
  });

  it("uses legacy snapshot roster as effective even when swapped lists differ", () => {
    const resolved = resolveEffectiveTermParticipants(
      { participants: ["alice", "bob"] },
      {
        participants: ["carol"],
        swapped: ["alice"],
      },
    );
    expect(resolved.participants).toEqual(["carol"]);
    expect(resolved.usedLegacySnapshot).toBe(true);
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
