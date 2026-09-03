import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Course,
  CourseDateOverride,
  CourseEnrollment,
  Swap,
  User,
  Tenant,
  UserTenantMembership,
  DEFAULT_TENANT_ID,
} from "shared/types";
import {
  includesParticipantRef,
  resolveActorParticipantRef,
} from "shared/participantActor";
import { canSeeCourse, canManageParticipants, canShowParticipantCourseCard } from "shared/permissions";
import { getCourses } from "../api/courses";
import { getCourseEnrollments } from "../api/courseEnrollments";
import { getOverrides } from "../api/overrides";
import { getSwaps, getSwapsByStatus } from "../api/swaps";
import { getParticipantRoster } from "../api/participants";
import { getCourseDates } from "../lib/dates";
import { canShowCourseInPastWeek, computeEarliestWeekAnchor } from "../lib/courseTermActions";
import { collectWeekOccurrences, type WeekCourseRow } from "../lib/courseWeekOccurrences";
import { isPersonallyInvolvedInCourse } from "../lib/weekMyCoursesFilter";
import {
  buildParticipantNameByRefMap,
  resolveActorFromMembership,
} from "../lib/participants";
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
    const key = `${swap.participantId}#${swap.fromCourseId}#${swap.fromDate}#${swap.toCourseId}#${swap.toDate}#${swap.status}`;
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
  /** When true, week rows are limited to courses with personal involvement. */
  onlyMyCourses?: boolean;
};

export function useCoursesData({
  currentUser,
  tenant,
  membership,
  forceParticipantView = false,
  weekAnchor,
  onlyMyCourses = false,
}: Options) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [overrides, setOverrides] = useState<CourseDateOverride[]>([]);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [participantRoster, setParticipantRoster] = useState<
    Array<{ userId: string; participantId?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveMembership = useMemo<UserTenantMembership | undefined>(() => {
    if (!membership) return undefined;
    if (!forceParticipantView) return membership;
    // Vertretung: Subject ist currentUser.nickname — Admin-participantId nicht übernehmen.
    return {
      tenantId: membership.tenantId,
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

  // Subject = effectiveUser (Vertretung: vertretene Person), nicht getActorUserId (Admin).
  const actor = useMemo(
    () => resolveActorFromMembership(currentUser.nickname, effectiveMembership, participantRoster),
    [currentUser.nickname, effectiveMembership, participantRoster],
  );
  const actorRef = useMemo(() => resolveActorParticipantRef(actor), [actor]);
  const participantNameByRef = useMemo(
    () => buildParticipantNameByRefMap(participantRoster),
    [participantRoster],
  );

  const courseContext = useCallback(
    (course: Course) => ({
      isTaughtByUser: (course.instructors ?? []).some(
        (p) => p.toLowerCase() === actor.nickname.toLowerCase(),
      ),
      isBookedByUser: includesParticipantRef(course.participants, actor),
    }),
    [actor],
  );

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const swapsPromise = canSeeCourseManagement
        ? Promise.all([getSwapsByStatus("pending"), getSwapsByStatus("active")]).then(([pending, active]) =>
            dedupeSwaps([...pending, ...active]),
          )
        : getSwaps(actorRef);

      const [courseData, overrideData, enrollmentData, swapsData, rosterData] = await Promise.all([
        getCourses(),
        getOverrides(),
        getCourseEnrollments(),
        swapsPromise,
        getParticipantRoster().catch(() => []),
      ]);

      setCourses(courseData.sort(sortCoursesForDisplay));
      setOverrides(Array.isArray(overrideData) ? overrideData : []);
      setEnrollments(Array.isArray(enrollmentData) ? enrollmentData : []);
      setSwaps(swapsData);
      setParticipantRoster(rosterData);
      setError(null);
    } catch (err) {
      console.error("Error in useCoursesData:", err);
      setError("Failed to load data");
      setSwaps([]);
      setEnrollments([]);
      setParticipantRoster([]);
    } finally {
      setLoading(false);
    }
  }, [canSeeCourseManagement, actorRef]);

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
    actor,
    fetchData,
    tenant?.settings,
    enrollments,
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

      if (
        onlyMyCourses &&
        !isPersonallyInvolvedInCourse(course, actor, swaps)
      ) {
        continue;
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
    onlyMyCourses,
    actor,
    swaps,
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
    enrollments,
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
    adjustGuestCount: swapHandlers.adjustGuestCount,
    canManageGuestSeats: canManageParticipants(membershipForPermissions, tenant?.settings),
    actor,
    actorRef,
    participantNameByRef,
  };
}
