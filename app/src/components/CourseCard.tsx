import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CalendarX, Clock3, History } from "lucide-react";
import { Swap, CourseDateOverride, Course, User, TenantSettings } from "shared/types";
import { formatCourseIsoDateDe } from "shared/courseStatus";
import {
  canCancelSwap,
  isShortNoticeCancelled,
  isWithinCancellationSwapCutoff,
} from "shared/cancellationSwapCutoff";
import { resolveMaxCapacity, resolveOverbookLimit } from "shared/courseCapacity";
import { toDateKey } from "../lib/dates";
import { isExcludedCourseDate } from "../lib/courseWeekOccurrences";
import { weekdayLabelDe } from "../lib/weekdayLabels";
import CourseSwapModal from "./CourseSwapModal";
import { formatSwapStatusLine, swapTermIsoForCourse } from "../lib/courseTermActionLabels";
import CourseTermActionButton from "./CourseTermActionButton";
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
};


const TERM_MARKER_EXCLUDED_LABEL = "Termin entfällt (vom Studio abgesagt)";
const TERM_MARKER_PAST_LABEL = "Vergangener Termin im Nachlauf";
const TERM_MARKER_CUTOFF_LABEL = "Kurz vor Termin (Cutoff)";

function courseStatusBadgeLabel(autoInactive: boolean): string {
  return autoInactive ? "Kursstatus: Automatisch inaktiv" : "Kursstatus: Inaktiv";
}

function participantChipAriaLabel(
  name: string,
  { isSelf, isSn, isSwapped }: { isSelf: boolean; isSn: boolean; isSwapped: boolean },
): string {
  if (isSn && isSelf) return `${name}, du, kurzfristig abgesagt, Platz bleibt belegt`;
  if (isSn) return `${name}, kurzfristig abgesagt, Platz bleibt belegt`;
  if (isSwapped) return `${name}, getauscht`;
  if (isSelf) return `${name}, du`;
  return `${name}, regulär eingetragen`;
}

function waitlistChipAriaLabel(name: string, isSelf: boolean): string {
  return isSelf ? `${name}, du auf der Warteliste` : `${name}, auf der Warteliste`;
}

function formatAbsenceAnnouncement(
  courseName: string,
  termIso: string,
  outcome: "saving" | AbsenceToggleOutcome | "error",
): string {
  const term = formatCourseIsoDateDe(termIso);
  switch (outcome) {
    case "saving":
      return "Speichere Absage …";
    case "cancelled":
      return `Termin abgesagt für ${courseName}, ${term}. Absage kann zurückgenommen werden.`;
    case "shortNoticeCancelled":
      return `Kurzfristige Absage gespeichert für ${courseName}, ${term}. Absage kann zurückgenommen werden.`;
    case "undo":
      return `Absage zurückgenommen für ${courseName}, ${term}. Du nimmst wieder am Termin teil.`;
    case "error":
      return "Fehler beim Speichern der Absage.";
  }
}

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
}: Props) {
  const {
    swapWindow,
    selectedDate,
    setSelectedDate,
    selectedDateKey,
    participants,
    swapped,
    shortNotice,
    waitlist,
    userName,
    userNameLower,
    hasCancelled,
    cutoffMinutes,
    canSwapFromOrigin,
    pendingCount,
    hasPendingRequestsFromOrigin,
    availableSwapDates,
    waitlistDates,
    swapForThisTerm,
    hasNoUpcomingDates,
    showLastTermInSelect,
    lastOccurrenceDate,
    showAutoInactiveStatusBadge,
    cancellableUserSwapsOnCourse,
    isPastOccurrence,
    isSelectedTermExcluded,
    showPastGraceMarker,
    showCutoffMarker,
    showExcludedTermMarker,
    canUseFullTermActions,
    canSwapFromPastCancelled,
    swapForThisTermCancellable,
    showPastTermSwapActions,
    excludedTermNotice,
    inactiveNotice,
    termSelectDisabled,
    swapStatusLines,
    showCutoffHint,
    termActionExtras,
    swapPendingAbsenceAction,
    primaryAbsenceAction,
    swapModalTitle,
    swapForWaitlist,
  } = useCourseCardTermState({
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

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceAnnouncement, setAbsenceAnnouncement] = useState("");
  const absenceButtonRef = useRef<HTMLButtonElement>(null);
  const restoreAbsenceFocusRef = useRef(false);

  const overbookLimit = resolveOverbookLimit(course);
  const maxCapacity = resolveMaxCapacity(course);
  const regularFreeSpots = Math.max(0, course.capacity - participants.length);
  const overbookFreeSpots = Math.max(0, maxCapacity - Math.max(participants.length, course.capacity));
  const visibleFreeSpots = showOverbookingDetails
    ? regularFreeSpots + overbookFreeSpots
    : regularFreeSpots;

  const notEnrolledInTermHint = (
    <div className="muted">Nicht in diesem Termin eingetragen</div>
  );

  const titleId = useId();
  const scheduleDescId = useId();
  const termSelectId = useId();
  const termSelectDisabledHintId = useId();
  const participantsLabelId = useId();
  const waitlistLabelId = useId();

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

  return (
    <article
      className={`course-card${participantActionsLocked ? " course-card--inactive-participant" : ""}`}
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
      <div className="course-head">
        <div className="course-head-primary">
          <div className="course-head-title">
            <h3 id={titleId}>
              <span className="visually-hidden">Kurs: </span>
              {course.name}
            </h3>
          </div>
          <div
            className="course-head-schedule muted"
            id={scheduleDescId}
            aria-label={`${weekdayLabelDe(course.weekday)} · ${course.time}`}
          >
            <span aria-hidden="true">
              {course.weekday} · {course.time}
            </span>
          </div>
        </div>
        <div className="course-head-meta">
          {(showPastGraceMarker || showCutoffMarker || showExcludedTermMarker) && (
            <div className="course-term-visual-markers" role="status">
              {showExcludedTermMarker && (
                <span
                  className="course-term-visual-marker course-term-visual-marker--excluded"
                  role="img"
                  aria-label={TERM_MARKER_EXCLUDED_LABEL}
                  title={TERM_MARKER_EXCLUDED_LABEL}
                >
                  <CalendarX size={12} aria-hidden="true" />
                </span>
              )}
              {showPastGraceMarker && (
                <span
                  className="course-term-visual-marker course-term-visual-marker--past"
                  role="img"
                  aria-label={TERM_MARKER_PAST_LABEL}
                  title={TERM_MARKER_PAST_LABEL}
                >
                  <History size={12} aria-hidden="true" />
                </span>
              )}
              {showCutoffMarker && (
                <span
                  className="course-term-visual-marker course-term-visual-marker--cutoff"
                  role="img"
                  aria-label={TERM_MARKER_CUTOFF_LABEL}
                  title={TERM_MARKER_CUTOFF_LABEL}
                >
                  <Clock3 size={12} aria-hidden="true" />
                </span>
              )}
            </div>
          )}
          {participantActionsLocked && (
            <span
              className={`course-status-badge ${
                showAutoInactiveStatusBadge
                  ? "course-status-badge--auto"
                  : "course-status-badge--inactive"
              }`}
              aria-label={courseStatusBadgeLabel(showAutoInactiveStatusBadge)}
            >
              {showAutoInactiveStatusBadge ? "Automatisch inaktiv" : "Inaktiv"}
            </span>
          )}
        </div>
      </div>

      <div className="course-row">
        <div className="muted">Kapazität</div>
        <div>
          {showExcludedTermMarker ? (
            <span className="muted" aria-label="Kapazität entfällt">
              entfällt
            </span>
          ) : (
            <>
              {participants.length}/{course.capacity}
              {showOverbookingDetails && overbookLimit > 0 && ` (+${overbookLimit})`}
            </>
          )}
        </div>
      </div>

      <div className="course-row">
        {termSelectDisabled && (
          <span id={termSelectDisabledHintId} className="visually-hidden">
            {(course.dates ?? []).length === 0
              ? `Kein Termin im Kurszeitraum für ${course.name}.`
              : `Keine anstehenden Termine für ${course.name}.`}
          </span>
        )}
        <label
          htmlFor={termSelectId}
          className="muted course-row-label"
          aria-label={`Termin für ${course.name}`}
        >
          Termine
        </label>
        <select
          id={termSelectId}
          value={termSelectDisabled ? "" : selectedDate}
          onChange={(e) => {
            const next = new Date(e.target.value);
            setSelectedDate(e.target.value);
            onDateChange?.(next);
          }}
          disabled={termSelectDisabled}
          aria-describedby={termSelectDisabled ? termSelectDisabledHintId : undefined}
        >
          {showLastTermInSelect && lastOccurrenceDate ? (
            <option value={lastOccurrenceDate.toISOString()}>
              {lastOccurrenceDate.toLocaleDateString()} (letzter Termin)
            </option>
          ) : hasNoUpcomingDates ? (
            <option value="">—</option>
          ) : (
            (includePastTermsInSelect ? dates : dates.filter((d) => d >= new Date())).map(
              (date, index) => {
                const dateIso = toDateKey(date);
                const excludedLabel = isExcludedCourseDate(course, dateIso) ? " (entfällt)" : "";
                return (
                  <option key={index} value={date.toISOString()}>
                    {date.toLocaleDateString()}
                    {excludedLabel}
                  </option>
                );
              },
            )
          )}
        </select>
      </div>

      <div className="course-row list-row">
        <div id={participantsLabelId} className="label muted">
          Teilnehmer
        </div>
        <ul className="chips" aria-labelledby={participantsLabelId}>
          {showExcludedTermMarker ? (
            <li className="chip muted small" aria-label="Keine Teilnehmer, Termin entfällt">
              —
            </li>
          ) : (
            <>
              {participants.length === 0 && (
                <li className="chip" aria-label="Keine Teilnehmer eingetragen">
                  —
                </li>
              )}
              {participants.map((name) => {
                const isSelf = name.toLowerCase() === userNameLower;
                const isSn = shortNotice.some((n) => n.toLowerCase() === name.toLowerCase());
                const isSwapped = swapped.includes(name);
                const chipLabel = participantChipAriaLabel(name, { isSelf, isSn, isSwapped });
                return (
                  <li
                    className={`chip${isSelf ? " chip-self" : ""}${
                      isSn ? " short-notice" : isSwapped ? " swapped" : ""
                    }`}
                    key={name}
                    aria-label={chipLabel}
                  >
                    {name}
                  </li>
                );
              })}
              {visibleFreeSpots > 0 &&
                Array.from({ length: regularFreeSpots }).map((_, idx) => (
                  <li className="chip free" key={`free-${idx}`} aria-label="Freier Platz">
                    frei
                  </li>
                ))}
              {showOverbookingDetails &&
                overbookFreeSpots > 0 &&
                Array.from({ length: overbookFreeSpots }).map((_, idx) => (
                  <li
                    className="chip overbook-free"
                    key={`overbook-free-${idx}`}
                    aria-label="Freier Überplanungsplatz"
                  >
                    +frei
                  </li>
                ))}
            </>
          )}
        </ul>
      </div>

      {/* Warteliste anzeigen */}
      <div className="course-row list-row">
        <div id={waitlistLabelId} className="label muted">
          Warteliste
        </div>
        <ul className="chips" aria-labelledby={waitlistLabelId}>
          {showExcludedTermMarker ? (
            <li className="chip muted small" aria-label="Keine Warteliste, Termin entfällt">
              —
            </li>
          ) : waitlist.length === 0 ? (
            <li className="chip muted small">Keine Anfragen</li>
          ) : (
            waitlist.map((name) => {
              const isSelf = name.toLowerCase() === userNameLower;
              return (
                <li
                  className={`chip wait${isSelf ? " chip-self" : ""}`}
                  key={name}
                  aria-label={waitlistChipAriaLabel(name, isSelf)}
                >
                  {name}
                </li>
              );
            })
          )}
        </ul>
      </div>

      {inactiveNotice && (
        <div className="course-row course-inactive-notice" role="status">
          <span className="muted small">{inactiveNotice}</span>
        </div>
      )}

      {excludedTermNotice && (
        <div className="course-row course-excluded-term-notice" role="status">
          <span className="muted small">{excludedTermNotice}</span>
        </div>
      )}

      {canUseFullTermActions ? (
        <div className="actions">
          {swapForThisTerm ? (
            <>
              {/* Falls User den Ursprungstermin noch nicht abgesagt hat → Absage-Button trotzdem anzeigen */}
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
                    onClick={() => handleToggleAbsence(swapPendingAbsenceAction.outcome)}
                  />
                )}

              {swapForThisTermCancellable &&
                (() => {
                  const cancelSwapAction =
                    swapForThisTerm.status === "pending"
                      ? "Tauschanfragen abbrechen"
                      : swapForThisTerm.status === "active" &&
                          swapForThisTerm.toCourseId === course.id &&
                          isWithinCancellationSwapCutoff(
                            swapForThisTerm.toDate,
                            allCourses.find((c) => c.id === swapForThisTerm.toCourseId)?.time ?? "",
                            cutoffMinutes,
                          )
                        ? isShortNoticeCancelled(
                            overrides.find(
                              (o) =>
                                o.courseId === swapForThisTerm.toCourseId &&
                                o.date === swapForThisTerm.toDate,
                            ),
                            userName,
                          )
                          ? "Tauschabsage zurücknehmen"
                          : "Am Zieltermin kurzfristig absagen"
                        : "Tausch abbrechen";
                  return (
                    <CourseTermActionButton
                      action={cancelSwapAction}
                      courseName={course.name}
                      termIso={selectedDateKey}
                      labelExtras={termActionExtras}
                      className="secondary danger"
                      onClick={() => cancelSwap(swapForThisTerm, course.id)}
                    />
                  );
                })()}
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
                  onClick={() => handleToggleAbsence(primaryAbsenceAction.outcome)}
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
                  onClick={openSwapModal}
                />
              )}
              {showCutoffHint && (
                <p className="muted small" role="status" aria-hidden="true">
                  Weniger als {cutoffMinutes} Minuten vor Termin — kein Tausch mehr möglich.
                </p>
              )}

            </>
          )}
          {/* 🆕 Wenn schon pending-Requests existieren: zusätzlicher Button */}
              {hasPendingRequestsFromOrigin && canSwapFromOrigin && (
                <CourseTermActionButton
                  action="Weitere Tauschanfrage"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="secondary"
                  title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
                  onClick={openSwapModal}
                />
              )}
        </div>

      ) : showPastTermSwapActions ? (
        <div className="actions">
          {swapForThisTerm && swapForThisTermCancellable ? (
            <CourseTermActionButton
              action={
                swapForThisTerm.status === "pending"
                  ? "Tauschanfragen abbrechen"
                  : "Tausch abbrechen"
              }
              courseName={course.name}
              termIso={selectedDateKey}
              labelExtras={termActionExtras}
              className="secondary danger"
              onClick={() => cancelSwap(swapForThisTerm, course.id)}
            />
          ) : canSwapFromPastCancelled ? (
            <>
              <CourseTermActionButton
                action="Anderen Termin wählen"
                courseName={course.name}
                termIso={selectedDateKey}
                labelExtras={termActionExtras}
                className="secondary"
                onClick={openSwapModal}
              />
              {hasPendingRequestsFromOrigin && (
                <CourseTermActionButton
                  action="Weitere Tauschanfrage"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="secondary"
                  title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
                  onClick={openSwapModal}
                />
              )}
            </>
          ) : null}
        </div>
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
              onClick={() => cancelSwap(swapForThisTerm, course.id)}
            />
          </div>
        ) : null
      ) : isPastOccurrence && !participantActionsLocked ? (
        <p className="muted small course-past-term-note" role="status">
          Vergangener Termin — keine Änderungen mehr möglich.
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
                onClick={() => cancelSwap(swapForWaitlist, course.id)}
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
                onClick={() => cancelSwap(swap, course.id)}
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
          onClose={closeSwapModal}
          onConfirmFree={(targetCourseId, targetDateIso) =>
            confirmSwap(course, selectedDateKey, targetCourseId, targetDateIso, userName)
          }
          onConfirmWaitlist={(targetCourseId, targetDateIso) =>
            requestSwap(course, selectedDateKey, targetCourseId, targetDateIso, userName)
          }
        />
      )}
    </article>
  );
}
