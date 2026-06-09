import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { CalendarX, Clock3, History } from "lucide-react";
import { Swap, CourseDateOverride, Course, User, TenantSettings } from "shared/types";
import {
  buildCourseOccurrenceLocal,
  formatCourseIsoDateDe,
  lastScheduledOccurrenceIso,
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
import { weekdayLabelDe } from "../lib/weekdayLabels";
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


function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function courseTermActionLabel(
  courseName: string,
  action: string,
  termIso: string,
  extras: string[] = [],
): string {
  return [action, courseName, formatCourseIsoDateDe(termIso), ...extras].join(", ");
}

function formatSwapStatusLine(swap: Swap, courseId: number, allCourses: Course[]): string {
  const courseName = (id: number) => allCourses.find((c) => c.id === id)?.name ?? "Kurs";
  if (swap.status === "pending" && swap.fromCourseId === courseId) {
    return `Tauschanfrage für ${formatCourseIsoDateDe(swap.toDate)} · ${courseName(swap.toCourseId)}`;
  }
  if (swap.status === "pending" && swap.toCourseId === courseId) {
    return `Tauschanfrage zu ${formatCourseIsoDateDe(swap.fromDate)} · ${courseName(swap.fromCourseId)}`;
  }
  if (swap.fromCourseId === courseId) {
    return `Getauscht mit ${formatCourseIsoDateDe(swap.toDate)} · ${courseName(swap.toCourseId)}`;
  }
  return `Getauscht von ${formatCourseIsoDateDe(swap.fromDate)} · ${courseName(swap.fromCourseId)}`;
}

function swapTermIsoForCourse(swap: Swap, courseId: number): string {
  return swap.fromCourseId === courseId ? swap.fromDate : swap.toDate;
}

type CourseTermActionButtonProps = {
  action: string;
  courseName: string;
  termIso: string;
  labelExtras?: string[];
  className?: string;
  title?: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
};

function CourseTermActionButton({
  action,
  courseName,
  termIso,
  labelExtras = [],
  className,
  title,
  disabled,
  busy,
  onClick,
}: CourseTermActionButtonProps) {
  return (
    <button
      type="button"
      className={className}
      aria-label={courseTermActionLabel(courseName, action, termIso, labelExtras)}
      aria-busy={busy || undefined}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {action}
    </button>
  );
}

type AbsenceToggleOutcome = "cancelled" | "shortNoticeCancelled" | "undo";

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
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [absenceAnnouncement, setAbsenceAnnouncement] = useState("");

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
      getAvailableDates(
        allCourses,
        overrides,
        currentUser,
        swapWindow,
        new Date(selectedDate),
        undefined,
        tenantSettings,
      )
        .filter((option) => !existingPendingTargetCourseIds.has(option.course.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allCourses, overrides, currentUser, selectedDate, existingPendingTargetCourseIds, swapWindow, tenantSettings]
  );

  const waitlistDates = useMemo(
    () =>
      getWaitlistDates(
        allCourses,
        overrides,
        currentUser,
        swapWindow,
        new Date(selectedDate),
        undefined,
        tenantSettings,
      )
        .filter((option) => !existingPendingTargetCourseIds.has(option.course.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allCourses, overrides, currentUser, selectedDate, existingPendingTargetCourseIds, swapWindow, tenantSettings]
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
  const lastActualOccurrenceIso = useMemo(
    () => lastScheduledOccurrenceIso({ dates: course.dates }),
    [course.dates],
  );
  const lastOccurrenceDate =
    lastActualOccurrenceIso != null
      ? buildCourseOccurrenceLocal(lastActualOccurrenceIso, course.time)
      : null;
  const showLastTermInSelect =
    hasNoUpcomingDates && lastOccurrenceDate != null && inPostEndGrace;
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
  }, [includePastTermsInSelect, showLastTermInSelect, lastActualOccurrenceIso, course.time, lastOccurrenceDate]);

  const initialSelectedTime = initialSelectedDate?.getTime();
  useEffect(() => {
    if (initialSelectedTime == null) return;
    setSelectedDate(new Date(initialSelectedTime).toISOString());
  }, [initialSelectedTime]);

  const titleId = useId();
  const scheduleDescId = useId();
  const termSelectId = useId();
  const termSelectDisabledHintId = useId();
  const termSelectDisabled = hasNoUpcomingDates && !showLastTermInSelect;

  const swapStatusLines = useMemo(
    () =>
      hasNoUpcomingDates
        ? []
        : allSwapsForThisTerm.map((swap) => formatSwapStatusLine(swap, course.id, allCourses)),
    [hasNoUpcomingDates, allSwapsForThisTerm, course.id, allCourses],
  );

  const showCutoffHint =
    canUseFullTermActions &&
    !swapForThisTerm &&
    originInCutoff &&
    (originallyParticipant || hasCancelled) &&
    !canSwapFromOrigin;

  const cutoffStatusLabel = showCutoffHint
    ? `Weniger als ${cutoffMinutes} Minuten vor Termin, kein Tausch mehr möglich`
    : undefined;

  const swapStatusExtras = swapStatusLines.length > 0 ? swapStatusLines : undefined;
  const cutoffExtras = cutoffStatusLabel ? [cutoffStatusLabel] : undefined;
  const termActionExtras = [...(swapStatusExtras ?? []), ...(cutoffExtras ?? [])];

  const handleToggleAbsence = useCallback(
    async (outcome: AbsenceToggleOutcome) => {
      setAbsenceSaving(true);
      setAbsenceAnnouncement(formatAbsenceAnnouncement(course.name, selectedDateKey, "saving"));
      try {
        const succeeded = await onToggleAbsence(course, selectedDateKey, userName);
        if (!succeeded) {
          setAbsenceAnnouncement("");
          return;
        }
        setAbsenceAnnouncement(
          formatAbsenceAnnouncement(course.name, selectedDateKey, outcome),
        );
      } catch {
        setAbsenceAnnouncement(formatAbsenceAnnouncement(course.name, selectedDateKey, "error"));
      } finally {
        setAbsenceSaving(false);
      }
    },
    [course, onToggleAbsence, selectedDateKey, userName],
  );

  useEffect(() => {
    setAbsenceAnnouncement("");
  }, [selectedDateKey]);

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
        <div className="label muted">Teilnehmer</div>
        <div className="chips">
          {showExcludedTermMarker ? (
            <span className="chip muted small">—</span>
          ) : (
            <>
              {participants.length === 0 && <span className="chip">—</span>}
              {participants.map((name) => {
                const isSelf = name.toLowerCase() === userNameLower;
                const isSn = shortNotice.some((n) => n.toLowerCase() === name.toLowerCase());
                const isSwapped = swapped.includes(name);
                return (
                  <span
                    className={`chip${isSelf ? " chip-self" : ""}${
                      isSn ? " short-notice" : isSwapped ? " swapped" : ""
                    }`}
                    key={name}
                    title={
                      isSn && isSelf
                        ? "Du — kurzfristig abgesagt, Platz bleibt belegt"
                        : isSn
                          ? "Kurzfristig abgesagt — Platz bleibt belegt"
                          : isSelf
                            ? "Du"
                            : undefined
                    }
                  >
                    {name}
                  </span>
                );
              })}
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
            waitlist.map((name) => {
              const isSelf = name.toLowerCase() === userNameLower;
              return (
                <span
                  className={`chip wait${isSelf ? " chip-self" : ""}`}
                  key={name}
                  title={isSelf ? "Du (Warteliste)" : undefined}
                >
                  {name}
                </span>
              );
            })
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
                  <CourseTermActionButton
                    action={hasCancelled ? "Absage zurücknehmen" : "Termin absagen"}
                    courseName={course.name}
                    termIso={selectedDateKey}
                    labelExtras={termActionExtras}
                    className="danger"
                    busy={absenceSaving}
                    disabled={absenceSaving}
                    onClick={() =>
                      handleToggleAbsence(hasCancelled ? "undo" : "cancelled")
                    }
                  />
                )}

              {(() => {
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
              {isShortNotice ? (
                <CourseTermActionButton
                  action="Absage zurücknehmen"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="danger"
                  busy={absenceSaving}
                  disabled={absenceSaving}
                  onClick={() => handleToggleAbsence("undo")}
                />
              ) : isParticipant ? (
                <CourseTermActionButton
                  action="Termin absagen"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="danger"
                  busy={absenceSaving}
                  disabled={absenceSaving}
                  onClick={() =>
                    handleToggleAbsence(
                      originInCutoff ? "shortNoticeCancelled" : "cancelled",
                    )
                  }
                />
              ) : canUndoRegularAbsence ? (
                <CourseTermActionButton
                  action="Absage zurücknehmen"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  busy={absenceSaving}
                  disabled={absenceSaving}
                  onClick={() => handleToggleAbsence("undo")}
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
                  onClick={() => {
                    setSwapDateIso(null);
                    setSwapDateIsoWaitlist(null);
                    setShowSwapModal(true);
                  }}
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
                  onClick={() => {
                    setSwapDateIso(null);
                    setSwapDateIsoWaitlist(null);
                    setShowSwapModal(true);
                  }}
                />
              )}
        </div>

      ) : showPastTermSwapActions ? (
        <div className="actions">
          {swapForThisTerm ? (
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
                onClick={() => {
                  setSwapDateIso(null);
                  setSwapDateIsoWaitlist(null);
                  setShowSwapModal(true);
                }}
              />
              {hasPendingRequestsFromOrigin && (
                <CourseTermActionButton
                  action="Weitere Tauschanfrage"
                  courseName={course.name}
                  termIso={selectedDateKey}
                  labelExtras={termActionExtras}
                  className="secondary"
                  title={`Du hast bereits ${pendingCount} offene Anfragen für diesen Termin — hier kannst du noch eine weitere anlegen.`}
                  onClick={() => {
                    setSwapDateIso(null);
                    setSwapDateIsoWaitlist(null);
                    setShowSwapModal(true);
                  }}
                />
              )}
            </>
          ) : null}
        </div>
      ) : isSelectedTermExcluded && includePastTermsInSelect ? (
        swapForThisTerm ? (
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
          {swapForWaitlist ? (
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

      {participantActionsLocked && userSwapsOnCourse.length > 0 && (
        <div className="actions course-inactive-swap-actions">
          {userSwapsOnCourse.map((swap) => (
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
    </article>
  );
}
