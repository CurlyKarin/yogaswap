import { CourseDateOverride } from "@shared/types";
import type { Course } from "../types";

export const getEffectiveParticipants = (course: Course, overrides: CourseDateOverride[], dateIso: string) => {
  const override = overrides.find((o) => o.courseId === course.id && o.date === dateIso);
  if (override) {
    return override.participants;
  } else {
    return course.participants;
  }
};