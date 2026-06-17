import type { Course, Swap } from "@yogaswap/shared";
import type { RingCycle } from "./ringSwapGraph";
import { formatCycleChain, formatSwapLeg, logRingSwapRun } from "./ringSwapLogging";

const courses: Course[] = [
  {
    id: 1,
    name: "YogaMo",
    weekday: "Mon",
    time: "10:00",
    capacity: 8,
    overbookLimit: 0,
    participants: [],
    dates: [],
  },
  {
    id: 2,
    name: "YogaDi",
    weekday: "Tue",
    time: "10:00",
    capacity: 8,
    overbookLimit: 0,
    participants: [],
    dates: [],
  },
];

const swap: Swap = {
  user: "Alice",
  fromCourseId: 1,
  fromDate: "2099-06-01",
  toCourseId: 2,
  toDate: "2099-06-02",
  status: "pending",
};

describe("ringSwapLogging", () => {
  test("formatSwapLeg includes course names", () => {
    expect(formatSwapLeg(swap, courses)).toBe(
      "Alice: YogaMo @ 2099-06-01 → YogaDi @ 2099-06-02",
    );
  });

  test("formatCycleChain closes the ring", () => {
    const cycle: RingCycle = {
      nodes: ["1:2099-06-01", "2:2099-06-02"],
      edges: [
        { from: "1:2099-06-01", to: "2:2099-06-02", swap },
        {
          from: "2:2099-06-02",
          to: "1:2099-06-01",
          swap: { ...swap, user: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" },
        },
      ],
    };
    expect(formatCycleChain(cycle)).toBe("Alice → Bob → Alice");
  });

  test("logRingSwapRun writes summary and executed JSON", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    logRingSwapRun({
      tenantId: "default-tenant",
      diagnostics: {
        pendingSwaps: 2,
        graphNodes: 2,
        graphEdges: 2,
        detectedCycles: 1,
        selectedCycles: 1,
        executedCycles: 1,
        rejectedCycles: 0,
        droppedSwaps: 0,
      },
      executedRings: [
        {
          chain: "Alice → Bob → Alice",
          activated: ["Alice: A @ d1 → B @ d2"],
          deletedAlternates: [],
          overridesUpdated: 2,
        },
      ],
    });

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0]?.[0]).toContain("1 Ring ausgeführt");
    expect(logSpy.mock.calls[1]?.[0]).toContain('"event":"ring_swap_executed"');

    logSpy.mockRestore();
  });

  test("logRingSwapRun writes rejected JSON with reason", () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

    logRingSwapRun({
      tenantId: "default-tenant",
      diagnostics: {
        pendingSwaps: 2,
        graphNodes: 2,
        graphEdges: 2,
        detectedCycles: 1,
        selectedCycles: 1,
        executedCycles: 0,
        rejectedCycles: 1,
        droppedSwaps: 0,
      },
      rejectedRings: [{ chain: "Alice → Bob → Alice", reason: "Target cutoff blocks swap for Alice" }],
    });

    expect(logSpy.mock.calls[0]?.[0]).toContain("Zyklus verworfen");
    expect(logSpy.mock.calls[1]?.[0]).toContain('"event":"ring_swap_rejected"');

    logSpy.mockRestore();
  });
});
