import { useState } from "react";
import type { Course, User } from "../types";
import { courseDateOverrides } from "../data/courseOverrides";

type Props = {
  course: Course;
  currentUser: User;
  isEnrolled: boolean;
  isAbsent: boolean;
  swapRequested: boolean;
  onToggleAbsence: (courseId: number) => void;
  onToggleSwap: (courseId: number) => void;
  dates: Date[]; // Neues Propertie für die Datumsliste
};

function datesAreEqual(d1: Date, d2: Date) {
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}


export default function CourseCard({
  course,
  currentUser,
  isEnrolled,
  isAbsent,
  swapRequested,
  onToggleAbsence,
  onToggleSwap,
  dates,
}: Props) {
  // Start mit erstem Termin
  const [selectedDate, setSelectedDate] = useState(dates[0]?.toISOString() || "");

  // Teilnehmer abhängig vom gewählten Termin berechnen
  const override = courseDateOverrides.find(
    (o) =>
      o.courseId === course.id &&
      datesAreEqual(new Date(o.date), new Date(selectedDate))
  );
  const participants = override ? override.participants : course.participants;
  const swapped = override?.swapped || [];
  const capacityReached = participants.length >= course.capacity;

  return (
    <div className="course-card">
      <div className="course-head">
        <h3>{course.name}</h3>
        <div className="muted">{course.weekday} · {course.time}</div>
      </div>

      <div className="course-row">
        <div className="muted">Capacity</div>
        <div>
          {participants.length} / {course.capacity}
          {!capacityReached && <span className="free-slot"> · Platz frei!</span>}
        </div>
      </div>

      <div className="course-row">
        <div className="muted">Termine:</div>
        <select
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
        >
          {dates.map((date, index) => (
            <option key={index} value={date.toISOString()}>
              {date.toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      <div className="course-row">
        <div className="muted">Participants</div>
        <div className="chips">
          {participants.length === 0 && <span className="chip">—</span>}
          {participants.map(name => (
            <span
              key={name}
              className={`chip ${swapped.includes(name) ? "swapped" : ""}`}
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      {isEnrolled ? (
        <div className="actions">
          <button
            className={isAbsent ? "danger" : ""}
            onClick={() => onToggleAbsence(course.id)}
          >
            {isAbsent ? "Absage zurücknehmen" : "Termin absagen"}
          </button>
          <button
            className={swapRequested ? "secondary" : ""}
            onClick={() => onToggleSwap(course.id)}
          >
            {swapRequested ? "Tauschanfrage zurückziehen" : "Tauschen anfragen"}
          </button>
        </div>
      ) : (
        <div className="not-enrolled">Nicht in diesem Kurs eingeschrieben</div>
      )}
    </div>
  );
}
