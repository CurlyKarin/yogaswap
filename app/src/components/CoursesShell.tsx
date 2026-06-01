import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CourseList from "./CourseList";
import CourseWeekView from "./CourseWeekView";
import { User, Tenant, UserTenantMembership, DEFAULT_TENANT_ID } from "shared/types";
import { addWeeks, formatWeekNavLabel, startOfWeekMonday } from "../lib/courseWeek";
import { useCoursesData } from "../hooks/useCoursesData";

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

  const [viewMode, setViewMode] = useState<CourseViewMode>("week");
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekMonday(new Date()));

  const {
    loading,
    error,
    courses,
    weekCourseRows,
    overrides,
    swaps,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
  } = useCoursesData({
    currentUser,
    tenant,
    membership,
    forceParticipantView,
    weekAnchor,
  });

  useEffect(() => {
    if (!canSeeCourseManagement && viewMode === "courses") {
      setViewMode("week");
    }
  }, [canSeeCourseManagement, viewMode]);

  const weekLabel = formatWeekNavLabel(weekAnchor);

  return (
    <>
      <div className="course-views-toolbar">
        {canSeeCourseManagement && (
          <div className="course-views-toggle" role="group" aria-label="Kursansicht">
            <button
              type="button"
              className={`course-views-toggle-btn${viewMode === "week" ? " is-active" : ""}`}
              aria-pressed={viewMode === "week"}
              onClick={() => setViewMode("week")}
            >
              Wochenansicht
            </button>
            <button
              type="button"
              className={`course-views-toggle-btn${viewMode === "courses" ? " is-active" : ""}`}
              aria-pressed={viewMode === "courses"}
              onClick={() => setViewMode("courses")}
            >
              Kursübersicht
            </button>
          </div>
        )}

        {viewMode === "week" && (
          <nav className="course-week-nav" aria-label="Kalenderwoche">
            <button
              type="button"
              className="course-week-nav-btn"
              aria-label="Vorherige Woche"
              onClick={() => setWeekAnchor((prev) => addWeeks(prev, -1))}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className="course-week-nav-label">{weekLabel}</span>
            <button
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
              onClick={() => setWeekAnchor(startOfWeekMonday(new Date()))}
            >
              Heute
            </button>
          </nav>
        )}
      </div>

      {viewMode === "week" && (
        <>
          <p className="muted course-views-hint">
            Klicke in deinen Kursen auf <em>„Termin absagen“</em> oder <em>„Tauschen anfragen“</em>.
          </p>
          <CourseWeekView
            weekAnchor={weekAnchor}
            onWeekAnchorChange={setWeekAnchor}
            loading={loading}
            error={error}
            rows={weekCourseRows}
            courses={courses}
            overrides={overrides}
            swaps={swaps}
            currentUser={currentUser}
            canSeeCourseManagement={canSeeCourseManagement}
            tenantSettings={tenant?.settings}
            onToggleAbsence={onToggleAbsence}
            confirmSwap={confirmSwap}
            requestSwap={requestSwap}
            cancelSwap={cancelSwap}
          />
        </>
      )}

      {viewMode === "courses" && canSeeCourseManagement && (
        <CourseList
          currentUser={currentUser}
          tenant={tenant}
          membership={membership}
          forceParticipantView={forceParticipantView}
        />
      )}
    </>
  );
};
