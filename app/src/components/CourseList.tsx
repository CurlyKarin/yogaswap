import type { User } from "../types";
import CourseCard from "./CourseCard";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState } from "react";
import { Course, CourseDateOverride, Swap} from "@shared/types";
import { getSwaps } from "../api/swaps";
import { getOverrides } from "../api/overrides";
import { getCourseDates } from "../lib/dates";
import { getCourses } from "../api/courses";

type Props = {
  currentUser: User;
};

export default function CourseList({ currentUser }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [overrides, setOverrides] = useState<CourseDateOverride[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    overrides: filteredOverrides
  } = useCourseSwaps(courses, overrides, setOverrides, swaps, setSwaps, currentUser);
  
 // Lade Kurse und Overrides
  useEffect(() => {
    let isCancelled = false;
    const fetchData = async () => {
      try {
        console.log('Fetching courses and overrides...');
        const [courseData, overrideData] = await Promise.all([
          getCourses(),
          getOverrides(),
        ]);
        console.log('Data fetched:', { courseData, overrideData });
        if (!isCancelled) {
          // Sortiere Kurse nach id (aufsteigend)
          const sortedCourses = courseData.sort((a, b) => a.id - b.id);
          setCourses(sortedCourses);
          setOverrides(Array.isArray(overrideData) ? overrideData : []);
          setLoading(false);
        }
      } catch (err) {
        console.error('Error in fetchData:', err);
        if (!isCancelled) {
          setError('Failed to load data');
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => {
      isCancelled = true;
    };
  }, []);

  // useEffect(() => {
  //   let isCancelled = false;
  //   const loadOverrides = async () => {
  //     try {
  //       const overridesData = await getOverrides(); // Neu: Lade aus api/overrides.ts, optional mit sinceDate: '2025-09-29'
  //       console.log('Geladene Overrides:', overridesData); // Debugging
  //       if (!isCancelled) setOverrides(Array.isArray(overridesData) ? overridesData : []);
  //     } catch (error) {
  //       console.error('Fehler beim Laden der Overrides', error);
  //       if (!isCancelled) setOverrides([]);
  //     }
  //   };
  //   loadOverrides();
  //   return () => {
  //     isCancelled = true;
  //   };
  // }, []); // Keine Abhängigkeiten, lade nur einmal

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

  // useEffect(() => {
  //   const fetchCourses = async () => {
  //     try {
  //       const data = await getCourses();
  //       setCourses(data);
  //       setLoading(false);
  //     } catch (err) {
  //       setError('Failed to load courses');
  //       setLoading(false);
  //     }
  //   };
  //   fetchCourses();
  // }, []);

  if (loading) {
    console.log('Rendering loading state...');
    return <div>Loading...</div>;
  }
  if (error) {
    console.log('Rendering error state:', error);
    return <div>{error}</div>;
  }
  console.log('Rendering courses:', courses);

  return (
    <>
      <div className="grid">
        {courses.map((course) => {
          const dates = getCourseDates(course);
          return (
            <CourseCard
              key={course.id}
              course={course} 
              allCourses={courses}
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
