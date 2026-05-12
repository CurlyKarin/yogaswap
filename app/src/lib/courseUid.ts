import type { Course } from "shared/types";

/**
 * Optionale courseUid für neue Client-seitige Overrides (#125), analog zum Backend-Dual-Write.
 */
export function overrideCourseUidFields(
  course: Pick<Course, "courseUid">,
): { courseUid: string } | Record<string, never> {
  const uid = course.courseUid?.trim();
  return uid ? { courseUid: uid } : {};
}

/**
 * Optionale fromCourseUid / toCourseUid für Swap-Payloads (#125).
 */
export function swapCourseUidFields(
  fromCourse: Pick<Course, "courseUid">,
  toCourse: Pick<Course, "courseUid">,
): { fromCourseUid?: string; toCourseUid?: string } {
  const fromUid = fromCourse.courseUid?.trim();
  const toUid = toCourse.courseUid?.trim();
  return {
    ...(fromUid ? { fromCourseUid: fromUid } : {}),
    ...(toUid ? { toCourseUid: toUid } : {}),
  };
}
