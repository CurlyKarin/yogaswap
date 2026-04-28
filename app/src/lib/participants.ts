import { Course, CourseDateOverride } from "shared/types";
import type { ParticipantWithStatus } from "../api/participants";

export const getEffectiveParticipants = (course: Course, overrides: CourseDateOverride[], dateIso: string) => {
  const override = overrides.find((o) => o.courseId === course.id && o.date === dateIso);
  if (override) {
    return override.participants;
  } else {
    return course.participants;
  }
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