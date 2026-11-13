import { describe, expect, it } from "vitest";
import {
  formatWaitlistBufferDuration,
  resolveWaitlistNoPromoteWithinMinutes,
  snapWaitlistBufferMinutes,
  stepWaitlistBufferMinutes,
  waitlistBufferStepMinutes,
} from "shared/waitlistBuffer";

describe("waitlistBuffer (#438)", () => {
  it("defaults to studio cutoff and never goes below it", () => {
    expect(resolveWaitlistNoPromoteWithinMinutes(undefined, 60)).toBe(60);
    expect(resolveWaitlistNoPromoteWithinMinutes(30, 60)).toBe(60);
    expect(resolveWaitlistNoPromoteWithinMinutes(120, 60)).toBe(120);
  });

  it("uses adaptive steps", () => {
    expect(waitlistBufferStepMinutes(45)).toBe(15);
    expect(waitlistBufferStepMinutes(120)).toBe(30);
    expect(waitlistBufferStepMinutes(400)).toBe(60);
  });

  it("steps across zone boundaries", () => {
    expect(stepWaitlistBufferMinutes(105, 1, 60)).toBe(120);
    expect(stepWaitlistBufferMinutes(120, 1, 60)).toBe(150);
    expect(stepWaitlistBufferMinutes(150, -1, 60)).toBe(120);
    expect(stepWaitlistBufferMinutes(120, -1, 60)).toBe(105);
  });

  it("snaps within min/max", () => {
    expect(snapWaitlistBufferMinutes(50, 60)).toBe(60);
    expect(snapWaitlistBufferMinutes(2000, 60)).toBe(1440);
  });

  it("formats durations", () => {
    expect(formatWaitlistBufferDuration(60)).toBe("1 Std.");
    expect(formatWaitlistBufferDuration(90)).toBe("1 Std. 30 Min.");
    expect(formatWaitlistBufferDuration(45)).toBe("45 Min.");
  });
});
