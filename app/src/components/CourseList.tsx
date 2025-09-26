import { courses } from "../data/courses";
import type { Course, User } from "../types";
import CourseCard from "./CourseCard";
import { courseDateOverrides as initialOverrides } from "../data/courseOverrides";
import { swapes as initialSwaps } from "../data/swapes";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState } from "react";
import { Swap } from "@shared/types";
import axios from "axios";

type Props = {
  currentUser: User;
};

export default function CourseList({ currentUser }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>(initialSwaps);
  const {
    overrides,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
  } = useCourseSwaps(initialOverrides, swaps, setSwaps );

  useEffect(() => {
    const loadSwaps = async () => {
      if (!currentUser?.nickname) {
        console.error('Kein Benutzer angegeben, fallback auf initialSwaps');
        setSwaps(initialSwaps);
        return;
      }
      try {
        console.log("Currentuser:", currentUser);
        const response = await axios.get('/swaps', { params: { user: currentUser.nickname } });
        setSwaps(response.data);
      } catch (error) {
        console.error('Fehler beim Laden der Swaps', error);
        setSwaps(initialSwaps); // Fallback auf initialSwaps bei Fehler
      }
    };
    loadSwaps();
    console.log("useEffect ausgelöst");
  }, [currentUser?.nickname, initialSwaps]);

  // 👉 Debug-Ausgabe bei jedem Swaps-Update
  useEffect(() => {
     console.log("🔄 Swaps updated:", swaps);
  }, [swaps]);  

  useEffect(() => {
    console.log('useEffect ausgelöst für nickname:', currentUser?.nickname);
  }, [currentUser?.nickname]);

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
