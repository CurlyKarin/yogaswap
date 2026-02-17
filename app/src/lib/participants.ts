import { Course, CourseDateOverride } from "shared/types";

export const getEffectiveParticipants = (course: Course, overrides: CourseDateOverride[], dateIso: string) => {
  const override = overrides.find((o) => o.courseId === course.id && o.date === dateIso);
  if (override) {
    return override.participants;
  } else {
    return course.participants;
  }
};