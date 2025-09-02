// lib/waitlist.ts
import type { Course, CourseDateOverride } from "../types";
import { sameInstant } from "./dates";

/**
 * Liefert die aktuelle Warteliste für einen Kurs+Termin.
 * Nimmt entweder den Override (falls vorhanden) oder die Basis-Daten.
 */
export function getEffectiveWaitlist(
  course: Course,
  overrides: CourseDateOverride[],
  dateIso: string
): string[] {
  const ov = overrides.find(
    (o) => o.courseId === course.id && sameInstant(new Date(o.date), new Date(dateIso))
  );

  if (ov) {
    return ov.waitlist ?? [];
  }

  // Falls deine Basisdaten auch eine Waitlist hätten, könntest du hier ein Fallback einbauen.
  // In deinem aktuellen Setup existiert die Waitlist aber nur in Overrides:
  return [];
}
