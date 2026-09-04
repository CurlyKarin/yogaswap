import type { Swap } from "@yogaswap/shared";

export type RingNodeKey = string;

export type RingEdge = {
  from: RingNodeKey;
  to: RingNodeKey;
  swap: Swap;
};

export type RingSwapGraph = {
  nodes: RingNodeKey[];
  adjacency: Map<RingNodeKey, RingEdge[]>;
  droppedSwaps: Swap[];
};

export type RingCycle = {
  nodes: RingNodeKey[];
  edges: RingEdge[];
};

export type RingGraphLimits = {
  maxNodes: number;
  maxEdges: number;
  maxCycleLength: number;
  maxCycles: number;
};

export const DEFAULT_RING_GRAPH_LIMITS: RingGraphLimits = {
  maxNodes: 500,
  maxEdges: 2000,
  maxCycleLength: 8,
  maxCycles: 200,
};

function normalized(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function makeNodeKey(courseId: number, dateIso: string): RingNodeKey {
  return `${courseId}:${dateIso}`;
}

function makeSwapKey(swap: Swap): string {
  return [
    normalized(swap.participantId),
    swap.fromCourseId,
    swap.fromDate,
    swap.toCourseId,
    swap.toDate,
  ].join("|");
}

function isValidPendingSwap(swap: Swap): boolean {
  return (
    swap.status === "pending" &&
    Number.isFinite(swap.fromCourseId) &&
    Number.isFinite(swap.toCourseId) &&
    !!swap.fromDate &&
    !!swap.toDate &&
    normalized(swap.participantId).length > 0
  );
}

/**
 * Read-only graph building for ring swaps (#220).
 * Keeps only valid pending swaps and removes duplicate edges deterministically.
 */
export function buildRingSwapGraph(swaps: Swap[], limits: RingGraphLimits = DEFAULT_RING_GRAPH_LIMITS): RingSwapGraph {
  const adjacency = new Map<RingNodeKey, RingEdge[]>();
  const nodeSet = new Set<RingNodeKey>();
  const dedup = new Set<string>();
  const droppedSwaps: Swap[] = [];

  const sorted = [...swaps].sort((a, b) => makeSwapKey(a).localeCompare(makeSwapKey(b)));

  let edgeCount = 0;
  for (const swap of sorted) {
    if (!isValidPendingSwap(swap)) {
      droppedSwaps.push(swap);
      continue;
    }
    const from = makeNodeKey(swap.fromCourseId, swap.fromDate);
    const to = makeNodeKey(swap.toCourseId, swap.toDate);
    const edgeKey = `${from}->${to}|${normalized(swap.participantId)}`;
    if (dedup.has(edgeKey)) continue;
    dedup.add(edgeKey);

    nodeSet.add(from);
    nodeSet.add(to);
    if (nodeSet.size > limits.maxNodes || edgeCount >= limits.maxEdges) break;

    const edge: RingEdge = { from, to, swap };
    const existing = adjacency.get(from) ?? [];
    existing.push(edge);
    adjacency.set(from, existing);
    edgeCount++;
  }

  const nodes = [...nodeSet].sort((a, b) => a.localeCompare(b));
  for (const [node, edges] of adjacency.entries()) {
    adjacency.set(
      node,
      [...edges].sort((a, b) => {
        if (a.to !== b.to) return a.to.localeCompare(b.to);
        return normalized(a.swap.participantId).localeCompare(normalized(b.swap.participantId));
      }),
    );
  }

  return { nodes, adjacency, droppedSwaps };
}

function cycleSignature(cycle: RingCycle): string {
  const pivot = cycle.nodes.reduce(
    (best, node, index) => (node < cycle.nodes[best] ? index : best),
    0,
  );
  const rotated = [...cycle.nodes.slice(pivot), ...cycle.nodes.slice(0, pivot)];
  return rotated.join("->");
}

/**
 * Iterative cycle detection (no recursion).
 */
export function findRingCycles(
  graph: RingSwapGraph,
  limits: RingGraphLimits = DEFAULT_RING_GRAPH_LIMITS,
): RingCycle[] {
  const seen = new Set<string>();
  const cycles: RingCycle[] = [];

  for (const start of graph.nodes) {
    const stack: Array<{
      node: RingNodeKey;
      pathNodes: RingNodeKey[];
      pathEdges: RingEdge[];
    }> = [{ node: start, pathNodes: [start], pathEdges: [] }];

    while (stack.length > 0) {
      const frame = stack.pop()!;
      const outgoing = graph.adjacency.get(frame.node) ?? [];

      for (const edge of outgoing) {
        if (edge.to === start && frame.pathNodes.length >= 2) {
          const cycle: RingCycle = {
            nodes: frame.pathNodes,
            edges: [...frame.pathEdges, edge],
          };
          if (cycle.nodes.length > limits.maxCycleLength) continue;
          const signature = cycleSignature(cycle);
          if (seen.has(signature)) continue;
          seen.add(signature);
          cycles.push(cycle);
          if (cycles.length >= limits.maxCycles) return cycles;
          continue;
        }

        if (frame.pathNodes.includes(edge.to)) continue;
        if (frame.pathNodes.length >= limits.maxCycleLength) continue;

        stack.push({
          node: edge.to,
          pathNodes: [...frame.pathNodes, edge.to],
          pathEdges: [...frame.pathEdges, edge],
        });
      }
    }
  }

  return cycles.sort((a, b) => {
    if (a.nodes.length !== b.nodes.length) return a.nodes.length - b.nodes.length;
    return cycleSignature(a).localeCompare(cycleSignature(b));
  });
}

/**
 * Select conflict-free cycles; each swap is used at most once per run.
 */
export function selectDisjointCycles(cycles: RingCycle[]): RingCycle[] {
  const selected: RingCycle[] = [];
  const usedSwapKeys = new Set<string>();
  const usedNodes = new Set<RingNodeKey>();

  for (const cycle of cycles) {
    const keys = cycle.edges.map((edge) => makeSwapKey(edge.swap));
    if (keys.some((key) => usedSwapKeys.has(key))) continue;
    if (cycle.nodes.some((node) => usedNodes.has(node))) continue;
    selected.push(cycle);
    keys.forEach((key) => usedSwapKeys.add(key));
    cycle.nodes.forEach((node) => usedNodes.add(node));
  }

  return selected;
}

