import { Course, CourseDateOverride } from "shared/types";
import { resolveEffectiveTermParticipants } from "shared/overrideOccupancy";
import type { ParticipantWithStatus } from "../api/participants";

export const getEffectiveParticipants = (
  course: Course,
  overrides: CourseDateOverride[],
  dateIso: string,
) => {
  const override = overrides.find((o) => o.courseId === course.id && o.date === dateIso);
  return resolveEffectiveTermParticipants(course, override).participants;
};

export type ParticipantStatusPresentation = {
  color: string;
  label: string;
};

export function getStatusPresentation(
  status: ParticipantWithStatus["status"],
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