import { courses } from "../data/courses";
import type { User } from "../types";
import CourseCard from "./CourseCard";

type Props = {
  currentUser: User;
  absences: number[];
  swapRequests: number[];
  onToggleAbsence: (courseId: number) => void;
  onToggleSwap: (courseId: number) => void;
};

export default function CourseList({
  currentUser,
  absences,
  swapRequests,
  onToggleAbsence,
  onToggleSwap,
}: Props) {
  return (
    <div className="grid">
      {courses.map(course => {
        const isEnrolled = currentUser.enrolledCourseIds.includes(course.id);
        const isAbsent = absences.includes(course.id);
        const swapRequested = swapRequests.includes(course.id);
        return (
          <CourseCard
            key={course.id}
            course={course}
            currentUser={currentUser}
            isEnrolled={isEnrolled}
            isAbsent={isAbsent}
            swapRequested={swapRequested}
            onToggleAbsence={onToggleAbsence}
            onToggleSwap={onToggleSwap}
          />
        );
      })}
    </div>
  );
}
