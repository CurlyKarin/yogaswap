import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, User as UserIcon } from "lucide-react";
import CourseList from "./CourseList";
import CourseWeekView from "./CourseWeekView";
import { User, Tenant, UserTenantMembership, DEFAULT_TENANT_ID } from "shared/types";
import { addWeeks, formatWeekNavLabel, startOfWeekMonday } from "../lib/courseWeek";
import {
  buildWeekAnchorStorageKey,
  clampWeekAnchor,
  readStoredWeekAnchor,
  resolveInitialWeekAnchor,
  writeStoredWeekAnchor,
} from "../lib/weekNavPersistence";
import {
  hasInstructorAssignment,
  resolveMyCoursesToggle,
} from "../lib/weekMyCoursesFilter";
import { pickTodayFocusTarget } from "../lib/weekTodayFocus";
import { getActorUserId } from "../api/delegation";
import { useCoursesData } from "../hooks/useCoursesData";
import type { TodayFocusRequest } from "./CourseWeekView";

export type CourseViewMode = "week" | "courses";

type Props = {
  currentUser: User;
  tenant?: Tenant;
  membership?: UserTenantMembership;
  forceParticipantView?: boolean;
};

export default function CoursesShell({
  currentUser,
  tenant,
  membership,
  forceParticipantView = false,
}: Props) {
  const effectiveMembership = useMemo(() => {
    if (!forceParticipantView) return membership;
    return {
      tenantId: membership?.tenantId ?? tenant?.tenantId ?? DEFAULT_TENANT_ID,
      role: "participant" as const,
      userId: currentUser.nickname,
    };
  }, [membership, forceParticipantView, tenant?.tenantId, currentUser.nickname]);

  const resolvedRole = effectiveMembership?.role ?? currentUser.role;
  const canSeeCourseManagement = resolvedRole === "admin" || resolvedRole === "instructor";

  const weekAnchorStorageKey = useMemo(() => {
    const tenantId = tenant?.tenantId ?? membership?.tenantId ?? DEFAULT_TENANT_ID;
    const userId = getActorUserId() ?? currentUser.nickname;
    return buildWeekAnchorStorageKey(tenantId, userId);
  }, [tenant?.tenantId, membership?.tenantId, currentUser.nickname]);

  const [viewMode, setViewMode] = useState<CourseViewMode>("week");
  const [weekAnchor, setWeekAnchorState] = useState(() => {
    const stored = readStoredWeekAnchor(weekAnchorStorageKey);
    return stored ?? startOfWeekMonday(new Date());
  });
  const prevWeekAnchorStorageKeyRef = useRef(weekAnchorStorageKey);

  // Role default only — not persisted (keeps the week view predictable for participants).
  const [onlyMyCourses, setOnlyMyCourses] = useState(
    () => resolveMyCoursesToggle(resolvedRole, false).defaultOnlyMy,
  );
  const [myCoursesToggleTouched, setMyCoursesToggleTouched] = useState(false);
  const [pendingTodayFocus, setPendingTodayFocus] = useState(false);
  const [todayFocusRequest, setTodayFocusRequest] = useState<TodayFocusRequest | null>(null);

  const {
    loading,
    error,
    courses,
    weekCourseRows,
    hiddenPastCourseCount,
    overrides,
    swaps,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    adjustGuestCount,
    canManageGuestSeats,
    earliestWeekAnchor,
  } = useCoursesData({
    currentUser,
    tenant,
    membership,
    forceParticipantView,
    weekAnchor,
    onlyMyCourses,
  });

  const hasAssignment = useMemo(
    () => hasInstructorAssignment(courses, currentUser.nickname),
    [courses, currentUser.nickname],
  );
  const myCoursesToggle = useMemo(
    () => resolveMyCoursesToggle(resolvedRole, hasAssignment),
    [resolvedRole, hasAssignment],
  );

  useEffect(() => {
    if (!myCoursesToggle.canToggle) {
      setOnlyMyCourses(false);
      return;
    }
    if (!myCoursesToggleTouched) {
      setOnlyMyCourses(myCoursesToggle.defaultOnlyMy);
    }
  }, [myCoursesToggle.canToggle, myCoursesToggle.defaultOnlyMy, myCoursesToggleTouched]);

  useEffect(() => {
    setMyCoursesToggleTouched(false);
  }, [resolvedRole]);

  const setWeekAnchor = useCallback(
    (update: Date | ((prev: Date) => Date)) => {
      setWeekAnchorState((prev) => {
        const next = typeof update === "function" ? update(prev) : update;
        const clamped = clampWeekAnchor(next, earliestWeekAnchor);
        writeStoredWeekAnchor(weekAnchorStorageKey, clamped);
        return clamped;
      });
    },
    [earliestWeekAnchor, weekAnchorStorageKey],
  );

  useEffect(() => {
    if (!pendingTodayFocus || loading) return;
    const currentWeek = startOfWeekMonday(new Date());
    if (weekAnchor.getTime() !== currentWeek.getTime()) return;

    const target = pickTodayFocusTarget(weekCourseRows, currentUser.nickname, swaps);
    setTodayFocusRequest(target ? { ...target, nonce: Date.now() } : null);
    setPendingTodayFocus(false);
  }, [pendingTodayFocus, loading, weekAnchor, weekCourseRows, currentUser.nickname, swaps]);

  const jumpToToday = useCallback(() => {
    setWeekAnchor(startOfWeekMonday(new Date()));
    setPendingTodayFocus(true);
  }, [setWeekAnchor]);

  useEffect(() => {
    if (prevWeekAnchorStorageKeyRef.current === weekAnchorStorageKey) return;
    prevWeekAnchorStorageKeyRef.current = weekAnchorStorageKey;
    const resolved = resolveInitialWeekAnchor(weekAnchorStorageKey, earliestWeekAnchor);
    setWeekAnchorState(resolved);
    writeStoredWeekAnchor(weekAnchorStorageKey, resolved);
  }, [weekAnchorStorageKey, earliestWeekAnchor]);

  useEffect(() => {
    setWeekAnchorState((prev) => {
      const clamped = clampWeekAnchor(prev, earliestWeekAnchor);
      if (clamped.getTime() === prev.getTime()) return prev;
      writeStoredWeekAnchor(weekAnchorStorageKey, clamped);
      return clamped;
    });
  }, [earliestWeekAnchor, weekAnchorStorageKey]);

  useEffect(() => {
    if (!canSeeCourseManagement && viewMode === "courses") {
      setViewMode("week");
    }
  }, [canSeeCourseManagement, viewMode]);

  const weekLabel = formatWeekNavLabel(weekAnchor);
  const canGoToPreviousWeek = weekAnchor.getTime() > earliestWeekAnchor.getTime();
  const prevWeekBtnRef = useRef<HTMLButtonElement>(null);
  const nextWeekBtnRef = useRef<HTMLButtonElement>(null);
  const [weekLimitAnnouncement, setWeekLimitAnnouncement] = useState("");

  useEffect(() => {
    if (canGoToPreviousWeek) {
      setWeekLimitAnnouncement("");
      return;
    }
    const prevBtn = prevWeekBtnRef.current;
    if (prevBtn && document.activeElement === prevBtn) {
      setWeekLimitAnnouncement("Früheste sichtbare Kalenderwoche erreicht.");
      nextWeekBtnRef.current?.focus();
    }
  }, [canGoToPreviousWeek, weekAnchor]);

  return (
    <>
      <div id="course-toolbar" className="course-views-toolbar">
        {canSeeCourseManagement && (
          <div className="course-views-toggle" role="group" aria-label="Kursansicht">
            <button
              type="button"
              className={`course-views-toggle-btn${viewMode === "week" ? " is-active" : ""}`}
              aria-pressed={viewMode === "week"}
              aria-controls="course-week-panel"
              onClick={() => setViewMode("week")}
            >
              Wochenansicht
            </button>
            <button
              type="button"
              className={`course-views-toggle-btn${viewMode === "courses" ? " is-active" : ""}`}
              aria-pressed={viewMode === "courses"}
              aria-controls="course-list-panel"
              onClick={() => setViewMode("courses")}
            >
              Kursübersicht
            </button>
          </div>
        )}

        {viewMode === "week" && (
          <nav className="course-week-nav" aria-label="Kalenderwoche">
            <span
              id="course-week-nav-limit-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="visually-hidden"
            >
              {weekLimitAnnouncement}
            </span>
            <span id="course-week-nav-prev-limit" className="visually-hidden">
              Früheste sichtbare Kalenderwoche erreicht
            </span>
            <button
              ref={prevWeekBtnRef}
              type="button"
              className="course-week-nav-btn"
              aria-label="Vorherige Woche"
              disabled={!canGoToPreviousWeek}
              aria-describedby={!canGoToPreviousWeek ? "course-week-nav-prev-limit" : undefined}
              onClick={() =>
                setWeekAnchor((prev) => {
                  const next = addWeeks(prev, -1);
                  return next.getTime() < earliestWeekAnchor.getTime() ? earliestWeekAnchor : next;
                })
              }
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span
              id="course-week-nav-label"
              className="course-week-nav-label"
              aria-live="polite"
              aria-atomic="true"
            >
              {weekLabel}
            </span>
            <button
              ref={nextWeekBtnRef}
              type="button"
              className="course-week-nav-btn"
              aria-label="Nächste Woche"
              onClick={() => setWeekAnchor((prev) => addWeeks(prev, 1))}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="course-week-nav-today"
              aria-label="Zur aktuellen Kalenderwoche und zum laufenden oder nächsten Kurs springen"
              title="Aktuelle Woche und laufenden bzw. nächsten Kurs anzeigen"
              onClick={jumpToToday}
            >
              Heute
            </button>
            <button
              type="button"
              className={`course-week-nav-btn course-week-nav-my-courses${onlyMyCourses ? " is-active" : ""}`}
              aria-pressed={onlyMyCourses}
              aria-label={
                onlyMyCourses ? "Nur meine Kurse anzeigen (aktiv)" : "Nur meine Kurse anzeigen"
              }
              title={
                !myCoursesToggle.canToggle
                  ? "Keine Kurszuordnung — es werden immer alle Kurse gezeigt"
                  : onlyMyCourses
                    ? "Nur Kurse mit deiner Beteiligung — Klick zeigt alle Kurse"
                    : "Alle Kurse der Woche — Klick filtert auf deine Beteiligung"
              }
              disabled={!myCoursesToggle.canToggle}
              onClick={() => {
                setMyCoursesToggleTouched(true);
                setOnlyMyCourses((prev) => !prev);
              }}
            >
              <UserIcon size={18} aria-hidden="true" />
            </button>
          </nav>
        )}
      </div>

      {viewMode === "week" && (
        <section
          id="course-week-panel"
          className="course-week-panel"
          aria-label="Wochenansicht"
          aria-describedby="course-views-hint"
        >
          <p id="course-views-hint" className="muted course-views-hint">
            In deinen Kursen: „Termin absagen“ oder „Tauschen anfragen“ wählen.
          </p>
          <CourseWeekView
            weekAnchor={weekAnchor}
            onWeekAnchorChange={setWeekAnchor}
            loading={loading}
            error={error}
            rows={weekCourseRows}
            hiddenPastCourseCount={hiddenPastCourseCount}
            courses={courses}
            overrides={overrides}
            swaps={swaps}
            currentUser={currentUser}
            canSeeCourseManagement={canSeeCourseManagement}
            tenantSettings={tenant?.settings}
            todayFocusRequest={todayFocusRequest}
            onToggleAbsence={onToggleAbsence}
            confirmSwap={confirmSwap}
            requestSwap={requestSwap}
            cancelSwap={cancelSwap}
            canManageGuestSeats={canManageGuestSeats}
            onAdjustGuestCount={adjustGuestCount}
          />
        </section>
      )}

      {viewMode === "courses" && canSeeCourseManagement && (
        <section id="course-list-panel" className="course-list-panel" aria-label="Kursübersicht">
          <CourseList
            currentUser={currentUser}
            tenant={tenant}
            membership={membership}
            forceParticipantView={forceParticipantView}
          />
        </section>
      )}
    </>
  );
};
