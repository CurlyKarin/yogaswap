import { CourseDateOverride } from "@shared/index";
import type { Course, User} from "../types";
import type { SwapSettings } from "../types";

export function getSwapOptions(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  referenceCourse: Course,
  referenceDateIso: string,
  currentUser: User,
  swapSettings: SwapSettings
) {
  const refDate = new Date(referenceDateIso);
  const minDate = new Date(refDate);
  minDate.setDate(refDate.getDate() + swapSettings.minOffsetDays);
  const maxDate = new Date(refDate);
  maxDate.setDate(refDate.getDate() + swapSettings.maxOffsetDays);

  return allCourses.flatMap((course) => {
    // nicht denselben Kurs anbieten
    if (course.id === referenceCourse.id) return [];

    const courseDates = course.dates.map((d) => new Date(d));
    return courseDates
      .filter((d) => d >= minDate && d <= maxDate)
      .map((d) => {
        const override = overrides.find(
          (o) =>
            o.courseId === course.id &&
            new Date(o.date).toDateString() === d.toDateString()
        );

        const participants = override
          ? override.participants
          : course.participants;

        // Teilnehmer darf keinen Termin in Kursen sehen, in denen er selbst eingeschrieben ist
        if (currentUser.enrolledCourseIds.includes(course.id)) return null;

        const freeSpots = course.capacity - participants.length;
        if (freeSpots <= 0) return null;

        return {
          courseId: course.id,
          courseName: course.name,
          dateIso: d.toISOString(),
          freeSpots,
        };
      })
      .filter(Boolean);
  });
}
