import { courses } from "../data/courses";
import type { Course, User } from "../types";
import CourseCard from "./CourseCard";

type Props = {
  currentUser: User;
  absences: number[];
  swapRequests: number[];
  onToggleAbsence: (courseId: number) => void;
  onToggleSwap: (courseId: number) => void;
};

// 


export default function CourseList({
  currentUser,
  absences,
  swapRequests,
  onToggleAbsence,
  onToggleSwap,
}: Props) {
  function getCourseDates(course: Course) {
  const now = new Date();
  const [hours, minutes] = course.time.split(":").map(Number);

  return course.dates
    .map(date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes))
    .filter(date => date >= now);
}

  return (
    <div className="grid">
      {courses.map(course => (
        <CourseCard
          key={course.id}
          course={course}
          currentUser={currentUser}
          isEnrolled={currentUser.enrolledCourseIds.includes(course.id)}
          isAbsent={absences.includes(course.id)}
          swapRequested={swapRequests.includes(course.id)}
          onToggleAbsence={onToggleAbsence}
          onToggleSwap={onToggleSwap}
          dates={getCourseDates(course)} // Übergeben der Terminliste an die CourseCard-Komponente
        />
      ))}
    </div>
  );
}