import type { Course, User } from "../types";

type Props = {
  course: Course;
  currentUser: User;
  isEnrolled: boolean;
  isAbsent: boolean;
  swapRequested: boolean;
  onToggleAbsence: (courseId: number) => void;
  onToggleSwap: (courseId: number) => void;
};

export default function CourseCard({
  course,
  currentUser,
  isEnrolled,
  isAbsent,
  swapRequested,
  onToggleAbsence,
  onToggleSwap,
}: Props) {
  return (
    <div className="course-card">
      <div className="course-head">
        <h3>{course.name}</h3>
        <div className="muted">{course.weekday} · {course.time}</div>
      </div>

      <div className="course-row">
        <div className="muted">Capacity</div>
        <div>{course.participants.length} / {course.capacity}</div>
      </div>

      <div className="course-row">
        <div className="muted">Participants</div>
        <div className="chips">
          {course.participants.length === 0 && <span className="chip">—</span>}
          {course.participants.map(n => (
            <span className="chip" key={n}>{n}</span>
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
