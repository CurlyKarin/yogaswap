import type { Course, Swap } from "shared/types";
import {
  includesParticipantRef,
  matchesSwapParticipant,
  type ParticipantActor,
} from "shared/participantActor";
import type { WeekOccurrence } from "./courseWeekOccurrences";

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** True if the user is listed as instructor on at least one course. */
export function hasInstructorAssignment(courses: Course[], nickname: string): boolean {
  return courses.some((course) =>
    (course.instructors ?? []).some((instructor) => equalsIgnoreCase(instructor, nickname)),
  );
}

/** Stammplatz oder Instructor-Zuweisung am Kurs (nicht nur Tausch). */
export function hasStemOrInstructorInvolvement(
  course: Course,
  actor: ParticipantActor,
): boolean {
  if ((course.instructors ?? []).some((instructor) => equalsIgnoreCase(instructor, actor.nickname))) {
    return true;
  }
  return includesParticipantRef(course.participants, actor);
}

/**
 * Personal involvement for the week filter:
 * instructor assignment, stem participation, or a swap involving the course.
 */
export function isPersonallyInvolvedInCourse(
  course: Course,
  actor: ParticipantActor,
  swaps: Swap[],
): boolean {
  if (hasStemOrInstructorInvolvement(course, actor)) return true;
  return swaps.some(
    (swap) =>
      matchesSwapParticipant(swap, actor) &&
      (swap.fromCourseId === course.id || swap.toCourseId === course.id),
  );
}

/**
 * Termine, an denen die Person diesen Kurs per Swap berührt (#298).
 * `pending` und `active` zählen — beides sind konkrete Tauschtermine.
 */
export function personalSwapDateIsosForCourse(
  courseId: number,
  actor: ParticipantActor,
  swaps: Swap[],
): Set<string> {
  const dates = new Set<string>();
  for (const swap of swaps) {
    if (!matchesSwapParticipant(swap, actor)) continue;
    if (swap.toCourseId === courseId && swap.toDate) dates.add(swap.toDate);
    if (swap.fromCourseId === courseId && swap.fromDate) dates.add(swap.fromDate);
  }
  return dates;
}

/**
 * Bei „nur meine Kurse“: Stamm/Instructor behalten alle KW-Termine;
 * reine Tausch-Beteiligung nur Termine mit eigenem Swap (#298).
 */
export function narrowWeekOccurrencesForOnlyMyCourses(
  course: Course,
  occurrences: WeekOccurrence[],
  actor: ParticipantActor,
  swaps: Swap[],
): WeekOccurrence[] {
  if (hasStemOrInstructorInvolvement(course, actor)) return occurrences;
  const swapDates = personalSwapDateIsosForCourse(course.id, actor, swaps);
  if (swapDates.size === 0) return [];
  return occurrences.filter((occurrence) => swapDates.has(occurrence.dateIso));
}

export type MyCoursesToggleResolution = {
  /** User may switch between all courses and only-my-courses. */
  canToggle: boolean;
  /** Role-based default when the toggle is available. */
  defaultOnlyMy: boolean;
};

/**
 * Role defaults for the week-view „nur meine Kurse“ toggle.
 * Admin/instructor without instructor assignment: disabled, always all courses.
 */
export function resolveMyCoursesToggle(
  role: import("shared/types").UserRole,
  hasAssignment: boolean,
): MyCoursesToggleResolution {
  if (role === "participant") {
    return { canToggle: true, defaultOnlyMy: true };
  }
  if (!hasAssignment) {
    return { canToggle: false, defaultOnlyMy: false };
  }
  return { canToggle: true, defaultOnlyMy: true };
}
