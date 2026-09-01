import type { Course, Swap } from "@yogaswap/shared";
import type { RingCycle } from "./ringSwapGraph";
import type { RingCyclePlan } from "./ringSwapExecution";

function courseLabel(courseId: number, date: string, courses: Course[]): string {
  const course = courses.find((c) => c.id === courseId);
  const name = course?.name ?? `Kurs ${courseId}`;
  return `${name} @ ${date}`;
}

export function formatSwapLeg(swap: Swap, courses: Course[]): string {
  return `${swap.participantId}: ${courseLabel(swap.fromCourseId, swap.fromDate, courses)} → ${courseLabel(swap.toCourseId, swap.toDate, courses)}`;
}

export function formatCycleChain(cycle: RingCycle): string {
  const users = cycle.edges.map((edge) => edge.swap.participantId);
  if (users.length === 0) return "(leer)";
  return [...users, users[0]].join(" → ");
}

export type ExecutedRingLog = {
  chain: string;
  activated: string[];
  deletedAlternates: string[];
  overridesUpdated: number;
};

export type RejectedRingLog = {
  chain: string;
  reason: string;
};

export type RingSwapRunLog = {
  tenantId: string;
  userId?: string | null;
  diagnostics: {
    pendingSwaps: number;
    graphNodes: number;
    graphEdges: number;
    detectedCycles: number;
    selectedCycles: number;
    executedCycles: number;
    rejectedCycles: number;
    droppedSwaps: number;
  };
  executedRings?: ExecutedRingLog[];
  rejectedRings?: RejectedRingLog[];
};

function buildOutcome(log: RingSwapRunLog): string {
  const { diagnostics } = log;
  if (diagnostics.executedCycles > 0) {
    return `${diagnostics.executedCycles} Ring ausgeführt`;
  }
  if (diagnostics.detectedCycles === 0) {
    return "kein Zyklus";
  }
  if (diagnostics.rejectedCycles > 0) {
    return "Zyklus verworfen";
  }
  return "keine Ausführung";
}

/**
 * One summary line per Lambda run. Structured JSON only when rings were executed.
 */
export function logRingSwapRun(log: RingSwapRunLog): void {
  const actor = log.userId ? ` actor=${log.userId}` : "";
  const d = log.diagnostics;
  const rings = [
    ...(log.executedRings?.map((ring) => ring.chain) ?? []),
    ...(log.rejectedRings?.map((ring) => ring.chain) ?? []),
  ].join("; ");

  const summary =
    `[processRingSwaps] tenant=${log.tenantId}${actor} | ${buildOutcome(log)}` +
    ` | pending=${d.pendingSwaps} nodes=${d.graphNodes} edges=${d.graphEdges}` +
    ` detected=${d.detectedCycles} executed=${d.executedCycles} rejected=${d.rejectedCycles}` +
    (rings ? ` | ${rings}` : "");

  console.log(summary);

  if (log.executedRings && log.executedRings.length > 0) {
    console.log(
      JSON.stringify({
        event: "ring_swap_executed",
        tenantId: log.tenantId,
        diagnostics: d,
        rings: log.executedRings,
      }),
    );
  }

  if (log.rejectedRings && log.rejectedRings.length > 0) {
    console.log(
      JSON.stringify({
        event: "ring_swap_rejected",
        tenantId: log.tenantId,
        diagnostics: d,
        rings: log.rejectedRings,
      }),
    );
  }
}

export function logCycleRejected(users: string[], reason: string): void {
  console.warn(`[processRingSwaps] Zyklus verworfen [${users.join(", ")}]: ${reason}`);
}

export function logCycleTransactionConflict(users: string[]): void {
  console.warn(
    `[processRingSwaps] Transaktionskonflikt [${users.join(", ")}] — paralleler Lauf oder veralteter Stand`,
  );
}

export function buildExecutedRingLog(
  cycle: RingCycle,
  plan: RingCyclePlan,
  courses: Course[],
): ExecutedRingLog {
  return {
    chain: formatCycleChain(cycle),
    activated: plan.swapActivations.map((swap) => formatSwapLeg(swap, courses)),
    deletedAlternates: plan.swapDeletions.map((swap) => formatSwapLeg(swap, courses)),
    overridesUpdated: plan.overrideWrites.length,
  };
}

export function buildRejectedRingLog(cycle: RingCycle, reason: string): RejectedRingLog {
  return {
    chain: formatCycleChain(cycle),
    reason,
  };
}
