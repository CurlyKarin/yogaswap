import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Course,
  CourseDateOverride,
  Swap,
  User,
  Tenant,
  UserTenantMembership,
  DEFAULT_TENANT_ID,
} from "shared/types";
import { canSeeCourse, canShowParticipantCourseCard } from "shared/permissions";
import { getCourses } from "../api/courses";
import { getOverrides } from "../api/overrides";
import { getSwaps, getSwapsByStatus } from "../api/swaps";
import { getCourseDates } from "../lib/dates";
import { canShowCourseInPastWeek, computeEarliestWeekAnchor } from "../lib/courseTermActions";
import { collectWeekOccurrences, type WeekCourseRow } from "../lib/courseWeekOccurrences";
import { useCourseSwaps } from "../components/useCourseSwaps";

const WEEKDAY_ORDER: Record<string, number> = {
  Mon: 1,
  Monday: 1,
  Tue: 2,
  Tuesday: 2,
  Wed: 3,
  Wednesday: 3,
  Thu: 4,
  Thursday: 4,
  Fri: 5,
  Friday: 5,
  Sat: 6,
  Saturday: 6,
  Sun: 7,
  Sunday: 7,
};

function sortCoursesForDisplay(a: Course, b: Course): number {
  const weekdayA = WEEKDAY_ORDER[a.weekday] ?? 99;
  const weekdayB = WEEKDAY_ORDER[b.weekday] ?? 99;
  if (weekdayA !== weekdayB) return weekdayA - weekdayB;
  if (a.time !== b.time) return a.time.localeCompare(b.time);
  return a.id - b.id;
}

function dedupeSwaps(values: Swap[]): Swap[] {
  const seen = new Set<string>();
  const result: Swap[] = [];
  for (const swap of values) {
    const key = `${swap.user}#${swap.fromCourseId}#${swap.fromDate}#${swap.toCourseId}#${swap.toDate}#${swap.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(swap);
  }
  return result;
}

type Options = {
  currentUser: User;
  tenant?: Tenant;
  membership?: UserTenantMembership;
  forceParticipantView?: boolean;
  weekAnchor: Date;
};

export function useCoursesData({
  currentUser,
  tenant,
  membership,
  forceParticipantView = false,
  weekAnchor,
}: Options) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [overrides, setOverrides] = useState<CourseDateOverride[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveMembership = useMemo<UserTenantMembership | undefined>(() => {
    if (!membership) return undefined;
    if (!forceParticipantView) return membership;
    return {
      ...membership,
      role: "participant",
      userId: currentUser.nickname,
    };
  }, [membership, forceParticipantView, currentUser.nickname]);

  const membershipForPermissions = useMemo<UserTenantMembership>(() => {
    if (effectiveMembership) return effectiveMembership;
    return {
      userId: currentUser.nickname,
      tenantId: tenant?.tenantId ?? DEFAULT_TENANT_ID,
      role: currentUser.role,
    };
  }, [effectiveMembership, tenant?.tenantId, currentUser.nickname, currentUser.role]);

  const resolvedRole = effectiveMembership?.role ?? currentUser.role;
  const canSeeCourseManagement = resolvedRole === "admin" || resolvedRole === "instructor";

  const courseContext = useCallback(
    (course: Course) => ({
      isTaughtByUser: (course.instructors ?? []).some(
        (p) => p.toLowerCase() === currentUser.nickname.toLowerCase(),
      ),
      isBookedByUser: course.participants.some(
        (p) => p.toLowerCase() === currentUser.nickname.toLowerCase(),
      ),
    }),
    [currentUser.nickname],
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const swapsPromise = canSeeCourseManagement
        ? Promise.all([getSwapsByStatus("pending"), getSwapsByStatus("active")]).then(([pending, active]) =>
            dedupeSwaps([...pending, ...active]),
          )
        : getSwaps(currentUser.nickname);

      const [courseData, overrideData, swapsData] = await Promise.all([
        getCourses(),
        getOverrides(),
        swapsPromise,
      ]);

      setCourses(courseData.sort(sortCoursesForDisplay));
      setOverrides(Array.isArray(overrideData) ? overrideData : []);
      setSwaps(swapsData);
      setError(null);
    } catch (err) {
      console.error("Error in useCoursesData:", err);
      setError("Failed to load data");
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [canSeeCourseManagement, currentUser.nickname]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const swapHandlers = useCourseSwaps(
    courses,
    overrides,
    setOverrides,
    swaps,
    setSwaps,
    currentUser,
    fetchData,
    tenant?.settings,
  );

  const visibleCourses = useMemo(() => {
    return courses.filter((course) =>
      canSeeCourse(membershipForPermissions, tenant?.settings, course, courseContext(course)),
    );
  }, [courses, membershipForPermissions, tenant?.settings, courseContext]);

  const weekCourseRows = useMemo((): { rows: WeekCourseRow[]; hiddenPastCourses: number } => {
    const rows: WeekCourseRow[] = [];
    let hiddenPastCourses = 0;
    for (const course of visibleCourses) {
      const occurrences = collectWeekOccurrences(course, weekAnchor);
      if (occurrences.length === 0) continue;

      if (!canShowCourseInPastWeek(course, weekAnchor, tenant?.settings)) {
        hiddenPastCourses += 1;
        continue;
      }

      if (!canSeeCourseManagement) {
        const hasUpcoming = getCourseDates(course).length > 0;
        const show = canShowParticipantCourseCard(membershipForPermissions, tenant?.settings, course, {
          ...courseContext(course),
          hasVisibleCourseDates: hasUpcoming || occurrences.length > 0,
        });
        if (!show) continue;
      }

      rows.push({ course, occurrences });
    }
    return {
      rows: rows.sort((a, b) => sortCoursesForDisplay(a.course, b.course)),
      hiddenPastCourses,
    };
  }, [
    visibleCourses,
    weekAnchor,
    canSeeCourseManagement,
    membershipForPermissions,
    tenant?.settings,
    courseContext,
  ]);

  const earliestWeekAnchor = useMemo(
    () => computeEarliestWeekAnchor(visibleCourses, tenant?.settings),
    [visibleCourses, tenant?.settings],
  );

  return {
    loading,
    error,
    fetchData,
    courses,
    overrides: swapHandlers.overrides,
    swaps,
    visibleCourses,
    weekCourseRows: weekCourseRows.rows,
    hiddenPastCourseCount: weekCourseRows.hiddenPastCourses,
    earliestWeekAnchor,
    canSeeCourseManagement,
    membershipForPermissions,
    confirmSwap: swapHandlers.confirmSwap,
    requestSwap: swapHandlers.requestSwap,
    cancelSwap: swapHandlers.cancelSwap,
    onToggleAbsence: swapHandlers.onToggleAbsence,
  };
}
