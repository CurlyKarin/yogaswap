import { describe, expect, it } from "vitest";
import {
  canPromoteFromWaitlist,
  hasBookingCapacity,
  hasRegularBookingCapacity,
  isAtRegularCapacity,
  resolveEffectiveOccupancy,
  resolveGuestCount,
  resolveMaxCapacity,
  resolveOverbookLimit,
  validateAnonymousTrialCount,
  validateOverbookLimit,
  validateParticipantListSize,
  validateTermOccupancy,
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

  it("hasRegularBookingCapacity allows only below regular capacity", () => {
    expect(hasRegularBookingCapacity(9, course)).toBe(true);
    expect(hasRegularBookingCapacity(10, course)).toBe(false);
    expect(hasRegularBookingCapacity(11, course)).toBe(false);
  });

  it("canPromoteFromWaitlist only below regular capacity", () => {
    expect(canPromoteFromWaitlist(9, course)).toBe(true);
    expect(canPromoteFromWaitlist(10, course)).toBe(false);
    expect(canPromoteFromWaitlist(11, course)).toBe(false);
  });

  it("counts guest seats toward maxCapacity and regular fullness", () => {
    const small = { capacity: 8, overbookLimit: 2 };
    expect(resolveEffectiveOccupancy(7, 1)).toBe(8);
    expect(isAtRegularCapacity(7, small, 1)).toBe(true);
    expect(hasRegularBookingCapacity(7, small, 1)).toBe(false);
    expect(validateTermOccupancy(7, small, 1)).toBeNull();
    expect(validateTermOccupancy(8, small, 3)).toMatch(/Maximal 10/);
  });

  it("canPromoteFromWaitlist blocks while guests fill regular capacity", () => {
    const term = { capacity: 8, overbookLimit: 2 };
    expect(canPromoteFromWaitlist(7, term, 1)).toBe(false);
    expect(canPromoteFromWaitlist(6, term, 1)).toBe(true);
    expect(canPromoteFromWaitlist(7, term, 0)).toBe(true);
  });

  it("validateAnonymousTrialCount rejects invalid values", () => {
    expect(validateAnonymousTrialCount(-1)).toMatch(/nicht-negative/);
    expect(validateAnonymousTrialCount(2)).toBeNull();
    expect(resolveGuestCount(undefined)).toBe(0);
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
    expect(validateTermOccupancy(5, small, 1)).toBeNull();
    expect(validateTermOccupancy(5, small, 2)).toMatch(/Maximal 6/);
  });
});
