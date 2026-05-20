import { useEffect, useMemo, useState } from "react";
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
import { getAvailableDates, getWaitlistDates, toDateKey } from "../lib/dates";
import type { SwapSettings } from "../types";

type Props = {
  course: Course;
  allCourses: Course[];
  currentUser: User;
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
};


function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export default function CourseCard({
  course,
  allCourses,
  currentUser,
  dates,
  overrides,
  swaps,
  participantActionsLocked = false,
  tenantSettings,
  onToggleAbsence,
  confirmSwap,
  requestSwap,
  cancelSwap,
}: Props) {
  const swapWindow: SwapSettings = useMemo(
    () => resolveSwapWindow(tenantSettings),
    [tenantSettings],
  );

  const [selectedDate, setSelectedDate] = useState<string>(
    dates[0]?.toISOString() || ""
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
  const freeSpots = course.capacity - participants.length;
  const waitlist = hasNoUpcomingDates ? [] : (override?.waitlist ?? []);

  const userNameLower = userName.toLowerCase();
  const isParticipant = participants.some((p) => p.toLowerCase() === userNameLower);
  const originallyParticipant = course.participants.some((p) => p.toLowerCase() === userNameLower);
  const hasCancelled = originallyParticipant && !isParticipant;

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
  const canUseTermActions =
    !participantActionsLocked && hasUpcomingDates && (isParticipant || originallyParticipant);

  const inactiveNotice = participantActionsLocked
    ? showAutoInactiveBadge || (!isInactiveCourse && inPostEndGrace)
      ? graceLastIso
        ? `Dieser Kurs wurde automatisch beendet (keine weiteren Termine). Offene Tausche kannst du noch bis ${formatCourseIsoDateDe(graceLastIso)} verwalten.`
        : "Dieser Kurs wurde automatisch beendet. Du kannst nur noch bestehende Tausche verwalten."
      : graceLastIso
        ? `Dieser Kurs ist inaktiv. Offene Tausche kannst du noch bis ${formatCourseIsoDateDe(graceLastIso)} verwalten.`
        : "Dieser Kurs ist inaktiv. Du kannst nur noch bestehende Tausche verwalten."
    : null;

  useEffect(() => {
    if (showLastTermInSelect && lastOccurrenceDate) {
      setSelectedDate(lastOccurrenceDate.toISOString());
    }
  }, [showLastTermInSelect, lastOccurrenceIso, course.time, lastOccurrenceDate]);

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

      <div className="course-row">
        <div className="muted">Kapazität</div>
        <div>
          {participants.length} / {course.capacity}
          {freeSpots > 0 && <span className="free-slot"> · Platz frei!</span>}
        </div>
      </div>

      <div className="course-row">
        <div className="muted">Termine:</div>
        <select
          value={hasNoUpcomingDates && !showLastTermInSelect ? "" : selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          disabled={hasNoUpcomingDates && !showLastTermInSelect}
        >
          {showLastTermInSelect && lastOccurrenceDate ? (
            <option value={lastOccurrenceDate.toISOString()}>
              {lastOccurrenceDate.toLocaleDateString()} (letzter Termin)
            </option>
          ) : hasNoUpcomingDates ? (
            <option value="">—</option>
          ) : (
            dates
              .filter((d) => d >= new Date())
              .map((date, index) => (
                <option key={index} value={date.toISOString()}>
                  {date.toLocaleDateString()}
                </option>
              ))
          )}
        </select>
      </div>

      <div className="course-row list-row">
        <div className="label muted">Teilnehmer</div>
        <div className="chips">
          {participants.length === 0 && <span className="chip">—</span>}
          {participants.map((name) => (
            <span
              className={`chip ${swapped.includes(name) ? "swapped" : ""}`}
              key={name}
            >
              {name}
            </span>
          ))}
          {freeSpots > 0 &&
            Array.from({ length: freeSpots }).map((_, idx) => (
              <span className="chip free" key={`free-${idx}`}>
                frei
              </span>
            ))}
        </div>
      </div>

      {/* Warteliste anzeigen */}
      <div className="course-row list-row">
        <div className="label muted">Warteliste</div>
        <div className="chips">
          {waitlist.length === 0 ? (
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

      {hasNoUpcomingDates && !participantActionsLocked && (
        <div className="course-row">
          <span className="muted small">Zur Zeit sind keine zukünftigen Termine für diesen Kurs geplant.</span>
        </div>
      )}

      {inactiveNotice && (
        <div className="course-row course-inactive-notice" role="status">
          <span className="muted small">{inactiveNotice}</span>
        </div>
      )}

      {canUseTermActions ? (
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
                  : "Tausch abbrechen"}
              </button>
            </>
          ) : (
            <>
              {isParticipant ? (
                <button
                  className="danger"
                  onClick={() => onToggleAbsence(course, selectedDateKey, userName)}
                >
                  Termin absagen
                </button>
              ) : hasCancelled ? (
                <button onClick={() => onToggleAbsence(course, selectedDateKey, userName)}>
                  Absage zurücknehmen
                </button>
              ) : (
                <div className="muted">Nicht in diesem Termin eingetragen</div>
              )}

              {(originallyParticipant || hasCancelled) && (
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
              
            </>
          )}
          {/* 🆕 Wenn schon pending-Requests existieren: zusätzlicher Button */}
              {hasPendingRequestsFromOrigin && (
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
            <div className="muted">Nicht in diesem Termin eingetragen</div>
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
      {canUseTermActions && showSwapModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h4>
              {hasCancelled
                ? "Freien Termin auswählen (folgt)"
                : "Tauschanfrage starten"}
            </h4>
            <p>
              Ausgewählter Termin:{" "}
              <strong>
                {new Date(selectedDate).toLocaleDateString()}
              </strong>{" "}
              · {course.name}
            </p>

            {availableSwapDates.length > 0 ? (
              <>
                <p className="muted">
                  Es stehen {availableSwapDates.length} freie Termin(e) zur Auswahl.
                </p>
                <select
                  value={swapDateIso ?? ""} // 
                  onChange={(e) => {
                    setSwapDateIso(e.target.value || null);
                    setSwapDateIsoWaitlist(null) // andere Auswahl zuruecksetzen
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
                <p className="muted" style={{ marginTop: "1em" }}>
                  Oder Wunsch auf die Warteliste setzen ({waitlistDates.length} mögliche):
                </p>
                <select
                  value={swapDateIsoWaitlist ?? ""}
                  onChange={(e) => {
                    setSwapDateIsoWaitlist(e.target.value || null);
                    setSwapDateIso(null); // andere Auswahl zurücksetzen
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
