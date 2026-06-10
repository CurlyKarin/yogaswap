import { describe, expect, it } from "vitest";
import {
  canCancelSwap,
  canCreateSwapFromOrigin,
  isShortNoticeCancelled,
  isSwapTargetInCutoffWindow,
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

  it("isSwapTargetInCutoffWindow mirrors cutoff window on target term", () => {
    const isoDate = "2099-06-15";
    const time = "10:00";
    const inWindow = new Date(2099, 5, 15, 9, 30);
    const beforeWindow = new Date(2099, 5, 15, 8, 0);
    expect(isSwapTargetInCutoffWindow(isoDate, time, undefined, inWindow)).toBe(true);
    expect(isSwapTargetInCutoffWindow(isoDate, time, undefined, beforeWindow)).toBe(false);
  });

  it("isShortNoticeCancelled is case-insensitive", () => {
    expect(
      isShortNoticeCancelled({ shortNoticeCancellations: ["Alice"] }, "alice"),
    ).toBe(true);
  });

  it("canCancelSwap blocks cancel when origin and target are both past", () => {
    const courses = [
      { id: 1, time: "10:00" },
      { id: 2, time: "10:00" },
    ];
    const now = new Date(2026, 0, 1, 12, 0);
    const swap = {
      fromCourseId: 1,
      fromDate: "2020-01-06",
      toCourseId: 2,
      toDate: "2020-01-13",
    };

    expect(canCancelSwap(swap, courses, now)).toBe(false);
  });

  it("canCancelSwap allows cancel when target is still in the future", () => {
    const courses = [
      { id: 1, time: "10:00" },
      { id: 2, time: "10:00" },
    ];
    const now = new Date(2020, 0, 10, 12, 0);
    const swap = {
      fromCourseId: 1,
      fromDate: "2020-01-06",
      toCourseId: 2,
      toDate: "2099-06-20",
    };

    expect(canCancelSwap(swap, courses, now)).toBe(true);
  });
});
