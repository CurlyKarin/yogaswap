import { useState } from "react";
import type { Course, User, CourseDateOverride } from "../types";

type Props = {
  course: Course;
  currentUser: User;
  isEnrolled: boolean;
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
  isEnrolled,
  dates,
  overrides,
  onToggleAbsence,
  onToggleSwap
}: Props) {
  // vorauswahl: nächster Termin
  const [selectedDate, setSelectedDate] = useState<string>(
    dates[0]?.toISOString() || ""
  );

  // aktuellen Override ermitteln
  const override = overrides.find(
    (o) => o.courseId === course.id && sameDayUTC(new Date(o.date), new Date(selectedDate))
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
          {dates.map((date, index) => (
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
            <span className={`chip ${swapped.includes(name) ? "swapped" : ""}`} key={name}>
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

      {isEnrolled ? (
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

          <button
            className="secondary"
            onClick={() => onToggleSwap(course, selectedDate, userName)}
          >
            Tauschen anfragen
          </button>
        </div>
      ) : (
        <div className="not-enrolled">Nicht in diesem Kurs eingeschrieben</div>
      )}
    </div>
  );
}
