import { useState } from "react";
import type { Course, User, CourseDateOverride } from "../types";
import { courses } from "../data/courses";
import { swapSettings } from "../data/swapSettings";
import { getAvailableDates } from "../lib/dates";

type Props = {
  course: Course;
  currentUser: User;
  dates: Date[];
  overrides: CourseDateOverride[];
  onToggleAbsence: (course: Course, dateIso: string, userName: string) => void;
  onToggleSwap: (course: Course, dateIso: string, userName: string) => void;
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
  onToggleAbsence,
  onToggleSwap
}: Props) {
  // Vorauswahl: nächster zukünftiger Termin
  const [selectedDate, setSelectedDate] = useState<string>(
    dates[0]?.toISOString() || ""
  );
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

  // Status des aktuellen Users bzgl. ausgewähltem Termin
  const userName = currentUser.nickname; // Teilnehmerliste nutzt Nicknames
  const isParticipant = participants.includes(userName);
  const originallyParticipant = course.participants.includes(userName);
  const hasCancelled = originallyParticipant && !isParticipant;
  const canRejoin = hasCancelled && participants.length < course.capacity;

  const availableSwapDates = getAvailableDates(
    courses,
    overrides,
    currentUser,
    swapSettings,
    new Date(selectedDate),
  );

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

      <div className="course-row">
        <div className="muted">Teilnehmer</div>
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
      {isParticipant || originallyParticipant ? (
        <div className="actions">
          {isParticipant ? (
            <button
              className="danger"
              onClick={() => onToggleAbsence(course, selectedDate, userName)}
            >
              Termin absagen
            </button>
          ) : hasCancelled ? (
            <button
              disabled={!canRejoin}
              onClick={() => onToggleAbsence(course, selectedDate, userName)}
            >
              Absage zurücknehmen
            </button>
          ) : (
            <div className="muted">Nicht in diesem Termin eingetragen</div>
          )}

          {(originallyParticipant || hasCancelled) && (
            <button
              className="secondary"
              onClick={() => setShowSwapModal(true)}
            >
              {hasCancelled ? "Anderen Termin wählen" : "Tauschen anfragen"}
            </button>
          )}
        </div>
      ) : (
        <div className="not-enrolled">Nicht in diesem Kurs eingeschrieben</div>
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
              <select
                onChange={(e) => setSelectedDate(e.target.value)}
                value={selectedDate}
              >
                {availableSwapDates
                  .sort((a, b) => a.date.getTime() - b.date.getTime())
                  .map((swapDate, idx) => (
                    <option key={idx} value={swapDate.date.toISOString()}>
                      {new Intl.DateTimeFormat("de-DE", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit"
                      }).format(swapDate.date)}
                    </option>
                  ))}
              </select>
      ) : (
        <p className="muted">Keine passenden Ersatztermine verfügbar</p>
      )}

            <div className="modal-actions">
              <button onClick={() => setShowSwapModal(false)}>Schließen</button>
              <button
                className="primary"
                onClick={() => {
                  // jetzt wird direkt in CourseList eingetragen/ausgetragen
                  onToggleSwap(course, selectedDate, userName);
                  setShowSwapModal(false);
                }}
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
