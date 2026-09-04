import type { Course, Swap } from "shared/types";
import {
  includesParticipantRef,
  matchesSwapParticipant,
  type ParticipantActor,
} from "shared/participantActor";

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** True if the user is listed as instructor on at least one course. */
export function hasInstructorAssignment(courses: Course[], nickname: string): boolean {
  return courses.some((course) =>
    (course.instructors ?? []).some((instructor) => equalsIgnoreCase(instructor, nickname)),
  );
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
  if ((course.instructors ?? []).some((instructor) => equalsIgnoreCase(instructor, actor.nickname))) {
    return true;
  }
  if (includesParticipantRef(course.participants, actor)) {
    return true;
  }
  return swaps.some(
    (swap) =>
      matchesSwapParticipant(swap, actor) &&
      (swap.fromCourseId === course.id || swap.toCourseId === course.id),
  );
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
