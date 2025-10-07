import { courses } from "../data/courses";
import type { User } from "../types";
import CourseCard from "./CourseCard";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState } from "react";
import { CourseDateOverride, Swap, Course} from "@shared/types";
import { getSwaps } from "../api/swaps";
import { getOverrides } from "../api/overrides";

type Props = {
  currentUser: User;
};

export default function CourseList({ currentUser }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [overrides, setOverrides] = useState<CourseDateOverride[]>([]); // Neu: State für overrides, initial leer
  const {
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    overrides: filteredOverrides
  } = useCourseSwaps(overrides, setOverrides, swaps, setSwaps, currentUser);
  
  useEffect(() => {
    let isCancelled = false;
    const loadOverrides = async () => {
      try {
        const overridesData = await getOverrides(); // Neu: Lade aus api/overrides.ts, optional mit sinceDate: '2025-09-29'
        console.log('Geladene Overrides:', overridesData); // Debugging
        if (!isCancelled) setOverrides(Array.isArray(overridesData) ? overridesData : []);
      } catch (error) {
        console.error('Fehler beim Laden der Overrides', error);
        if (!isCancelled) setOverrides([]);
      }
    };
    loadOverrides();
    return () => {
      isCancelled = true;
    };
  }, []); // Keine Abhängigkeiten, lade nur einmal

  useEffect(() => {
    let isCancelled = false;
    const loadSwaps = async () => {
      if (!currentUser?.nickname) {
        console.error('Kein Benutzer-Nickname, Swaps bleiben leer');
        if (!isCancelled) setSwaps([]);
        return;
      }
      try {
        console.log('Lade Swaps für user:', currentUser.nickname);
        const swapsData = await getSwaps(currentUser.nickname); // Verwende api/swaps.ts
        if (!isCancelled) setSwaps(swapsData); // Setze Swaps, auch wenn leer
      } catch (error) {
        console.error('Fehler beim Laden der Swaps', error);
        if (!isCancelled) setSwaps([]); // Bei Fehler leeres Array
      }
    };
    loadSwaps();
    console.log('useEffect ausgelöst für nickname:', currentUser?.nickname);
    return () => {
      isCancelled = true; // Verhindert Updates nach Unmount
    };
  }, [currentUser?.nickname]);

  // 👉 Debug-Ausgabe bei jedem Swaps-Update
  useEffect(() => {
    console.log('🔄 Overrides updated:', overrides);
    console.log('🔄 Filtered Overrides:', filteredOverrides);
    console.log('🔄 Swaps updated:', swaps);
  }, [overrides, filteredOverrides, swaps]);

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
              overrides={filteredOverrides}
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
