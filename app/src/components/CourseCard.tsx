import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Swap, CourseDateOverride, Course, User, TenantSettings } from "shared/types";
import { formatAbsenceAnnouncement } from "../lib/courseCardLabels";
import CourseCardDetails from "./CourseCardDetails";
import CourseTermActions from "./CourseTermActions";
import {
  useCourseCardTermState,
  type AbsenceToggleOutcome,
} from "./useCourseCardTermState";

type Props = {
  course: Course;
  allCourses: Course[];
  currentUser: User;
  showOverbookingDetails?: boolean;
  dates: Date[];
  overrides: CourseDateOverride[];
  swaps: Swap[];
  /** Teilnehmer-Ansicht: keine neuen Absagen/Tauschanfragen bei inaktivem Kurs. */
  participantActionsLocked?: boolean;
  tenantSettings?: TenantSettings;
  onToggleAbsence: (course: Course, dateIso: string, userName: string) => Promise<boolean>;
  confirmSwap: (fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) => void;
  requestSwap: (fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) => void;
  cancelSwap: (swap: Swap, clickedCourseId: number) => void;
  /** Wochenansicht: vorausgewählter Termin beim Wechsel der Kalenderwoche. */
  initialSelectedDate?: Date;
  /** Wochenansicht: z. B. Kalenderwoche anpassen, wenn ein anderer Termin gewählt wird. */
  onDateChange?: (date: Date) => void;
  /** Wochenansicht: Termine der angezeigten KW auch in der Vergangenheit im Dropdown. */
  includePastTermsInSelect?: boolean;
  /** Kurz hervorheben (z. B. nach „Heute“). */
  highlighted?: boolean;
  canManageGuestSeats?: boolean;
  onAdjustGuestCount?: (course: Course, dateIso: string, delta: 1 | -1) => Promise<void>;
};

export default function CourseCard({
  course,
  allCourses,
  currentUser,
  showOverbookingDetails = false,
  dates,
  overrides,
  swaps,
  participantActionsLocked = false,
  tenantSettings,
  onToggleAbsence,
  confirmSwap,
  requestSwap,
  cancelSwap,
  initialSelectedDate,
  onDateChange,
  includePastTermsInSelect = false,
  highlighted = false,
  canManageGuestSeats = false,
  onAdjustGuestCount,
}: Props) {
  const termState = useCourseCardTermState({
    course,
    allCourses,
    currentUser,
    dates,
    overrides,
    swaps,
    participantActionsLocked,
    tenantSettings,
    initialSelectedDate,
    includePastTermsInSelect,
  });
  const { selectedDate, setSelectedDate, selectedDateKey, userName, hasNoUpcomingDates, inactiveNotice, excludedTermNotice, pastTermNotice } = termState;

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceAnnouncement, setAbsenceAnnouncement] = useState("");
  const absenceButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAbsenceFocusRef = useRef(false);

  const [guestSeatSaving, setGuestSeatSaving] = useState(false);

  const handleAdjustGuestCount = useCallback(
    async (delta: 1 | -1) => {
      if (!onAdjustGuestCount || guestSeatSaving) return;
      setGuestSeatSaving(true);
      try {
        await onAdjustGuestCount(course, selectedDateKey, delta);
      } finally {
        setGuestSeatSaving(false);
      }
    },
    [course, guestSeatSaving, onAdjustGuestCount, selectedDateKey],
  );

  const notEnrolledInTermHint = (
    <div className="muted">Nicht in diesem Termin eingetragen</div>
  );

  const titleId = useId();
  const scheduleDescId = useId();

  const handleToggleAbsence = useCallback(
    async (outcome: AbsenceToggleOutcome) => {
      if (absenceSaving) return;
      setAbsenceSaving(true);
      setAbsenceAnnouncement(formatAbsenceAnnouncement(course.name, selectedDateKey, "saving"));
      try {
        const succeeded = await onToggleAbsence(course, selectedDateKey, userName);
        if (!succeeded) {
          setAbsenceAnnouncement("");
          return;
        }
        restoreAbsenceFocusRef.current = true;
        setAbsenceAnnouncement(
          formatAbsenceAnnouncement(course.name, selectedDateKey, outcome),
        );
      } catch {
        setAbsenceAnnouncement(formatAbsenceAnnouncement(course.name, selectedDateKey, "error"));
      } finally {
        setAbsenceSaving(false);
      }
    },
    [absenceSaving, course, onToggleAbsence, selectedDateKey, userName],
  );

  useEffect(() => {
    setAbsenceAnnouncement("");
  }, [selectedDateKey]);

  useEffect(() => {
    if (!restoreAbsenceFocusRef.current) return;
    absenceButtonRef.current?.focus();
    restoreAbsenceFocusRef.current = false;
  });

  const openSwapModal = useCallback(() => {
    setShowSwapModal(true);
  }, []);

  const closeSwapModal = useCallback(() => {
    setShowSwapModal(false);
  }, []);

  const handleSelectedDateChange = useCallback(
    (isoValue: string, date: Date) => {
      setSelectedDate(isoValue);
      onDateChange?.(date);
    },
    [onDateChange, setSelectedDate],
  );

  return (
    <article
      tabIndex={-1}
      className={`course-card${participantActionsLocked ? " course-card--inactive-participant" : ""}${highlighted ? " course-card--today-focus" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={scheduleDescId}
    >
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      >
        {absenceAnnouncement}
      </span>
      <CourseCardDetails
        course={course}
        dates={dates}
        showOverbookingDetails={showOverbookingDetails}
        canManageGuestSeats={canManageGuestSeats}
        guestSeatSaving={guestSeatSaving}
        onAdjustGuestCount={onAdjustGuestCount ? handleAdjustGuestCount : undefined}
        includePastTermsInSelect={includePastTermsInSelect}
        termState={termState}
        selectedDate={selectedDate}
        onSelectedDateChange={handleSelectedDateChange}
        titleId={titleId}
        scheduleDescId={scheduleDescId}
      />
      <div className="course-card-footer">
        {excludedTermNotice && (
          <div className="course-card-footer-notice" role="status">
            <span className="muted small">{excludedTermNotice}</span>
          </div>
        )}
        {inactiveNotice && !pastTermNotice && (
          <div className="course-card-footer-notice" role="status">
            <span className="muted small">{inactiveNotice}</span>
          </div>
        )}
        <CourseTermActions
        course={course}
        allCourses={allCourses}
        overrides={overrides}
        userName={userName}
        selectedDate={selectedDate}
        includePastTermsInSelect={includePastTermsInSelect}
        participantActionsLocked={participantActionsLocked}
        hasNoUpcomingDates={hasNoUpcomingDates}
        termState={termState}
        absenceSaving={absenceSaving}
        absenceButtonRef={absenceButtonRef}
        showSwapModal={showSwapModal}
        notEnrolledInTermHint={notEnrolledInTermHint}
        onToggleAbsence={handleToggleAbsence}
        onOpenSwapModal={openSwapModal}
        onCloseSwapModal={closeSwapModal}
        onCancelSwap={cancelSwap}
        onConfirmSwap={(targetCourseId, targetDateIso) =>
          confirmSwap(course, selectedDateKey, targetCourseId, targetDateIso, userName)
        }
        onRequestSwap={(targetCourseId, targetDateIso) =>
          requestSwap(course, selectedDateKey, targetCourseId, targetDateIso, userName)
        }
        />
      </div>
    </article>
  );
}
