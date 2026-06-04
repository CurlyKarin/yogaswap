import type { Course } from "./types";

export type CourseCapacityFields = Pick<Course, "capacity" | "overbookLimit">;

export function resolveOverbookLimit(course: CourseCapacityFields): number {
  const value = course.overbookLimit;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  return 0;
}

export function resolveMaxCapacity(course: CourseCapacityFields): number {
  return course.capacity + resolveOverbookLimit(course);
}

/** Reguläre Kapazität erreicht oder überschritten (Anzeige „voll“ im Sinne von capacity). */
export function isAtRegularCapacity(participantCount: number, course: CourseCapacityFields): boolean {
  return participantCount >= course.capacity;
}

/** Harte Obergrenze (Raum) erreicht oder überschritten. */
export function isAtMaxCapacity(participantCount: number, course: CourseCapacityFields): boolean {
  return participantCount >= resolveMaxCapacity(course);
}

/** Noch Platz für Buchung/Tausch bis zur harten Obergrenze. */
export function hasBookingCapacity(participantCount: number, course: CourseCapacityFields): boolean {
  return participantCount < resolveMaxCapacity(course);
}

/** Self-Service-Tausch: nur reguläre Plätze, nicht die Überplanungszone. */
export function hasRegularBookingCapacity(
  participantCount: number,
  course: CourseCapacityFields,
): boolean {
  return participantCount < course.capacity;
}

/**
 * Wartelisten-Nachrücken nur, wenn die Teilnehmerzahl unter die reguläre capacity fällt
 * (nicht allein weil Überbuchungszone noch Platz hätte).
 */
export function canPromoteFromWaitlist(participantCount: number, course: CourseCapacityFields): boolean {
  return participantCount < course.capacity && hasBookingCapacity(participantCount, course);
}

export function validateOverbookLimit(
  capacity: number,
  overbookLimit: number | undefined,
): string | null {
  if (overbookLimit == null) return null;
  if (!Number.isInteger(overbookLimit) || overbookLimit < 0) {
    return "Überplanung muss eine nicht-negative ganze Zahl sein.";
  }
  if (!Number.isInteger(capacity) || capacity < 0) {
    return "Kapazität muss eine nicht-negative ganze Zahl sein.";
  }
  return null;
}

/** Teilnehmerliste darf die harte Raumgrenze nicht überschreiten. */
export function validateParticipantListSize(
  participantCount: number,
  course: CourseCapacityFields,
): string | null {
  const max = resolveMaxCapacity(course);
  if (!Number.isInteger(participantCount) || participantCount < 0) {
    return "Teilnehmerzahl muss eine nicht-negative ganze Zahl sein.";
  }
  if (participantCount > max) {
    return `Maximal ${max} Teilnehmer erlaubt.`;
  }
  return null;
}
