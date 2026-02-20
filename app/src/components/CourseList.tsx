import CourseCard from "./CourseCard";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState } from "react";
import { Course, CourseDateOverride, Swap, User} from "shared/types";
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

  // Wiederverwendbare fetchData-Funktion mit isCancelled
// Wiederverwendbare fetchData-Funktion mit isCancelled
  const fetchData = async () => {
    let isCancelled = false;
    try {
      console.log('Fetching courses, overrides, and swaps...', { user: currentUser?.nickname });
      setLoading(true);
      const [courseData, overrideData, swapsData] = await Promise.all([
        getCourses(),
        getOverrides(),
        currentUser?.nickname ? getSwaps(currentUser.nickname) : Promise.resolve([]),
      ]);
      console.log('Data fetched:', { courseData, overrideData, swapsData });
      if (!isCancelled) {
        setCourses(courseData.sort((a, b) => a.id - b.id));
        setOverrides(Array.isArray(overrideData) ? overrideData : []);
        setSwaps(swapsData);
        setLoading(false);
        setError(null);
      }
    } catch (err) {
      console.error('Error in fetchData:', err);
      if (!isCancelled) {
        setError('Failed to load data');
        setLoading(false);
        setSwaps([]);
      }
    }
    return () => {
      isCancelled = true;
    };
  };

  // Initialer Datenabruf
  useEffect(() => {
    const fetchDataAndClearError = async () => {
      await fetchData();
      setError(null);
    };
    fetchDataAndClearError();
  }, [currentUser?.nickname]);

  const {
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    overrides: filteredOverrides
  } = useCourseSwaps(courses, overrides, setOverrides, swaps, setSwaps, currentUser, fetchData);

  // useEffect(() => {
  //   let isCancelled = false;
  //   const loadSwaps = async () => {
  //     if (!currentUser?.nickname) {
  //       console.error('Kein Benutzer-Nickname, Swaps bleiben leer');
  //       if (!isCancelled) setSwaps([]);
  //       return;
  //     }
  //     try {
  //       console.log('Lade Swaps für user:', currentUser.nickname);
  //       const swapsData = await getSwaps(currentUser.nickname); // Verwende api/swaps.ts
  //       if (!isCancelled) setSwaps(swapsData); // Setze Swaps, auch wenn leer
  //     } catch (error) {
  //       console.error('Fehler beim Laden der Swaps', error);
  //       if (!isCancelled) setSwaps([]); // Bei Fehler leeres Array
  //     }
  //   };
  //   loadSwaps();
  //   console.log('useEffect ausgelöst für nickname:', currentUser?.nickname);
  //   return () => {
  //     isCancelled = true; // Verhindert Updates nach Unmount
  //   };
  // }, [currentUser?.nickname]);

  // 👉 Debug-Ausgabe bei jedem Swaps-Update
  useEffect(() => {
    console.log('🔄 Overrides updated:', overrides);
    console.log('🔄 Filtered Overrides:', filteredOverrides);
    console.log('🔄 Swaps updated:', swaps);
  }, [overrides, filteredOverrides, swaps]);

  useEffect(() => {
    console.log('useEffect ausgelöst für nickname:', currentUser?.nickname);
  }, [currentUser?.nickname]);

  if (loading) {
    return <div>Loading...</div>;
  }
  if (error) {
    return <div>{error}</div>;
  }

  const coursesWithUpcoming = courses.filter((c) => getCourseDates(c).length > 0);
  if (courses.length === 0 || coursesWithUpcoming.length === 0) {
    return (
      <div className="muted" style={{ textAlign: "center", padding: "2rem" }}>
        Aktuell keine Termine zum Anzeigen. Es gibt nur vergangene Termine oder noch keine Kurse.
      </div>
    );
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
