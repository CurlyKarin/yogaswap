import { useCallback, useEffect, useRef, useState } from "react";
import { buildCourseOccurrenceLocal } from "shared/courseStatus";
import type { Course, CourseDateOverride, CourseEnrollment, Swap, TenantSettings, User } from "shared/types";
import { weekAnchorForOccurrence } from "../lib/courseWeek";
import { isParticipantCourseWindDown } from "../lib/courseTermActions";
import {
  getWeekViewCardDates,
  preferredWeekCardDate,
  type WeekCourseRow,
} from "../lib/courseWeekOccurrences";
import type { TodayFocusTarget } from "../lib/weekTodayFocus";
import CourseCard from "./CourseCard";

export type TodayFocusRequest = TodayFocusTarget & { nonce: number };

type Props = {
  weekAnchor: Date;
  onWeekAnchorChange: (weekStart: Date) => void;
  loading: boolean;
  error: string | null;
  rows: WeekCourseRow[];
  hiddenPastCourseCount?: number;
  courses: Course[];
  overrides: CourseDateOverride[];
  enrollments?: CourseEnrollment[];
  swaps: Swap[];
  currentUser: User;
  canSeeCourseManagement: boolean;
  tenantSettings?: TenantSettings;
  /** One-shot focus from „Heute“ (scroll + highlight + select occurrence). */
  todayFocusRequest?: TodayFocusRequest | null;
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
  enrollments = [],
  swaps,
  currentUser,
  canSeeCourseManagement,
  tenantSettings,
  todayFocusRequest = null,
  onToggleAbsence,
  confirmSwap,
  requestSwap,
  cancelSwap,
  canManageGuestSeats = false,
  onAdjustGuestCount,
}: Props) {
  const cardHostRefs = useRef(new Map<number, HTMLDivElement>());
  const [highlightedCourseId, setHighlightedCourseId] = useState<number | null>(null);

  const handleDateChange = useCallback(
    (date: Date) => {
      const nextAnchor = weekAnchorForOccurrence(date, weekAnchor);
      if (nextAnchor.getTime() !== weekAnchor.getTime()) {
        onWeekAnchorChange(nextAnchor);
      }
    },
    [weekAnchor, onWeekAnchorChange],
  );

  useEffect(() => {
    if (!todayFocusRequest) return;
    const host = cardHostRefs.current.get(todayFocusRequest.courseId);
    if (!host) return;

    host.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const card = host.querySelector<HTMLElement>(".course-card");
    card?.focus({ preventScroll: true });
    setHighlightedCourseId(todayFocusRequest.courseId);

    const clearHighlight = window.setTimeout(() => {
      setHighlightedCourseId((current) =>
        current === todayFocusRequest.courseId ? null : current,
      );
    }, 1600);
    return () => window.clearTimeout(clearHighlight);
  }, [todayFocusRequest]);

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
          const focusDate =
            todayFocusRequest?.courseId === course.id
              ? buildCourseOccurrenceLocal(todayFocusRequest.dateIso, course.time)
              : null;
          const initialSelectedDate =
            focusDate ?? preferredWeekCardDate(course, weekAnchor);

          return (
            <div
              key={`${course.id}-${weekAnchor.getTime()}`}
              ref={(node) => {
                if (node) cardHostRefs.current.set(course.id, node);
                else cardHostRefs.current.delete(course.id);
              }}
            >
              <CourseCard
                course={course}
                allCourses={courses}
                currentUser={currentUser}
                showOverbookingDetails={canSeeCourseManagement}
                canManageGuestSeats={canManageGuestSeats}
                onAdjustGuestCount={onAdjustGuestCount}
                dates={cardDates}
                overrides={overrides}
                enrollments={enrollments}
                swaps={swaps}
                participantActionsLocked={
                  !canSeeCourseManagement &&
                  isParticipantCourseWindDown(course, tenantSettings)
                }
                tenantSettings={tenantSettings}
                initialSelectedDate={initialSelectedDate}
                highlighted={highlightedCourseId === course.id}
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
