import type { Course, CourseEnrollment, Swap, UserRole } from "shared/types";
import { isActorOnCourseStem } from "shared/courseEnrollment";
import {
  matchesSwapParticipant,
  type ParticipantActor,
} from "shared/participantActor";
import type { WeekOccurrence } from "./courseWeekOccurrences";

function todayIsoLocal(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeAlias(value: string | undefined | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

/**
 * Match course.instructors against nickname, participantId and optional extras
 * (z. B. membership.userId). #406
 */
export function actorMatchesInstructorList(
  instructors: string[] | undefined,
  actor: ParticipantActor,
  extraAliases: Array<string | undefined | null> = [],
): boolean {
  const wanted = new Set<string>();
  for (const value of [actor.nickname, actor.participantId, ...extraAliases]) {
    const normalized = normalizeAlias(value);
    if (normalized) wanted.add(normalized);
  }
  if (wanted.size === 0) return false;
  return (instructors ?? []).some((entry) => {
    const normalized = normalizeAlias(entry);
    return normalized != null && wanted.has(normalized);
  });
}

/** True if the actor is listed as instructor on at least one course (#406). */
export function hasInstructorAssignment(
  courses: Course[],
  actorOrNickname: ParticipantActor | string,
  extraAliases: Array<string | undefined | null> = [],
): boolean {
  const actor: ParticipantActor =
    typeof actorOrNickname === "string"
      ? { nickname: actorOrNickname }
      : actorOrNickname;
  return courses.some((course) =>
    actorMatchesInstructorList(course.instructors, actor, extraAliases),
  );
}

/** Stammplatz oder Instructor-Zuweisung am Kurs (nicht nur Tausch). #384: Stamm via stemOn. */
export function hasStemOrInstructorInvolvement(
  course: Course,
  actor: ParticipantActor,
  enrollments?: CourseEnrollment[] | null,
  todayIso: string = todayIsoLocal(),
  extraAliases: Array<string | undefined | null> = [],
): boolean {
  if (actorMatchesInstructorList(course.instructors, actor, extraAliases)) {
    return true;
  }
  return isActorOnCourseStem(course, enrollments, actor, todayIso);
}

/**
 * Personal involvement for the week filter:
 * instructor assignment, stem participation, or a swap involving the course.
 */
export function isPersonallyInvolvedInCourse(
  course: Course,
  actor: ParticipantActor,
  swaps: Swap[],
  enrollments?: CourseEnrollment[] | null,
  extraAliases: Array<string | undefined | null> = [],
): boolean {
  if (hasStemOrInstructorInvolvement(course, actor, enrollments, todayIsoLocal(), extraAliases)) {
    return true;
  }
  return swaps.some(
    (swap) =>
      matchesSwapParticipant(swap, actor) &&
      (swap.fromCourseId === course.id || swap.toCourseId === course.id),
  );
}

/**
 * Mind. eine relevante Beteiligung für Hinweistexte (#406):
 * Instructor-Zuweisung, Stamm oder Tausch.
 */
export function hasRelevantMyCoursesInvolvement(
  courses: Course[],
  actor: ParticipantActor,
  swaps: Swap[],
  enrollments?: CourseEnrollment[] | null,
  extraAliases: Array<string | undefined | null> = [],
): boolean {
  return courses.some((course) =>
    isPersonallyInvolvedInCourse(course, actor, swaps, enrollments, extraAliases),
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
  enrollments?: CourseEnrollment[] | null,
  extraAliases: Array<string | undefined | null> = [],
): WeekOccurrence[] {
  if (hasStemOrInstructorInvolvement(course, actor, enrollments, todayIsoLocal(), extraAliases)) {
    return occurrences;
  }
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
 * Role defaults for the week-view „nur meine Kurse“ toggle (#406).
 * - Teilnehmende: Toggle an, Default gefiltert.
 * - Admin/Kursleitung: Toggle immer an (auch ohne erkannte Zuordnung), Default alle Kurse.
 *   Filter wirkt über course.instructors (+ Stamm/Tausch), sobald Daten da sind.
 */
export function resolveMyCoursesToggle(role: UserRole): MyCoursesToggleResolution {
  if (role === "participant") {
    return { canToggle: true, defaultOnlyMy: true };
  }
  return { canToggle: true, defaultOnlyMy: false };
}
