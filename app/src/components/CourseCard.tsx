import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarX, Clock3, History } from "lucide-react";
import { Swap, CourseDateOverride, Course, User, TenantSettings } from "shared/types";
import {
  buildCourseOccurrenceLocal,
  courseEndDateIso,
  formatCourseIsoDateDe,
  getInactiveGraceLastDayIso,
  isCourseInInactiveGracePeriod,
  isWithinPostCourseEndGrace,
  looksLikeAutomaticallyInactive,
} from "shared/courseStatus";
import { resolveSwapWindow } from "shared/tenantSettings";
import {
  canCreateSwapFromOrigin,
  hasEffectiveCancellation,
  isShortNoticeCancelled,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
} from "shared/cancellationSwapCutoff";
import { resolveMaxCapacity, resolveOverbookLimit } from "shared/courseCapacity";
import { getAvailableDates, getWaitlistDates, toDateKey } from "../lib/dates";
import {
  canRequestSwapFromPastCancelledOrigin,
  isOccurrenceInPast,
} from "../lib/courseTermActions";
import { isExcludedCourseDate } from "../lib/courseWeekOccurrences";
import type { SwapSettings } from "../types";

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
  onToggleAbsence: (course: Course, dateIso: string, userName: string) => void;
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


function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function SwapModalHint({ label, children }: { label: string; children: ReactNode }) {
  const hintId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="swap-modal-hint-wrap">
      <button
        type="button"
        className="studio-field-hint"
        title={label}
        aria-expanded={open}
        aria-controls={hintId}
        aria-label={`Hilfe: ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        ?
      </button>
      {open && (
        <div id={hintId} role="note" className="studio-field-hint-popover swap-modal-hint-popover">
          {children}
        </div>
      )}
    </span>
  );
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
  const swapWindow: SwapSettings = useMemo(
    () => resolveSwapWindow(tenantSettings),
    [tenantSettings],
  );

  const [selectedDate, setSelectedDate] = useState<string>(
    () => (initialSelectedDate ?? dates[0])?.toISOString() || "",
  );
  const [swapDateIso, setSwapDateIso] = useState<string | null>(null);
  const [swapDateIsoWaitlist, setSwapDateIsoWaitlist] = useState<string | null>(null);
  const [showSwapModal, setShowSwapModal] = useState(false);

  const userName = currentUser.nickname;
  const selectedDateKey = toDateKey(new Date(selectedDate));

  // Memoized Berechnungen für reaktive Aktualisierung
  const override = useMemo(
    () =>
      overrides.find((o) =>
        o.courseId === course.id && sameDayUTC(new Date(o.date), new Date(selectedDate))
      ),
    [overrides, course.id, selectedDate]
  );

  const hasNoUpcomingDates = dates.length === 0;
  const participants = hasNoUpcomingDates ? course.participants : (override ? override.participants : course.participants);
  const swapped = hasNoUpcomingDates ? [] : (override?.swapped ?? []);
  const shortNotice = hasNoUpcomingDates ? [] : (override?.shortNoticeCancellations ?? []);
  const overbookLimit = resolveOverbookLimit(course);
  const maxCapacity = resolveMaxCapacity(course);
  const regularFreeSpots = Math.max(0, course.capacity - participants.length);
  const overbookFreeSpots = Math.max(0, maxCapacity - Math.max(participants.length, course.capacity));
  const visibleFreeSpots = showOverbookingDetails
    ? regularFreeSpots + overbookFreeSpots
    : regularFreeSpots;
  const waitlist = hasNoUpcomingDates ? [] : (override?.waitlist ?? []);

  const userNameLower = userName.toLowerCase();
  const isParticipant = participants.some((p) => p.toLowerCase() === userNameLower);
  const originallyParticipant = course.participants.some((p) => p.toLowerCase() === userNameLower);
  const isShortNotice = isShortNoticeCancelled(override, userName);
  const hasCancelled = hasEffectiveCancellation(
    originallyParticipant,
    override,
    participants,
    userName,
  );
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  const originInCutoff = isWithinCancellationSwapCutoff(
    selectedDateKey,
    course.time,
    cutoffMinutes,
  );
  const canSwapFromOrigin =
    (originallyParticipant || hasCancelled) &&
    canCreateSwapFromOrigin({
      isoDate: selectedDateKey,
      courseTime: course.time,
      tenantSettings,
      override,
      userName,
      participants,
      originallyParticipant,
    });
  const hasActiveOriginSwapInPast = swaps.some(
    (s) =>
      s.user === userName &&
      s.status === "active" &&
      s.fromCourseId === course.id &&
      s.fromDate === selectedDateKey &&
      new Date(s.toDate) < new Date(),
  );
  /** RC: Rücknahme = wieder in participants (auch im Cutoff), außer historischem aktivem Swap. */
  const canUndoRegularAbsence =
    hasCancelled && !isShortNotice && !isParticipant && !hasActiveOriginSwapInPast;

  const pendingSwapsFromOrigin = useMemo(
    () =>
      swaps.filter(
        (s) =>
          s.user === userName &&
          s.fromCourseId === course.id &&
          s.fromDate === selectedDateKey &&
          s.status === "pending"
      ),
    [swaps, userName, course.id, selectedDateKey]
  );

  const existingPendingTargetCourseIds = useMemo(
    () => new Set(pendingSwapsFromOrigin.map((swap) => swap.toCourseId)),
    [pendingSwapsFromOrigin]
  );

  const availableSwapDates = useMemo(
    () =>
      getAvailableDates(allCourses, overrides, currentUser, swapWindow, new Date(selectedDate))
        .filter((option) => !existingPendingTargetCourseIds.has(option.course.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allCourses, overrides, currentUser, selectedDate, existingPendingTargetCourseIds, swapWindow]
  );

  const waitlistDates = useMemo(
    () =>
      getWaitlistDates(allCourses, overrides, currentUser, swapWindow, new Date(selectedDate))
        .filter((option) => !existingPendingTargetCourseIds.has(option.course.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allCourses, overrides, currentUser, selectedDate, existingPendingTargetCourseIds, swapWindow]
  );

  const swapForThisTerm = useMemo(
    () =>
      swaps.find(
        (s) =>
          s.user === userName &&
          ((s.fromCourseId === course.id && s.fromDate === selectedDateKey) ||
           (s.toCourseId === course.id && s.toDate === selectedDateKey))
      ),
    [swaps, userName, course.id, selectedDateKey]
  );

  const allSwapsForThisTerm = useMemo(
    () =>
      swaps.filter(
        (s) =>
          (s.fromCourseId === course.id && s.fromDate === selectedDateKey && s.user === userName) ||
          (s.toCourseId === course.id && s.toDate === selectedDateKey && s.user === userName)
      ),
    [swaps, userName, course.id, selectedDateKey]
  );

  const swapForWaitlist = useMemo(
    () =>
      swaps.find(
        (s) =>
          s.user === userName &&
          s.toCourseId === course.id &&
          s.toDate === selectedDateKey &&
          s.status === "pending"
      ),
    [swaps, userName, course.id, selectedDateKey]
  );

  const pendingCount = pendingSwapsFromOrigin.length;
  const hasPendingRequestsFromOrigin = pendingCount > 0;

  const hasUpcomingDates = dates.length > 0;
  const courseStatus = course.status ?? "active";
  const isInactiveCourse = courseStatus === "inactive";
  const inPostEndGrace = isWithinPostCourseEndGrace(course, tenantSettings);
  const inInactiveGrace =
    isInactiveCourse && isCourseInInactiveGracePeriod(course, tenantSettings);
  const graceLastIso =
    inPostEndGrace || inInactiveGrace
      ? getInactiveGraceLastDayIso(course, tenantSettings)
      : undefined;
  const lastOccurrenceIso = courseEndDateIso(course);
  const lastOccurrenceDate =
    lastOccurrenceIso != null ? buildCourseOccurrenceLocal(lastOccurrenceIso, course.time) : null;
  const showLastTermInSelect = hasNoUpcomingDates && lastOccurrenceDate != null && inPostEndGrace;
  const showAutoInactiveBadge =
    participantActionsLocked && looksLikeAutomaticallyInactive(course, hasUpcomingDates);
  const userSwapsOnCourse = useMemo(
    () =>
      swaps.filter(
        (s) =>
          s.user === userName &&
          (s.fromCourseId === course.id || s.toCourseId === course.id),
      ),
    [swaps, userName, course.id],
  );
  const isPastOccurrence = isOccurrenceInPast(selectedDateKey, course.time);
  const isSelectedTermExcluded = isExcludedCourseDate(course, selectedDateKey);
  const showPastGraceMarker =
    includePastTermsInSelect && isPastOccurrence && !isSelectedTermExcluded;
  const showCutoffMarker =
    includePastTermsInSelect &&
    !isPastOccurrence &&
    !isSelectedTermExcluded &&
    originInCutoff;
  const showExcludedTermMarker = includePastTermsInSelect && isSelectedTermExcluded;
  const canUseFullTermActions =
    !participantActionsLocked &&
    hasUpcomingDates &&
    (isParticipant || originallyParticipant) &&
    !isPastOccurrence &&
    !isSelectedTermExcluded;
  const canSwapFromPastCancelled = canRequestSwapFromPastCancelledOrigin({
    isoDate: selectedDateKey,
    courseTime: course.time,
    tenantSettings,
    override,
    userName,
    participants,
    originallyParticipant,
  });
  const showPastTermSwapActions =
    !participantActionsLocked &&
    !isSelectedTermExcluded &&
    isPastOccurrence &&
    (isParticipant || originallyParticipant || hasCancelled) &&
    (swapForThisTerm != null || canSwapFromPastCancelled);
  const excludedTermNotice = showExcludedTermMarker
    ? "Dieser Termin entfällt — vom Studio abgesagt."
    : null;

  const inactiveNotice = participantActionsLocked
    ? showAutoInactiveBadge || (!isInactiveCourse && inPostEndGrace)
      ? graceLastIso
        ? `Dieser Kurs wurde automatisch beendet (keine weiteren Termine). Offene Tausche kannst du noch bis ${formatCourseIsoDateDe(graceLastIso)} verwalten.`
        : "Dieser Kurs wurde automatisch beendet. Du kannst nur noch bestehende Tausche verwalten."
      : graceLastIso
        ? `Dieser Kurs ist inaktiv. Offene Tausche kannst du noch bis ${formatCourseIsoDateDe(graceLastIso)} verwalten.`
        : "Dieser Kurs ist inaktiv. Du kannst nur noch bestehende Tausche verwalten."
    : null;
  const notEnrolledInTermHint = (
    <div className="muted">Nicht in diesem Termin eingetragen</div>
  );

  useEffect(() => {
    if (includePastTermsInSelect) return;
    if (showLastTermInSelect && lastOccurrenceDate) {
      setSelectedDate(lastOccurrenceDate.toISOString());
    }
  }, [includePastTermsInSelect, showLastTermInSelect, lastOccurrenceIso, course.time, lastOccurrenceDate]);

  const initialSelectedTime = initialSelectedDate?.getTime();
  useEffect(() => {
    if (initialSelectedTime == null) return;
    setSelectedDate(new Date(initialSelectedTime).toISOString());
  }, [initialSelectedTime]);

  return (
    <div
      className={`course-card${participantActionsLocked ? " course-card--inactive-participant" : ""}`}
    >
      <div className="course-head">
        <div className="course-head-title">
          <h3>{course.name}</h3>
          <div className="muted">
            {course.weekday} · {course.time}
          </div>
        </div>
        <div className="course-head-meta">
          {(showPastGraceMarker || showCutoffMarker || showExcludedTermMarker) && (
            <div className="course-term-visual-markers" role="status">
              {showExcludedTermMarker && (
                <span
                  className="course-term-visual-marker course-term-visual-marker--excluded"
                  title="Termin entfällt (vom Studio abgesagt)"
                >
                  <CalendarX size={12} aria-hidden="true" />
                </span>
              )}
              {showPastGraceMarker && (
                <span
                  className="course-term-visual-marker course-term-visual-marker--past"
                  title="Vergangener Termin im Nachlauf"
                >
                  <History size={12} aria-hidden="true" />
                </span>
              )}
              {showCutoffMarker && (
                <span
                  className="course-term-visual-marker course-term-visual-marker--cutoff"
                  title="Kurz vor Termin (Cutoff)"
                >
                  <Clock3 size={12} aria-hidden="true" />
                </span>
              )}
            </div>
          )}
          {participantActionsLocked && (
            <span
              className={`course-status-badge ${
                showAutoInactiveBadge || (!isInactiveCourse && inPostEndGrace)
                  ? "course-status-badge--auto"
                  : "course-status-badge--inactive"
              }`}
            >
              {showAutoInactiveBadge || (!isInactiveCourse && inPostEndGrace)
                ? "Automatisch inaktiv"
                : "Inaktiv"}
            </span>
          )}
        </div>
      </div>

      <div className="course-row">
        <div className="muted">Kapazität</div>
        <div>
          {showExcludedTermMarker ? (
            <span className="muted">entfällt</span>
          ) : (
            <>
              {participants.length}/{course.capacity}
              {showOverbookingDetails && overbookLimit > 0 && ` (+${overbookLimit})`}
            </>
          )}
        </div>
      </div>

      <div className="course-row">
        <div className="muted">Termine:</div>
        <select
          value={hasNoUpcomingDates && !showLastTermInSelect ? "" : selectedDate}
          onChange={(e) => {
            const next = new Date(e.target.value);
            setSelectedDate(e.target.value);
            onDateChange?.(next);
          }}
          disabled={hasNoUpcomingDates && !showLastTermInSelect}
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
        <div className="label muted">Teilnehmer</div>
        <div className="chips">
          {showExcludedTermMarker ? (
            <span className="chip muted small">—</span>
          ) : (
            <>
              {participants.length === 0 && <span className="chip">—</span>}
              {participants.map((name) => (
                <span
                  className={`chip ${
                    shortNotice.some((n) => n.toLowerCase() === name.toLowerCase())
                      ? "short-notice"
                      : swapped.includes(name)
                        ? "swapped"
                        : ""
                  }`}
                  key={name}
                  title={
                    shortNotice.some((n) => n.toLowerCase() === name.toLowerCase())
                      ? "Kurzfristig abgesagt — Platz bleibt belegt"
                      : undefined
                  }
                >
                  {name}
                </span>
              ))}
              {visibleFreeSpots > 0 &&
                Array.from({ length: regularFreeSpots }).map((_, idx) => (
                  <span className="chip free" key={`free-${idx}`}>
                    frei
                  </span>
                ))}
              {showOverbookingDetails &&
                overbookFreeSpots > 0 &&
                Array.from({ length: overbookFreeSpots }).map((_, idx) => (
                  <span
                    className="chip overbook-free"
                    key={`overbook-free-${idx}`}
                    title="Platz in der Überplanung"
                  >
                    +frei
                  </span>
                ))}
            </>
          )}
        </div>
      </div>

      {/* Warteliste anzeigen */}
      <div className="course-row list-row">
        <div className="label muted">Warteliste</div>
        <div className="chips">
          {showExcludedTermMarker ? (
            <span className="chip muted small">—</span>
          ) : waitlist.length === 0 ? (
            <span className="chip muted small">Keine Anfragen</span>
          ) : (
            waitlist.map((name) => (
              <span className="chip wait" key={name}>
                {name}
              </span>
            ))
          )}
        </div>
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
              {swapForThisTerm.status === "pending" &&
                originallyParticipant && (
                  <button
                    className="danger"
                    onClick={() => onToggleAbsence(course, selectedDateKey, userName)}
                  >
                    {hasCancelled ? "Absage zuruecknehmen" : "Termin absagen"}
                  </button>
                
              )}

              <button
                className="secondary danger"
                onClick={() => cancelSwap(swapForThisTerm, course.id)}
              >
                {swapForThisTerm.status === "pending"
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
                    : "Tausch abbrechen"}
              </button>
            </>
          ) : (
            <>
              {isShortNotice ? (
                <button
                  className="danger"
                  onClick={() => onToggleAbsence(course, selectedDateKey, userName)}
                >
                  Absage zurücknehmen
                </button>
              ) : isParticipant ? (
                <button
                  className="danger"
                  onClick={() => onToggleAbsence(course, selectedDateKey, userName)}
                >
                  Termin absagen
                </button>
              ) : canUndoRegularAbsence ? (
                <button onClick={() => onToggleAbsence(course, selectedDateKey, userName)}>
                  Absage zurücknehmen
                </button>
              ) : hasCancelled ? null : (
                notEnrolledInTermHint
              )}

              {canSwapFromOrigin && (
                <button
                  className="secondary"
                  onClick={() => {
                    setSwapDateIso(null);
                    setSwapDateIsoWaitlist(null);
                    setShowSwapModal(true);
                  }}
                >
                  {hasCancelled ? "Anderen Termin wählen" : "Tauschen anfragen"}
                </button>
              )}
              {originInCutoff && (originallyParticipant || hasCancelled) && !canSwapFromOrigin && (
                <p className="muted small" role="status">
                  Weniger als {cutoffMinutes} Minuten vor Termin — kein Tausch mehr möglich.
                </p>
              )}

            </>
          )}
          {/* 🆕 Wenn schon pending-Requests existieren: zusätzlicher Button */}
              {hasPendingRequestsFromOrigin && canSwapFromOrigin && (
                <button
                  className="secondary"
                  onClick={() => {
                    // zwinge Nutzer zur bewussten Auswahl: nichts vorauswählen
                    setSwapDateIso(null);
                    setSwapDateIsoWaitlist(null);
                    setShowSwapModal(true);
                  }}
                  title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
                >
                  Weitere Tauschanfrage
                </button>
              )}
        </div>

      ) : showPastTermSwapActions ? (
        <div className="actions">
          {swapForThisTerm ? (
            <button
              className="secondary danger"
              onClick={() => cancelSwap(swapForThisTerm, course.id)}
            >
              {swapForThisTerm.status === "pending"
                ? "Tauschanfragen abbrechen"
                : "Tausch abbrechen"}
            </button>
          ) : canSwapFromPastCancelled ? (
            <>
              <button
                className="secondary"
                onClick={() => {
                  setSwapDateIso(null);
                  setSwapDateIsoWaitlist(null);
                  setShowSwapModal(true);
                }}
              >
                Anderen Termin wählen
              </button>
              {hasPendingRequestsFromOrigin && (
                <button
                  className="secondary"
                  onClick={() => {
                    setSwapDateIso(null);
                    setSwapDateIsoWaitlist(null);
                    setShowSwapModal(true);
                  }}
                  title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
                >
                  Weitere Tauschanfrage
                </button>
              )}
            </>
          ) : null}
        </div>
      ) : isSelectedTermExcluded && includePastTermsInSelect ? (
        swapForThisTerm ? (
          <div className="actions">
            <button
              className="secondary danger"
              onClick={() => cancelSwap(swapForThisTerm, course.id)}
            >
              {swapForThisTerm.status === "pending"
                ? "Tauschanfrage abbrechen"
                : "Tausch abbrechen"}
            </button>
          </div>
        ) : null
      ) : isPastOccurrence && !participantActionsLocked ? (
        <p className="muted small course-past-term-note" role="status">
          Vergangener Termin — keine Änderungen mehr möglich.
        </p>
      ) : !participantActionsLocked && !hasNoUpcomingDates ? (
        <>
          {swapForWaitlist ? (
            <div className="actions">
              <button
                className="secondary danger"
                onClick={() => cancelSwap(swapForWaitlist, course.id)}
              >
                Tauschanfrage abbrechen
              </button>
            </div>
          ) : (
            notEnrolledInTermHint
          )}
        </>
      ) : null}

      {participantActionsLocked && userSwapsOnCourse.length > 0 && (
        <div className="actions course-inactive-swap-actions">
          {userSwapsOnCourse.map((swap) => (
            <div key={`${swap.fromCourseId}-${swap.fromDate}-${swap.toCourseId}-${swap.toDate}-${swap.status}`}>
              <button
                type="button"
                className="secondary danger"
                onClick={() => cancelSwap(swap, course.id)}
              >
                {swap.status === "pending" ? "Tauschanfrage abbrechen" : "Tausch abbrechen"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Status-Text separat unter den Buttons */}
      {!hasNoUpcomingDates && allSwapsForThisTerm.length > 0 && (
        <div className="muted small status-text">
          {allSwapsForThisTerm.map((swap, idx) => (
            <div key={idx}>
          {swap.status === "pending" && swap.fromCourseId === course.id
            ? `Tauschanfrage für ${new Date(
                swap.toDate
              ).toLocaleDateString()} · ${
                allCourses.find((c) => c.id === swap.toCourseId)?.name
              }`
            : swap.status === "pending" && swap.toCourseId === course.id
            ? `Tauschanfrage zu ${new Date(
                swap.fromDate
              ).toLocaleDateString()} · ${
                allCourses.find((c) => c.id === swap.toCourseId)?.name
              }`
            : swap.fromCourseId === course.id
            ? `Getauscht mit ${new Date(
                swap.toDate
              ).toLocaleDateString()} · ${
                allCourses.find((c) => c.id === swap.toCourseId)?.name
              }`
            : `Getauscht von ${new Date(
                swap.fromDate
              ).toLocaleDateString()} · ${
                allCourses.find((c) => c.id === swap.fromCourseId)?.name
              }`}
            </div>
          ))}
        </div>
      )}
      {/* Swap-Modal */}
      {(canUseFullTermActions || canSwapFromPastCancelled) && showSwapModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h4>
              {hasCancelled ? "Anderen Termin wählen" : "Tauschanfrage starten"}
            </h4>
            <p>
              Ausgewählter Termin:{" "}
              <strong>
                {new Date(selectedDate).toLocaleDateString()}
              </strong>{" "}
              · {course.name}
            </p>

            {availableSwapDates.length > 0 || waitlistDates.length > 0 ? (
              <>
                <div className="swap-modal-section-head">
                  <span className="swap-modal-section-title">Freie Termine</span>
                  <SwapModalHint label="Freie Tauschtermine">
                    <p>
                      Termine mit freien Plätzen zwischen{" "}
                      <strong>
                        {swapWindow.minOffsetDays} und {swapWindow.maxOffsetDays} Tagen
                      </strong>{" "}
                      nach deinem Kurstermin (nur in der Zukunft). Mit der Bestätigung eines Zieltermins
                      meldest du dich gleichzeitig von deinem aktuellen Termin ab.
                    </p>
                  </SwapModalHint>
                </div>
                {availableSwapDates.length > 0 ? (
                  <>
                    <p className="muted">
                      Es stehen {availableSwapDates.length} freie Termin(e) zur Auswahl.
                    </p>
                    <select
                      value={swapDateIso ?? ""}
                      onChange={(e) => {
                        setSwapDateIso(e.target.value || null);
                        setSwapDateIsoWaitlist(null);
                      }}
                    >
                      <option value="" disabled>
                        Bitte freien Termin auswählen…
                      </option>
                      {availableSwapDates.map((swapDate, idx) => (
                        <option key={idx} value={swapDate.date.toISOString()}>
                          {new Intl.DateTimeFormat("de-DE", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(swapDate.date)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="muted">Derzeit keine freien Termine im Tauschfenster.</p>
                )}

                <div className="swap-modal-section-head">
                  <span className="swap-modal-section-title">Warteliste</span>
                  <SwapModalHint label="Warteliste im Tauschdialog">
                    <p>
                      Ausgebuchte Termine im gleichen Zeitfenster (
                      <strong>
                        {swapWindow.minOffsetDays} bis {swapWindow.maxOffsetDays} Tage
                      </strong>{" "}
                      nach deinem Kurstermin). Die Anfrage landet auf der Warteliste — noch ohne feste
                      Buchung.
                    </p>
                  </SwapModalHint>
                </div>
                {waitlistDates.length > 0 ? (
                  <>
                    <p className="muted">
                      {waitlistDates.length} belegte Termin(e) mit Wartelisten-Option:
                    </p>
                    <select
                      value={swapDateIsoWaitlist ?? ""}
                      onChange={(e) => {
                        setSwapDateIsoWaitlist(e.target.value || null);
                        setSwapDateIso(null);
                      }}
                    >
                      <option value="" disabled>
                        Bitte belegten Termin wählen…
                      </option>
                      {waitlistDates.map((waitlistDate, idx) => (
                        <option key={idx} value={waitlistDate.date.toISOString()}>
                          {new Intl.DateTimeFormat("de-DE", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(waitlistDate.date)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="muted">Derzeit keine belegten Termine mit Wartelisten-Option.</p>
                )}
              </>
            ) : (
              <p className="muted">Keine passenden Ersatztermine verfügbar</p>
            )}

            <div className="modal-actions">
              <button onClick={() => setShowSwapModal(false)}>Schließen</button>
              <button
                className="primary"
                onClick={() => {
                  // jetzt wird direkt in CourseList eingetragen/ausgetragen
                  if (swapDateIso) {
                    const target = availableSwapDates.find(
                      (opt) => opt.date.toISOString() === swapDateIso
                    );
                    if (target) {
                      confirmSwap(course, selectedDateKey, target.course.id, toDateKey(target.date), userName);
                    }
                  } else if (swapDateIsoWaitlist) {
                    const target = waitlistDates.find(
                      (opt) => opt.date.toISOString() === swapDateIsoWaitlist
                    );
                    if (target) {
                      requestSwap(course, selectedDateKey, target.course.id, toDateKey(target.date), userName);
                    }
                  }
                  setShowSwapModal(false);
                }}
                disabled={!swapDateIso && !swapDateIsoWaitlist} // 👉 Button erst aktiv nach Auswahl
              >
                Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
