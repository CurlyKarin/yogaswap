import { describe, expect, it } from "vitest";
import { isPlanningModeChangeLocked, isRollingInactiveBlocked } from "shared/courseEditPolicy";

describe("courseEditPolicy", () => {
  it("locks planning mode change for active courses with participants", () => {
    expect(isPlanningModeChangeLocked({ status: "active", participants: ["luna"] })).toBe(true);
    expect(isPlanningModeChangeLocked({ status: "active", participants: [] })).toBe(false);
    expect(isPlanningModeChangeLocked({ status: "draft", participants: ["luna"] })).toBe(false);
  });

  it("blocks inactive transition for active rolling courses with participants", () => {
    expect(
      isRollingInactiveBlocked({
        status: "active",
        planningMode: "rolling_continuous",
        participants: ["luna"],
      }),
    ).toBe(true);
    expect(
      isRollingInactiveBlocked({
        status: "active",
        planningMode: "bounded_series",
        participants: ["luna"],
      }),
    ).toBe(false);
  });
});
