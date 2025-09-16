import { courses } from "../data/courses";
import type { Course, User } from "../types";
import CourseCard from "./CourseCard";
import { courseDateOverrides as initialOverrides } from "../data/courseOverrides";
import { swapes as initialSwaps } from "../data/swapes";
import { useCourseSwaps } from "./useCourseSwaps";
import React from "react";

type Props = {
  currentUser: User;
};

export default function CourseList({ currentUser }: Props) {
  const {
    overrides,
    swaps,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
  } = useCourseSwaps(initialOverrides, initialSwaps );

    // zentrale, termin-spezifische Änderungen im State
// const [overrides, setOverrides] = useState<CourseDateOverride[]>(initialOverrides);
//  const [swaps, setSwaps] = useState<Swap[]>([]);

//export default function CourseList({ currentUser }: Props) {

  function getCourseDates(course: Course) {
    const now = new Date();
    const [hours, minutes] = course.time.split(":").map(Number);
    return course.dates
      .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes))
      .filter((d) => d >= now);
  }


  return (
    <>
      <div className="grid">
        {courses.map((course) => {
          const dates = getCourseDates(course);
          return (
            <CourseCard
              key={course.id}
              course={course}
              currentUser={currentUser}
              dates={dates}
              overrides={overrides}
              swaps={swaps}
              onToggleAbsence={onToggleAbsence}
              confirmSwap={confirmSwap}
              requestSwap={requestSwap}
              cancelSwap={cancelSwap}
            />
          );
        })}
      </div>
    </>
  );
}
