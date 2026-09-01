import type { Course, Swap, UserRole } from "shared/types";

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function matchesParticipant(participantId: string | undefined, nickname: string): boolean {
  return participantId != null && equalsIgnoreCase(participantId, nickname);
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
  nickname: string,
  swaps: Swap[],
): boolean {
  if ((course.instructors ?? []).some((instructor) => equalsIgnoreCase(instructor, nickname))) {
    return true;
  }
  if (course.participants.some((participant) => equalsIgnoreCase(participant, nickname))) {
    return true;
  }
  return swaps.some(
    (swap) =>
      matchesParticipant(swap.participantId, nickname) &&
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
  role: UserRole,
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
