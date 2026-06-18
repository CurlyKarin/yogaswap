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

export function resolveGuestCount(anonymousTrialCount?: number): number {
  if (
    typeof anonymousTrialCount === "number" &&
    Number.isInteger(anonymousTrialCount) &&
    anonymousTrialCount >= 0
  ) {
    return anonymousTrialCount;
  }
  return 0;
}

export function resolveEffectiveOccupancy(participantCount: number, guestCount = 0): number {
  return participantCount + resolveGuestCount(guestCount);
}

/** Reguläre Kapazität erreicht oder überschritten (Teilnehmer + Gäste). */
export function isAtRegularCapacity(
  participantCount: number,
  course: CourseCapacityFields,
  guestCount = 0,
): boolean {
  return resolveEffectiveOccupancy(participantCount, guestCount) >= course.capacity;
}

/** Harte Obergrenze (Raum) erreicht oder überschritten (Teilnehmer + Gäste). */
export function isAtMaxCapacity(
  participantCount: number,
  course: CourseCapacityFields,
  guestCount = 0,
): boolean {
  return resolveEffectiveOccupancy(participantCount, guestCount) >= resolveMaxCapacity(course);
}

/** Noch Platz für Buchung/Tausch bis zur harten Obergrenze. */
export function hasBookingCapacity(
  participantCount: number,
  course: CourseCapacityFields,
  guestCount = 0,
): boolean {
  return resolveEffectiveOccupancy(participantCount, guestCount) < resolveMaxCapacity(course);
}

/** Self-Service-Tausch: nur reguläre Plätze, nicht die Überplanungszone. */
export function hasRegularBookingCapacity(
  participantCount: number,
  course: CourseCapacityFields,
  guestCount = 0,
): boolean {
  return resolveEffectiveOccupancy(participantCount, guestCount) < course.capacity;
}

/**
 * Wartelisten-Nachrücken nur, wenn reguläre Kapazität frei ist
 * (Teilnehmerzahl und effektive Belegung inkl. Gäste unter capacity).
 */
export function canPromoteFromWaitlist(
  participantCount: number,
  course: CourseCapacityFields,
  guestCount = 0,
): boolean {
  const guests = resolveGuestCount(guestCount);
  const occupancy = resolveEffectiveOccupancy(participantCount, guests);
  const nextOccupancy = resolveEffectiveOccupancy(participantCount + 1, guests);
  return (
    participantCount < course.capacity &&
    occupancy < course.capacity &&
    nextOccupancy <= resolveMaxCapacity(course)
  );
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

export function validateAnonymousTrialCount(count: unknown): string | null {
  if (count === undefined || count === null) return null;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return "Gastplätze müssen eine nicht-negative ganze Zahl sein.";
  }
  return null;
}

/** Teilnehmerliste darf die harte Raumgrenze nicht überschreiten (ohne Gäste). */
export function validateParticipantListSize(
  participantCount: number,
  course: CourseCapacityFields,
): string | null {
  return validateTermOccupancy(participantCount, course, 0);
}

/** Teilnehmer + Gäste dürfen maxCapacity nicht überschreiten. */
export function validateTermOccupancy(
  participantCount: number,
  course: CourseCapacityFields,
  guestCount = 0,
): string | null {
  const max = resolveMaxCapacity(course);
  const guests = resolveGuestCount(guestCount);
  if (!Number.isInteger(participantCount) || participantCount < 0) {
    return "Teilnehmerzahl muss eine nicht-negative ganze Zahl sein.";
  }
  const guestValidation = validateAnonymousTrialCount(guests);
  if (guestValidation) return guestValidation;
  const effective = resolveEffectiveOccupancy(participantCount, guests);
  if (effective > max) {
    return `Maximal ${max} Plätze erlaubt.`;
  }
  return null;
}
