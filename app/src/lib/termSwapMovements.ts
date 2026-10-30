import { formatCourseIsoDateDe } from "shared/courseStatus";
import type { Course, Swap } from "shared/types";
import { displayNameForParticipantRef } from "./participants";

export type TermSwapMovementKind = "outgoing_active" | "incoming_active" | "outgoing_pending" | "incoming_pending";

export type TermSwapMovement = {
  key: string;
  kind: TermSwapMovementKind;
  /** Anzeigename der Person */
  personLabel: string;
  /** Lesbare Einzeile ohne Personennamen (Richtung + Kurs/Datum) */
  directionLabel: string;
  /** Volle Zeile für UI / aria */
  line: string;
};

function courseLabel(allCourses: Course[], courseId: number): string {
  return allCourses.find((c) => c.id === courseId)?.name?.trim() || "Kurs";
}

function personLabelForSwap(
  swap: Swap,
  participantNameByRef?: Map<string, string>,
): string {
  const ref = (swap.participantId ?? "").trim() || "Unbekannt";
  return displayNameForParticipantRef(ref, participantNameByRef);
}

/** Swaps, die diesen Kurstermin als Ursprung oder Ziel berühren. */
export function swapsTouchingTerm(
  swaps: Swap[],
  courseId: number,
  dateIso: string,
): Swap[] {
  return swaps.filter(
    (swap) =>
      (swap.fromCourseId === courseId && swap.fromDate === dateIso) ||
      (swap.toCourseId === courseId && swap.toDate === dateIso),
  );
}

/**
 * Terminweite Tauschbewegungen für Kursverwaltung (#414).
 * Sortierung: aktive Incoming/Outgoing, dann pending Incoming/Outgoing; Person alphabetisch.
 */
export function buildTermSwapMovements(params: {
  courseId: number;
  dateIso: string;
  swaps: Swap[];
  allCourses: Course[];
  participantNameByRef?: Map<string, string>;
}): TermSwapMovement[] {
  const { courseId, dateIso, swaps, allCourses, participantNameByRef } = params;
  const touching = swapsTouchingTerm(swaps, courseId, dateIso);
  const kindOrder: Record<TermSwapMovementKind, number> = {
    incoming_active: 0,
    outgoing_active: 1,
    incoming_pending: 2,
    outgoing_pending: 3,
  };

  const movements: TermSwapMovement[] = touching.map((swap) => {
    const personLabel = personLabelForSwap(swap, participantNameByRef);
    const isOrigin = swap.fromCourseId === courseId && swap.fromDate === dateIso;
    const pending = swap.status === "pending";

    let kind: TermSwapMovementKind;
    let directionLabel: string;
    if (isOrigin) {
      kind = pending ? "outgoing_pending" : "outgoing_active";
      const target = `${courseLabel(allCourses, swap.toCourseId)} · ${formatCourseIsoDateDe(swap.toDate)}`;
      directionLabel = pending ? `Anfrage → ${target}` : `→ ${target}`;
    } else {
      kind = pending ? "incoming_pending" : "incoming_active";
      const origin = `${courseLabel(allCourses, swap.fromCourseId)} · ${formatCourseIsoDateDe(swap.fromDate)}`;
      directionLabel = pending ? `Anfrage ← ${origin}` : `← ${origin}`;
    }

    return {
      key: [
        swap.participantId ?? "",
        swap.fromCourseId,
        swap.fromDate,
        swap.toCourseId,
        swap.toDate,
        swap.status,
      ].join("|"),
      kind,
      personLabel,
      directionLabel,
      line: `${personLabel} ${directionLabel}`,
    };
  });

  return movements.sort((a, b) => {
    const byKind = kindOrder[a.kind] - kindOrder[b.kind];
    if (byKind !== 0) return byKind;
    return a.personLabel.localeCompare(b.personLabel, "de");
  });
}
