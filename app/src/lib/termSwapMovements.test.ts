import { describe, it, expect } from "vitest";
import type { Course, Swap } from "shared/types";
import { buildTermSwapMovements, swapsTouchingTerm } from "./termSwapMovements";

const yogaBasic: Course = {
  tenantId: "default-tenant",
  id: 1,
  name: "Yoga Basic",
  weekday: "Monday",
  time: "10:00",
  capacity: 10,
  participants: ["alice"],
  dates: ["2099-06-16"],
};

const yogaAdvanced: Course = {
  ...yogaBasic,
  id: 2,
  name: "Yoga Advanced",
  dates: ["2099-06-17"],
};

const activeOut: Swap = {
  participantId: "alice",
  fromCourseId: 1,
  fromDate: "2099-06-16",
  toCourseId: 2,
  toDate: "2099-06-17",
  status: "active",
};

const pendingIn: Swap = {
  participantId: "bob",
  fromCourseId: 2,
  fromDate: "2099-06-17",
  toCourseId: 1,
  toDate: "2099-06-16",
  status: "pending",
};

describe("swapsTouchingTerm", () => {
  it("nimmt Ursprung und Ziel des Termins", () => {
    expect(swapsTouchingTerm([activeOut, pendingIn], 1, "2099-06-16")).toEqual([
      activeOut,
      pendingIn,
    ]);
    expect(swapsTouchingTerm([activeOut], 1, "2099-06-17")).toEqual([]);
  });
});

describe("buildTermSwapMovements", () => {
  it("formatiert Incoming/Outgoing aktiv und pending (#414)", () => {
    const lines = buildTermSwapMovements({
      courseId: 1,
      dateIso: "2099-06-16",
      swaps: [activeOut, pendingIn],
      allCourses: [yogaBasic, yogaAdvanced],
    });

    expect(lines.map((m) => m.line)).toEqual([
      "alice → Yoga Advanced · 17.06.2099",
      "bob Anfrage ← Yoga Advanced · 17.06.2099",
    ]);
  });

  it("nutzt displayName aus participantNameByRef", () => {
    const lines = buildTermSwapMovements({
      courseId: 2,
      dateIso: "2099-06-17",
      swaps: [activeOut],
      allCourses: [yogaBasic, yogaAdvanced],
      participantNameByRef: new Map([["alice", "Alice Muster"]]),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.line).toBe("Alice Muster ← Yoga Basic · 16.06.2099");
    expect(lines[0]?.kind).toBe("incoming_active");
  });
});
