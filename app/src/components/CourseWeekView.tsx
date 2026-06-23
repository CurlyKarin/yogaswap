import { useCallback } from "react";
import type { Course, CourseDateOverride, Swap, TenantSettings, User } from "shared/types";
import { weekAnchorForOccurrence } from "../lib/courseWeek";
import { isParticipantCourseWindDown } from "../lib/courseTermActions";
import {
  getWeekViewCardDates,
  preferredWeekCardDate,
  type WeekCourseRow,
} from "../lib/courseWeekOccurrences";
import CourseCard from "./CourseCard";

type Props = {
  weekAnchor: Date;
  onWeekAnchorChange: (weekStart: Date) => void;
  loading: boolean;
  error: string | null;
  rows: WeekCourseRow[];
  hiddenPastCourseCount?: number;
  courses: Course[];
  overrides: CourseDateOverride[];
  swaps: Swap[];
  currentUser: User;
  canSeeCourseManagement: boolean;
  tenantSettings?: TenantSettings;
  onToggleAbsence: (course: Course, dateIso: string, userName: string) => Promise<boolean>;
  confirmSwap: (
    fromCourse: Course,
    fromDateIso: string,
    toCourseId: number,
    toDateIso: string,
    userName: string,
  ) => void;
  requestSwap: (
    fromCourse: Course,
    fromDateIso: string,
    toCourseId: number,
    toDateIso: string,
    userName: string,
  ) => void;
  cancelSwap: (swap: Swap, clickedCourseId: number) => void;
  canManageGuestSeats?: boolean;
  onAdjustGuestCount?: (course: Course, dateIso: string, delta: 1 | -1) => Promise<void>;
};

export default function CourseWeekView({
  weekAnchor,
  onWeekAnchorChange,
  loading,
  error,
  rows,
  hiddenPastCourseCount = 0,
  courses,
  overrides,
  swaps,
  currentUser,
  canSeeCourseManagement,
  tenantSettings,
  onToggleAbsence,
  confirmSwap,
  requestSwap,
  cancelSwap,
  canManageGuestSeats = false,
  onAdjustGuestCount,
}: Props) {
  const handleDateChange = useCallback(
    (date: Date) => {
      const nextAnchor = weekAnchorForOccurrence(date, weekAnchor);
      if (nextAnchor.getTime() !== weekAnchor.getTime()) {
        onWeekAnchorChange(nextAnchor);
      }
    },
    [weekAnchor, onWeekAnchorChange],
  );

  if (loading) {
    return (
      <div className="course-week-view" role="status" aria-live="polite">
        Kurse werden geladen…
      </div>
    );
  }

  if (error) {
    return (
      <div className="course-week-view" role="alert">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="course-week-view muted" role="status" style={{ textAlign: "center", padding: "2rem" }}>
        In dieser Kalenderwoche sind keine Termine sichtbar.
      </div>
    );
  }

  return (
    <div className="course-week-view" role="region" aria-label="Wochenansicht">
      {hiddenPastCourseCount > 0 && (
        <p className="course-week-view-faded-hint muted" role="status">
          {hiddenPastCourseCount} weitere
          {hiddenPastCourseCount === 1 ? "r Kurs" : " Kurse"} in dieser Woche
          {hiddenPastCourseCount === 1 ? " ist" : " sind"} bereits abgelaufen und nicht mehr im Nachlauf.
        </p>
      )}
      <div className="grid">
        {rows.map(({ course }) => {
          const cardDates = getWeekViewCardDates(course, weekAnchor, tenantSettings);
          const initialSelectedDate = preferredWeekCardDate(course, weekAnchor);

          return (
            <div key={`${course.id}-${weekAnchor.getTime()}`}>
              <CourseCard
                course={course}
                allCourses={courses}
                currentUser={currentUser}
                showOverbookingDetails={canSeeCourseManagement}
                canManageGuestSeats={canManageGuestSeats}
                onAdjustGuestCount={onAdjustGuestCount}
                dates={cardDates}
                overrides={overrides}
                swaps={swaps}
                participantActionsLocked={
                  !canSeeCourseManagement &&
                  isParticipantCourseWindDown(course, tenantSettings)
                }
                tenantSettings={tenantSettings}
                initialSelectedDate={initialSelectedDate}
                includePastTermsInSelect
                onDateChange={handleDateChange}
                onToggleAbsence={onToggleAbsence}
                confirmSwap={confirmSwap}
                requestSwap={requestSwap}
                cancelSwap={cancelSwap}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
