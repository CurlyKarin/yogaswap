import { Course, CourseDateOverride, CourseEnrollment } from "shared/types";
import { resolveEffectiveTermOccupancy } from "shared/courseEnrollment";
import type { ParticipantWithStatus } from "../api/participants";

export const getEffectiveParticipants = (
  course: Course,
  overrides: CourseDateOverride[],
  dateIso: string,
  enrollments: CourseEnrollment[] = [],
) => {
  const override = overrides.find((o) => o.courseId === course.id && o.date === dateIso);
  return resolveEffectiveTermOccupancy(course, override, enrollments, dateIso).participants;
};

export type ParticipantStatusPresentation = {
  color: string;
  label: string;
};

export function getStatusPresentation(
  status: ParticipantWithStatus["status"] | undefined,
): ParticipantStatusPresentation {
  if (status === "active") {
    return { color: "#16a34a", label: "registriert" };
  }
  if (status === "invited") {
    return { color: "#facc15", label: "eingeladen" };
  }
  return { color: "#fb923c", label: "ohne Login" };
}

export function filterParticipantsBySearch<T extends { userId: string; email?: string }>(
  participants: T[],
  search: string,
): T[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return participants;
  return participants.filter((entry) => {
    const byUserId = entry.userId.toLowerCase().includes(needle);
    const byEmail = (entry.email ?? "").toLowerCase().includes(needle);
    return byUserId || byEmail;
  });
}