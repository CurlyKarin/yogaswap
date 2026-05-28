import { describe, expect, it } from "vitest";
import {
  canCreateSwapFromOrigin,
  isShortNoticeCancelled,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
} from "shared/cancellationSwapCutoff";

describe("cancellationSwapCutoff", () => {
  it("resolveCancellationSwapCutoffMinutes defaults to 60", () => {
    expect(resolveCancellationSwapCutoffMinutes(undefined)).toBe(60);
    expect(resolveCancellationSwapCutoffMinutes({ cancellationSwapCutoffMinutesBeforeStart: 30 })).toBe(30);
  });

  it("isWithinCancellationSwapCutoff uses course time", () => {
    const isoDate = "2099-06-15";
    const time = "10:00";
    const start = new Date(2099, 5, 15, 10, 0);
    const atCutoff = new Date(start.getTime() - 60 * 60 * 1000);
    expect(isWithinCancellationSwapCutoff(isoDate, time, 60, atCutoff)).toBe(true);
    expect(isWithinCancellationSwapCutoff(isoDate, time, 60, new Date(atCutoff.getTime() - 1000))).toBe(false);
  });

  it("cutoff 0 disables cutoff checks", () => {
    const isoDate = "2099-06-15";
    const time = "10:00";
    const afterStart = new Date(2099, 5, 15, 10, 30);
    expect(isWithinCancellationSwapCutoff(isoDate, time, 0, afterStart)).toBe(false);
    expect(
      canCreateSwapFromOrigin({
        isoDate,
        courseTime: time,
        tenantSettings: { cancellationSwapCutoffMinutesBeforeStart: 0 },
        userName: "alice",
        participants: ["alice"],
        originallyParticipant: true,
        now: afterStart,
      }),
    ).toBe(true);
  });

  it("canCreateSwapFromOrigin blocks SN", () => {
    const override = {
      courseId: 1,
      date: "2099-06-15",
      participants: ["alice"],
      shortNoticeCancellations: ["alice"],
    };
    expect(
      canCreateSwapFromOrigin({
        isoDate: "2099-06-15",
        courseTime: "10:00",
        override,
        userName: "alice",
        participants: ["alice"],
        originallyParticipant: true,
        now: new Date(2099, 5, 15, 8, 0),
      }),
    ).toBe(false);
  });

  it("isShortNoticeCancelled is case-insensitive", () => {
    expect(
      isShortNoticeCancelled({ shortNoticeCancellations: ["Alice"] }, "alice"),
    ).toBe(true);
  });
});
