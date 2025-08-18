// lib/dates.ts
import type { Course, CourseDateOverride, User, SwapSettings } from "../types";

export function getAvailableDates(
  allCourses: Course[],
  overrides: CourseDateOverride[],
  currentUser: User,
  settings: SwapSettings,
  excludeCourseIds: number[],
  referenceDate: Date
) {
  const { minOffsetDays, maxOffsetDays } = settings;

  const minDate = new Date(referenceDate);
  minDate.setDate(minDate.getDate() + minOffsetDays);

  const maxDate = new Date(referenceDate);
  maxDate.setDate(maxDate.getDate() + maxOffsetDays);

  return allCourses.flatMap(course => 
    excludeCourseIds.includes(course.id) ? [] : 
    course.dates
      .map(d => new Date(d))
      .filter(d => d >= minDate && d <= maxDate)
      .map(d => {
        const o = overrides.find(o => o.courseId === course.id && o.date === d.toISOString());
        const participants = o ? o.participants : course.participants;
        const isFull = participants.length >= course.capacity;
        return { course, date: d, isFull };
      })
      .filter(x => !x.isFull)
  );
}
