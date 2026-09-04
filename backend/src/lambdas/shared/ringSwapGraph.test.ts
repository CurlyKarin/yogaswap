import type { Swap } from "@yogaswap/shared";
import {
  buildRingSwapGraph,
  findRingCycles,
  selectDisjointCycles,
} from "./ringSwapGraph";

function pendingSwap(input: Partial<Swap> & Pick<Swap, "participantId" | "fromCourseId" | "fromDate" | "toCourseId" | "toDate">): Swap {
  return {
    status: "pending",
    ...input,
  };
}

describe("ringSwapGraph", () => {
  test("builds graph and drops invalid swaps", () => {
    const swaps: Swap[] = [
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      { ...pendingSwap({ participantId: "", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 3, toDate: "2099-06-03" }), status: "pending" },
      { ...pendingSwap({ participantId: "Bob", fromCourseId: 3, fromDate: "2099-06-03", toCourseId: 1, toDate: "2099-06-01" }), status: "active" },
    ];

    const graph = buildRingSwapGraph(swaps);

    expect(graph.nodes).toEqual(["1:2099-06-01", "2:2099-06-02"]);
    expect(graph.adjacency.get("1:2099-06-01")?.length).toBe(1);
    expect(graph.droppedSwaps).toHaveLength(2);
  });

  test("finds a 2-cycle", () => {
    const graph = buildRingSwapGraph([
      pendingSwap({ participantId: "Alice", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "Bob", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
    ]);

    const cycles = findRingCycles(graph);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.nodes).toEqual(["1:2099-06-01", "2:2099-06-02"]);
  });

  test("finds a 3-cycle", () => {
    const graph = buildRingSwapGraph([
      pendingSwap({ participantId: "A", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "B", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 3, toDate: "2099-06-03" }),
      pendingSwap({ participantId: "C", fromCourseId: 3, fromDate: "2099-06-03", toCourseId: 1, toDate: "2099-06-01" }),
    ]);

    const cycles = findRingCycles(graph);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.nodes).toEqual([
      "1:2099-06-01",
      "2:2099-06-02",
      "3:2099-06-03",
    ]);
  });

  test("resolves overlapping cycles conflict-free", () => {
    const graph = buildRingSwapGraph([
      pendingSwap({ participantId: "A", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 2, toDate: "2099-06-02" }),
      pendingSwap({ participantId: "B", fromCourseId: 2, fromDate: "2099-06-02", toCourseId: 1, toDate: "2099-06-01" }),
      pendingSwap({ participantId: "A", fromCourseId: 1, fromDate: "2099-06-01", toCourseId: 3, toDate: "2099-06-03" }),
      pendingSwap({ participantId: "C", fromCourseId: 3, fromDate: "2099-06-03", toCourseId: 1, toDate: "2099-06-01" }),
    ]);

    const cycles = findRingCycles(graph);
    const selected = selectDisjointCycles(cycles);

    expect(cycles.length).toBeGreaterThanOrEqual(2);
    expect(selected).toHaveLength(1);
  });

  test("keeps overbooked targets as normal edges", () => {
    const graph = buildRingSwapGraph([
      pendingSwap({ participantId: "A", fromCourseId: 10, fromDate: "2099-07-01", toCourseId: 20, toDate: "2099-07-02" }),
      pendingSwap({ participantId: "B", fromCourseId: 20, fromDate: "2099-07-02", toCourseId: 10, toDate: "2099-07-01" }),
    ]);
    const cycles = findRingCycles(graph);
    expect(cycles).toHaveLength(1);
  });
});

