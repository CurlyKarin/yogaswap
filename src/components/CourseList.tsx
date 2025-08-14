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
        // Hier können wir die Terminliste für den Kurs zurückgeben
        // Zum Beispiel aus einer Datenbank oder einem API-Call
        return [
            new Date('2023-03-01'),
            new Date('2023-03-08'),
            new Date('2023-03-15'),
            // ...
        ];
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