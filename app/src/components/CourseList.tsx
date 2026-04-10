import CourseCard from "./CourseCard";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Course, CourseDateOverride, Swap, User, Tenant, UserTenantMembership } from "shared/types";
import { getSwaps } from "../api/swaps";
import { getOverrides } from "../api/overrides";
import { getCourseDates } from "../lib/dates";
import { getCourses } from "../api/courses";
import { canSeeCourse } from "shared/permissions";

type Props = {
  currentUser: User;
  tenant?: Tenant;
  membership?: UserTenantMembership;
};

export default function CourseList({ currentUser, tenant, membership }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [overrides, setOverrides] = useState<CourseDateOverride[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      console.log("Fetching courses, overrides, and swaps...", {
        user: currentUser.nickname,
      });
      setLoading(true);
      const [courseData, overrideData, swapsData] = await Promise.all([
        getCourses(),
        getOverrides(),
        getSwaps(currentUser.nickname),
      ]);

      console.log("Data fetched:", {
        courseData,
        overrideData,
        swapsData,
      });
      setCourses(courseData.sort((a, b) => a.id - b.id));
      setOverrides(Array.isArray(overrideData) ? overrideData : []);
      setSwaps(swapsData);
      setError(null);
    } catch (err) {
      console.error("Error in fetchData:", err);
      setError("Failed to load data");
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser.nickname]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const {
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    overrides: filteredOverrides,
  } = useCourseSwaps(
    courses,
    overrides,
    setOverrides,
    swaps,
    setSwaps,
    currentUser,
    fetchData,
  );

  // 👉 Debug-Ausgabe bei jedem Swaps-Update
  useEffect(() => {
    console.log('🔄 Overrides updated:', overrides);
    console.log('🔄 Filtered Overrides:', filteredOverrides);
    console.log('🔄 Swaps updated:', swaps);
  }, [overrides, filteredOverrides, swaps]);

  useEffect(() => {
    console.log('useEffect ausgelöst für nickname:', currentUser?.nickname);
  }, [currentUser?.nickname]);

  const visibleCourses = useMemo(() => {
    if (!tenant?.settings || !membership) {
      return courses;
    }
    return courses.filter((course) =>
      canSeeCourse(membership, tenant.settings, course, {
        isTaughtByUser: (course.instructors ?? []).some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
        isBookedByUser: course.participants.some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
      }),
    );
  }, [courses, tenant?.settings, membership, currentUser.nickname]);

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        Loading...
      </div>
    );
  }
  if (error) {
    return <div role="alert">{error}</div>;
  }

  const coursesWithUpcoming = visibleCourses.filter((c) => getCourseDates(c).length > 0);
  if (visibleCourses.length === 0 || coursesWithUpcoming.length === 0) {
    return (
      <div className="muted" style={{ textAlign: "center", padding: "2rem" }} role="status" aria-live="polite">
        Aktuell keine Termine zum Anzeigen. Es gibt nur vergangene Termine oder noch keine Kurse.
      </div>
    );
  }

  return (
    <>
      <div className="grid">
        {visibleCourses.map((course) => {
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
