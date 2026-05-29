import { describe, expect, it } from "vitest";
import {
  canPromoteFromWaitlist,
  hasBookingCapacity,
  resolveMaxCapacity,
  resolveOverbookLimit,
  validateOverbookLimit,
  validateParticipantListSize,
} from "shared/courseCapacity";

describe("courseCapacity", () => {
  const course = { capacity: 10, overbookLimit: 2 };

  it("resolveOverbookLimit defaults invalid to 0", () => {
    expect(resolveOverbookLimit({ capacity: 5 })).toBe(0);
    expect(resolveOverbookLimit({ capacity: 5, overbookLimit: -1 })).toBe(0);
    expect(resolveOverbookLimit({ capacity: 5, overbookLimit: 3 })).toBe(3);
  });

  it("resolveMaxCapacity sums capacity and overbook", () => {
    expect(resolveMaxCapacity(course)).toBe(12);
    expect(resolveMaxCapacity({ capacity: 4 })).toBe(4);
  });

  it("hasBookingCapacity allows up to max", () => {
    expect(hasBookingCapacity(11, course)).toBe(true);
    expect(hasBookingCapacity(12, course)).toBe(false);
  });

  it("canPromoteFromWaitlist only below regular capacity", () => {
    expect(canPromoteFromWaitlist(9, course)).toBe(true);
    expect(canPromoteFromWaitlist(10, course)).toBe(false);
    expect(canPromoteFromWaitlist(11, course)).toBe(false);
  });

  it("validateOverbookLimit rejects invalid values", () => {
    expect(validateOverbookLimit(10, -1)).toMatch(/nicht-negative/);
    expect(validateOverbookLimit(10, 2)).toBeNull();
  });

  it("boundary counts capacity-1, capacity, maxCapacity, maxCapacity+1", () => {
    const small = { capacity: 4, overbookLimit: 2 };
    expect(hasBookingCapacity(3, small)).toBe(true);
    expect(hasBookingCapacity(4, small)).toBe(true);
    expect(hasBookingCapacity(5, small)).toBe(true);
    expect(hasBookingCapacity(6, small)).toBe(false);
    expect(validateParticipantListSize(6, small)).toBeNull();
    expect(validateParticipantListSize(7, small)).toMatch(/Maximal 6/);
  });
});
