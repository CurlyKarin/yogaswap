import { useState } from "react";
import type { Course, User, CourseDateOverride, Swap } from "../types";
import { courses } from "../data/courses";
import { swapSettings } from "../data/swapSettings";
import { getAvailableDates, getWaitlistDates, toDateKey } from "../lib/dates";

type Props = {
  course: Course;
  currentUser: User;
  dates: Date[];
  overrides: CourseDateOverride[];
  swaps: Swap[];
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
  currentUser,
  dates,
  overrides,
  swaps,
  onToggleAbsence,
  confirmSwap,
  requestSwap,
  cancelSwap,
}: Props) {

  const [selectedDate, setSelectedDate] = useState<string>(
    dates[0]?.toISOString() || ""
  );
  const [swapDateIso, setSwapDateIso] = useState<string | null>(null);
  const [swapDateIsoWaitlist, setSwapDateIsoWaitlist] = useState<string | null>(null);

  const [showSwapModal, setShowSwapModal] = useState(false);

  // passenden Override für den aktuell gewählten Termin suchen
  const override = overrides.find(
    (o) =>
      o.courseId === course.id &&
      sameDayUTC(new Date(o.date), new Date(selectedDate))
  );

  const participants = override ? override.participants : course.participants;
  const swapped = override?.swapped ?? [];
  const freeSpots = course.capacity - participants.length;
  const waitlist = override?.waitlist ?? [];

  // Status des aktuellen Users bzgl. ausgewähltem Termin
  const userName = currentUser.nickname; // Teilnehmerliste nutzt Nicknames
  const isParticipant = participants.includes(userName);
  const originallyParticipant = course.participants.includes(userName);
  const hasCancelled = originallyParticipant && !isParticipant;
 
  // Optionen für Zieltermine (aus allen Kursen, mit Regeln/Filtern)
  const availableSwapDates = getAvailableDates(
    courses,
    overrides,
    currentUser,
    swapSettings,
    new Date(selectedDate) // Referenzdatum
  )
    // aufsteigend sortieren
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const waitlistDates = getWaitlistDates(
    courses,
    overrides,
    currentUser,
    swapSettings,
    new Date(selectedDate) // Referenzdatum
  )
    // aufsteigend sortieren
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const selectedDateKey = toDateKey(new Date(selectedDate));

  // Gibt es für diesen Kurs+Termin einen Swap, an dem der User beteiligt ist?
  const swapForThisTerm = swaps.find(
    (s) =>
      s.user === userName &&
      (
        (s.fromCourseId === course.id && s.fromDate === selectedDateKey) ||
        (s.toCourseId === course.id && s.toDate === selectedDateKey)
      )
  );

  const allSwapsForThisTerm = swaps.filter(
    (s) =>
      (s.fromCourseId === course.id && s.fromDate === selectedDateKey && s.user === userName) ||
      (s.toCourseId === course.id && s.toDate === selectedDateKey && s.user === userName)
    );

  const swapForWaitlist = swaps.find(
    (s) =>
      s.user === userName &&
      s.toCourseId === course.id &&
      s.toDate === selectedDateKey &&
      s.status === "pending"
  );

  const pendingSwapsFromOrigin = swaps.filter(
  (s) =>
    s.user === userName &&
    s.fromCourseId === course.id &&
    s.fromDate === selectedDateKey &&
    s.status === "pending"
);

const pendingCount = pendingSwapsFromOrigin.length;
const hasPendingRequestsFromOrigin = pendingCount > 0;



  // ------------------ return ------------------
  return (
    <div className="course-card">
      <div className="course-head">
        <h3>{course.name}</h3>
        <div className="muted">
          {course.weekday} · {course.time}
        </div>
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
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        >
          {dates
            .filter((d) => d >= new Date()) // nur zukünftige im Dropdown
            .map((date, index) => (
              <option key={index} value={date.toISOString()}>
                {date.toLocaleDateString()}
              </option>
            ))}
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

      {isParticipant || originallyParticipant ? (
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

      ) : (
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
        )
      }
      </>
      )}
      
      {/* 🆕 Status-Text jetzt separat unter den Buttons */}
      {allSwapsForThisTerm.length > 0 && (
        <div className="muted small status-text">
          {allSwapsForThisTerm.map((swap, idx) => (
            <div key={idx}>
          {swap.status === "pending" && swap.fromCourseId === course.id
            ? `Tauschanfrage für ${new Date(
                swap.toDate
              ).toLocaleDateString()} · ${
                courses.find((c) => c.id === swap.toCourseId)?.name
              }`
            : swap.status === "pending" && swap.toCourseId === course.id
            ? `Tauschanfrage zu ${new Date(
                swap.fromDate
              ).toLocaleDateString()} · ${
                courses.find((c) => c.id === swap.toCourseId)?.name
              }`
            : swap.fromCourseId === course.id
            ? `Getauscht mit ${new Date(
                swap.toDate
              ).toLocaleDateString()} · ${
                courses.find((c) => c.id === swap.toCourseId)?.name
              }`
            : `Getauscht von ${new Date(
                swap.fromDate
              ).toLocaleDateString()} · ${
                courses.find((c) => c.id === swap.fromCourseId)?.name
              }`}
            </div>
          ))}
        </div>
      )}
      {/* Swap-Modal (noch ohne Terminliste anderer Kurse; bestätigt nur den Swap-Intent) */}
      {showSwapModal && (
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
