import type { ReactNode, RefObject } from "react";
import type { Course, CourseDateOverride, Swap } from "shared/types";
import {
  canCancelSwap,
  isShortNoticeCancelled,
  isWithinCancellationSwapCutoff,
} from "shared/cancellationSwapCutoff";
import { formatSwapStatusLine, swapTermIsoForCourse } from "../lib/courseTermActionLabels";
import CourseSwapModal from "./CourseSwapModal";
import CourseTermActionButton from "./CourseTermActionButton";
import type { AbsenceToggleOutcome, CourseCardTermState } from "./useCourseCardTermState";

function resolveActiveSwapCancelLabel(
  swap: Swap,
  course: Course,
  allCourses: Course[],
  overrides: CourseDateOverride[],
  userName: string,
  cutoffMinutes: number,
): string {
  if (swap.status === "pending") {
    return "Tauschanfragen abbrechen";
  }
  if (
    swap.status === "active" &&
    swap.toCourseId === course.id &&
    isWithinCancellationSwapCutoff(
      swap.toDate,
      allCourses.find((c) => c.id === swap.toCourseId)?.time ?? "",
      cutoffMinutes,
    )
  ) {
    return isShortNoticeCancelled(
      overrides.find((o) => o.courseId === swap.toCourseId && o.date === swap.toDate),
      userName,
    )
      ? "Tauschabsage zurücknehmen"
      : "Am Zieltermin kurzfristig absagen";
  }
  return "Tausch abbrechen";
}

function resolvePendingSwapCancelLabel(swap: Swap): string {
  return swap.status === "pending" ? "Tauschanfragen abbrechen" : "Tausch abbrechen";
}

type CourseTermActionsProps = {
  course: Course;
  allCourses: Course[];
  overrides: CourseDateOverride[];
  userName: string;
  selectedDate: string;
  includePastTermsInSelect: boolean;
  participantActionsLocked: boolean;
  hasNoUpcomingDates: boolean;
  termState: CourseCardTermState;
  absenceSaving: boolean;
  absenceButtonRef: RefObject<HTMLButtonElement | null>;
  showSwapModal: boolean;
  notEnrolledInTermHint: ReactNode;
  onToggleAbsence: (outcome: AbsenceToggleOutcome) => void;
  onOpenSwapModal: () => void;
  onCloseSwapModal: () => void;
  onCancelSwap: (swap: Swap, clickedCourseId: number) => void;
  onConfirmSwap: (targetCourseId: number, targetDateIso: string) => void;
  onRequestSwap: (targetCourseId: number, targetDateIso: string) => void;
};

export default function CourseTermActions({
  course,
  allCourses,
  overrides,
  userName,
  selectedDate,
  includePastTermsInSelect,
  participantActionsLocked,
  hasNoUpcomingDates,
  termState,
  absenceSaving,
  absenceButtonRef,
  showSwapModal,
  notEnrolledInTermHint,
  onToggleAbsence,
  onOpenSwapModal,
  onCloseSwapModal,
  onCancelSwap,
  onConfirmSwap,
  onRequestSwap,
}: CourseTermActionsProps) {
  const {
    selectedDateKey,
    hasCancelled,
    cutoffMinutes,
    canSwapFromOrigin,
    pendingCount,
    hasPendingRequestsFromOrigin,
    availableSwapDates,
    waitlistDates,
    swapWindow,
    swapForThisTerm,
    isSelectedTermExcluded,
    canUseFullTermActions,
    canSwapFromPastCancelled,
    swapForThisTermCancellable,
    showPastTermSwapActions,
    pastTermNotice,
    swapStatusLines,
    showCutoffHint,
    termActionExtras,
    swapPendingAbsenceAction,
    primaryAbsenceAction,
    swapModalTitle,
    swapForWaitlist,
    cancellableUserSwapsOnCourse,
  } = termState;

  return (
    <>
      {canUseFullTermActions ? (
        <div className="actions">
          {swapForThisTerm ? (
            <>
              {swapPendingAbsenceAction && (
                <CourseTermActionButton
                  ref={absenceButtonRef}
                  action={swapPendingAbsenceAction.action}
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="danger"
                  busy={absenceSaving}
                  inactive={absenceSaving}
                  onClick={() => onToggleAbsence(swapPendingAbsenceAction.outcome)}
                />
              )}

              {swapForThisTerm && swapForThisTermCancellable && (
                <CourseTermActionButton
                  action={resolveActiveSwapCancelLabel(
                    swapForThisTerm,
                    course,
                    allCourses,
                    overrides,
                    userName,
                    cutoffMinutes,
                  )}
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="secondary danger"
                  onClick={() => onCancelSwap(swapForThisTerm, course.id)}
                />
              )}
            </>
          ) : (
            <>
              {primaryAbsenceAction ? (
                <CourseTermActionButton
                  ref={absenceButtonRef}
                  action={primaryAbsenceAction.action}
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="danger"
                  busy={absenceSaving}
                  inactive={absenceSaving}
                  onClick={() => onToggleAbsence(primaryAbsenceAction.outcome)}
                />
              ) : hasCancelled ? null : (
                notEnrolledInTermHint
              )}

              {canSwapFromOrigin && (
                <CourseTermActionButton
                  action={hasCancelled ? "Anderen Termin wählen" : "Tauschen anfragen"}
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="secondary"
                  onClick={onOpenSwapModal}
                />
              )}
              {showCutoffHint && (
                <p className="muted small" role="status" aria-hidden="true">
                  Weniger als {cutoffMinutes} Minuten vor Termin — kein Tausch mehr möglich.
                </p>
              )}
            </>
          )}
          {hasPendingRequestsFromOrigin && canSwapFromOrigin && (
            <CourseTermActionButton
              action="Weitere Tauschanfrage"
              courseName={course.name}
              termIso={selectedDateKey}
              labelExtras={termActionExtras}
              className="secondary"
              title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
              onClick={onOpenSwapModal}
            />
          )}
        </div>
      ) : showPastTermSwapActions ? (
        <>
          <div className="actions">
            {swapForThisTerm && swapForThisTermCancellable ? (
              <CourseTermActionButton
                action={resolvePendingSwapCancelLabel(swapForThisTerm)}
                courseName={course.name}
                termIso={selectedDateKey}
                labelExtras={termActionExtras}
                className="secondary danger"
                onClick={() => onCancelSwap(swapForThisTerm, course.id)}
              />
            ) : canSwapFromPastCancelled ? (
              <>
                <CourseTermActionButton
                  action="Anderen Termin wählen"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="secondary"
                  onClick={onOpenSwapModal}
                />
                {hasPendingRequestsFromOrigin && (
                  <CourseTermActionButton
                    action="Weitere Tauschanfrage"
                    courseName={course.name}
                    termIso={selectedDateKey}
                    labelExtras={termActionExtras}
                    className="secondary"
                    title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
                    onClick={onOpenSwapModal}
                  />
                )}
              </>
            ) : null}
          </div>
          {pastTermNotice ? (
            <p className="muted small course-past-term-note" role="status">
              {pastTermNotice}
            </p>
          ) : null}
        </>
      ) : isSelectedTermExcluded && includePastTermsInSelect ? (
        swapForThisTerm && swapForThisTermCancellable ? (
          <div className="actions">
            <CourseTermActionButton
              action={
                swapForThisTerm.status === "pending"
                  ? "Tauschanfrage abbrechen"
                  : "Tausch abbrechen"
              }
              courseName={course.name}
              termIso={selectedDateKey}
              labelExtras={termActionExtras}
              className="secondary danger"
              onClick={() => onCancelSwap(swapForThisTerm, course.id)}
            />
          </div>
        ) : null
      ) : pastTermNotice ? (
        <p className="muted small course-past-term-note" role="status">
          {pastTermNotice}
        </p>
      ) : !participantActionsLocked && !hasNoUpcomingDates ? (
        <>
          {swapForWaitlist && canCancelSwap(swapForWaitlist, allCourses) ? (
            <div className="actions">
              <CourseTermActionButton
                action="Tauschanfrage abbrechen"
                courseName={course.name}
                termIso={selectedDateKey}
                labelExtras={termActionExtras}
                className="secondary danger"
                onClick={() => onCancelSwap(swapForWaitlist, course.id)}
              />
            </div>
          ) : (
            notEnrolledInTermHint
          )}
        </>
      ) : null}

      {participantActionsLocked && cancellableUserSwapsOnCourse.length > 0 && (
        <div className="actions course-inactive-swap-actions">
          {cancellableUserSwapsOnCourse.map((swap) => (
            <div key={`${swap.fromCourseId}-${swap.fromDate}-${swap.toCourseId}-${swap.toDate}-${swap.status}`}>
              <CourseTermActionButton
                action={swap.status === "pending" ? "Tauschanfrage abbrechen" : "Tausch abbrechen"}
                courseName={course.name}
                termIso={swapTermIsoForCourse(swap, course.id)}
                labelExtras={[formatSwapStatusLine(swap, course.id, allCourses)]}
                className="secondary danger"
                onClick={() => onCancelSwap(swap, course.id)}
              />
            </div>
          ))}
        </div>
      )}

      {swapStatusLines.length > 0 && (
        <div className="muted small status-text" role="status" aria-hidden="true">
          {swapStatusLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {(canUseFullTermActions || canSwapFromPastCancelled) && showSwapModal && (
        <CourseSwapModal
          title={swapModalTitle}
          courseName={course.name}
          originTermIso={selectedDateKey}
          originTermDisplay={new Date(selectedDate).toLocaleDateString()}
          swapWindow={swapWindow}
          availableSwapDates={availableSwapDates}
          waitlistDates={waitlistDates}
          onClose={onCloseSwapModal}
          onConfirmFree={onConfirmSwap}
          onConfirmWaitlist={onRequestSwap}
        />
      )}
    </>
  );
}
