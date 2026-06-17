import type { Swap } from "@yogaswap/shared";
import { buildRingSwapGraph, findRingCycles, selectDisjointCycles } from "./ringSwapGraph";
import { planRingCycleExecution } from "./ringSwapExecution";
import type { Course } from "@yogaswap/shared";

function pendingSwap(
  input: Partial<Swap> & Pick<Swap, "user" | "fromCourseId" | "fromDate" | "toCourseId" | "toDate">,
): Swap {
  return { status: "pending", ...input };
}

const courses: Course[] = [
  {
    id: 1,
    name: "A",
    weekday: "Mon",
    time: "10:00",
    capacity: 2,
    overbookLimit: 0,
    participants: ["Alice"],
    dates: ["2099-06-01"],
  },
  {
    id: 2,
    name: "B",
    weekday: "Tue",
    time: "10:00",
    capacity: 2,
    overbookLimit: 0,
    participants: ["Bob"],
    dates: ["2099-06-02"],
  },
  {
    id: 3,
    name: "C",
    weekday: "Wed",
    time: "10:00",
    capacity: 2,
    overbookLimit: 0,
    participants: ["Carol"],
    dates: ["2099-06-03"],
  },
];

describe("ringSwapPipeline", () => {
  test("selects one disjoint cycle from overlapping candidates and plans it", () => {
    const pendingSwaps = [
      pendingSwap({ user: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ user: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
      pendingSwap({ user: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 3, toDate: "2099-06-03" }),
      pendingSwap({ user: "Carol", fromCourseId: 3, fromDate: "2099-06-03", toCourseId: 1, toDate: "2099-06-01" }),
    ];

    const graph = buildRingSwapGraph(pendingSwaps);
    const cycles = findRingCycles(graph);
    const selected = selectDisjointCycles(cycles);

    expect(cycles.length).toBeGreaterThanOrEqual(2);
    expect(selected).toHaveLength(1);

    const planned = planRingCycleExecution(selected[0]!, {
      courses,
      overrides: [],
      pendingSwaps,
      now: new Date("2099-01-01T10:00:00Z"),
    });

    expect(planned.ok).toBe(true);
  });
});
