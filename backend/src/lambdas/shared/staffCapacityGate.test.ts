import { gateStaffOccupancy } from "./staffCapacityGate";

describe("gateStaffOccupancy", () => {
  const course = { capacity: 4, overbookLimit: 2 };

  it("allows occupancy up to maxCapacity", () => {
    const result = gateStaffOccupancy({
      participantCount: 6,
      course,
      guestCount: 0,
      tenantSettings: { staffOverCapacityMode: "warn" },
    });
    expect(result.ok).toBe(true);
  });

  it("returns 409 when warn mode needs confirm", () => {
    const result = gateStaffOccupancy({
      participantCount: 6,
      course,
      guestCount: 1,
      tenantSettings: { staffOverCapacityMode: "warn" },
      confirmExceedMaxCapacity: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(409);
      expect(result.body.code).toBe("capacity_exceeded_needs_confirm");
    }
  });

  it("allows exceed when warn mode confirmed", () => {
    const result = gateStaffOccupancy({
      participantCount: 6,
      course,
      guestCount: 1,
      tenantSettings: { staffOverCapacityMode: "warn" },
      confirmExceedMaxCapacity: true,
    });
    expect(result.ok).toBe(true);
  });

  it("returns 400 when block mode", () => {
    const result = gateStaffOccupancy({
      participantCount: 6,
      course,
      guestCount: 1,
      tenantSettings: { staffOverCapacityMode: "block" },
      confirmExceedMaxCapacity: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.statusCode).toBe(400);
      expect(result.body.code).toBe("capacity_exceeded_blocked");
    }
  });
});
