import { useId } from "react";
import { CalendarX, Clock3, History } from "lucide-react";
import type { Course } from "shared/types";
import { resolveGuestCount, resolveMaxCapacity, resolveOverbookLimit, resolveEffectiveOccupancy, validateTermOccupancy } from "shared/courseCapacity";
import { toDateKey } from "../lib/dates";
import {
  courseStatusBadgeLabel,
  courseStatusBadgeText,
  excludedTermOptionSuffix,
  lastTermOptionSuffix,
  participantChipAriaLabel,
  guestChipAriaLabel,
  GUEST_CHIP_LABEL,
  TERM_MARKER_CUTOFF_LABEL,
  TERM_MARKER_EXCLUDED_LABEL,
  TERM_MARKER_PAST_LABEL,
  termSelectAriaLabel,
  termSelectDisabledHint,
  waitlistChipAriaLabel,
} from "../lib/courseCardLabels";
import { isExcludedCourseDate } from "../lib/courseWeekOccurrences";
import { weekdayLabelDe } from "../lib/weekdayLabels";
import type { CourseCardTermState } from "./useCourseCardTermState";
import GuestSeatControls from "./GuestSeatControls";

type CourseCardDetailsProps = {
  course: Course;
  dates: Date[];
  showOverbookingDetails: boolean;
  canManageGuestSeats?: boolean;
  guestSeatSaving?: boolean;
  onAdjustGuestCount?: (delta: 1 | -1) => void;
  includePastTermsInSelect: boolean;
  participantActionsLocked: boolean;
  termState: CourseCardTermState;
  selectedDate: string;
  onSelectedDateChange: (isoValue: string, date: Date) => void;
  titleId: string;
  scheduleDescId: string;
};

export default function CourseCardDetails({
  course,
  dates,
  showOverbookingDetails,
  canManageGuestSeats = false,
  guestSeatSaving = false,
  onAdjustGuestCount,
  includePastTermsInSelect,
  participantActionsLocked,
  termState,
  selectedDate,
  onSelectedDateChange,
  titleId,
  scheduleDescId,
}: CourseCardDetailsProps) {
  const termSelectId = useId();
  const termSelectDisabledHintId = useId();
  const participantsLabelId = useId();
  const waitlistLabelId = useId();

  const {
    participants,
    swapped,
    shortNotice,
    waitlist,
    guestCount: rawGuestCount,
    userNameLower,
    hasNoUpcomingDates,
    showLastTermInSelect,
    lastOccurrenceDate,
    showAutoInactiveStatusBadge,
    showPastGraceMarker,
    showCutoffMarker,
    showExcludedTermMarker,
    excludedTermNotice,
    inactiveNotice,
    termSelectDisabled,
  } = termState;

  const overbookLimit = resolveOverbookLimit(course);
  const maxCapacity = resolveMaxCapacity(course);
  const guestCount = resolveGuestCount(rawGuestCount);
  const effectiveOccupancy = resolveEffectiveOccupancy(participants.length, guestCount);
  const regularFreeSpots = Math.max(0, course.capacity - effectiveOccupancy);
  const overbookFreeSpots = Math.max(0, maxCapacity - Math.max(effectiveOccupancy, course.capacity));
  const visibleFreeSpots = showOverbookingDetails
    ? regularFreeSpots + overbookFreeSpots
    : regularFreeSpots;
  const canAddGuest =
    validateTermOccupancy(participants.length, course, guestCount + 1) === null;
  const canRemoveGuest = guestCount > 0;
  const showGuestControls =
    canManageGuestSeats && !showExcludedTermMarker && !hasNoUpcomingDates && !!onAdjustGuestCount;

  return (
    <>
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
              {courseStatusBadgeText(showAutoInactiveStatusBadge)}
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
              {effectiveOccupancy}/{course.capacity}
              {showOverbookingDetails && overbookLimit > 0 && ` (+${overbookLimit})`}
            </>
          )}
        </div>
      </div>

      <div className="course-row">
        {termSelectDisabled && (
          <span id={termSelectDisabledHintId} className="visually-hidden">
            {termSelectDisabledHint(course.name, (course.dates ?? []).length > 0)}
          </span>
        )}
        <label
          htmlFor={termSelectId}
          className="muted course-row-label"
          aria-label={termSelectAriaLabel(course.name)}
        >
          Termine
        </label>
        <select
          id={termSelectId}
          value={termSelectDisabled ? "" : selectedDate}
          onChange={(e) => {
            const next = new Date(e.target.value);
            onSelectedDateChange(e.target.value, next);
          }}
          disabled={termSelectDisabled}
          aria-describedby={termSelectDisabled ? termSelectDisabledHintId : undefined}
        >
          {showLastTermInSelect && lastOccurrenceDate ? (
            <option value={lastOccurrenceDate.toISOString()}>
              {lastOccurrenceDate.toLocaleDateString()}
              {lastTermOptionSuffix()}
            </option>
          ) : hasNoUpcomingDates ? (
            <option value="">—</option>
          ) : (
            (includePastTermsInSelect ? dates : dates.filter((d) => d >= new Date())).map(
              (date, index) => {
                const dateIso = toDateKey(date);
                const excludedLabel = isExcludedCourseDate(course, dateIso)
                  ? excludedTermOptionSuffix()
                  : "";
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

      {showGuestControls && (
        <div className="course-row guest-seats-row">
          <div className="muted guest-seats-label">Gäste</div>
          <GuestSeatControls
            guestCount={guestCount}
            canAddGuest={canAddGuest}
            canRemoveGuest={canRemoveGuest}
            saving={guestSeatSaving}
            onAddGuest={() => onAdjustGuestCount!(1)}
            onRemoveGuest={() => onAdjustGuestCount!(-1)}
          />
        </div>
      )}

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
              {participants.length === 0 && guestCount === 0 && (
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
              {guestCount > 0 &&
                Array.from({ length: guestCount }, (_, idx) => (
                  <li
                    className="chip guest"
                    key={`guest-${idx}`}
                    aria-label={guestChipAriaLabel(idx + 1, guestCount)}
                  >
                    {GUEST_CHIP_LABEL}
                  </li>
                ))}
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
    </>
  );
}
