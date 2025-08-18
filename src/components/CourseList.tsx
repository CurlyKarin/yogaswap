import { useState } from "react";
import { courses } from "../data/courses";
import type { Course, User, CourseDateOverride } from "../types";
import CourseCard from "./CourseCard";
import { courseDateOverrides as initialOverrides } from "../data/courseOverrides";

type Props = {
  currentUser: User;
};

function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export default function CourseList({ currentUser }: Props) {
  // zentrale, termin-spezifische Änderungen im State
  const [overrides, setOverrides] = useState<CourseDateOverride[]>(initialOverrides);

  function getCourseDates(course: Course) {
    const now = new Date();
    const [hours, minutes] = course.time.split(":").map(Number);
    return course.dates
      .map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes))
      .filter((d) => d >= now);
  }

  // Absage/Rücknahme für einen Termin
  function onToggleAbsence(course: Course, dateIso: string, userName: string) {
    setOverrides((prev) => {
      const date = new Date(dateIso);
      const idx = prev.findIndex(
        (o) => o.courseId === course.id && sameDayUTC(new Date(o.date), date)
      );

      // effektive Teilnehmerliste (Override oder Basis)
      const effectiveParticipants =
        idx >= 0 ? prev[idx].participants : course.participants;

      const isIn = effectiveParticipants.includes(userName);
      const updated = [...prev];

      if (isIn) {
        // ABSAGE: Nutzer aus der Teilnehmerliste entfernen
        const newList = effectiveParticipants.filter((p) => p !== userName);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], participants: newList };
        } else {
          updated.push({
            courseId: course.id,
            date: dateIso, // wichtig: genau das select-ISO speichern
            participants: newList,
            swapped: []
          });
        }
      } else {
        // RÜCKNAHME: nur wenn Kapazität noch nicht voll
        if (effectiveParticipants.length < course.capacity) {
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              participants: [...updated[idx].participants, userName]
            };
          } else {
            updated.push({
              courseId: course.id,
              date: dateIso,
              participants: [...effectiveParticipants, userName],
              swapped: []
            });
          }
        } else {
          alert("Dieser Termin ist inzwischen voll – Rücknahme nicht möglich.");
        }
      }

      return updated;
    });
  }

  // (Platzhalter) Tausch-Handler – kann später erweitert werden
  function onToggleSwap(course: Course, dateIso: string, userName: string) {
    console.log("Swap toggle (noch nicht implementiert)", {
      course: course.name,
      dateIso,
      userName
    });
  }

  return (
    <div className="grid">
      {courses.map((course) => {
        const dates = getCourseDates(course);
        const isEnrolled = currentUser.enrolledCourseIds.includes(course.id);

        return (
          <CourseCard
            key={course.id}
            course={course}
            currentUser={currentUser}
            isEnrolled={isEnrolled}
            dates={dates}
            overrides={overrides}
            onToggleAbsence={onToggleAbsence}
            onToggleSwap={onToggleSwap}
          />
        );
      })}
    </div>
  );
}
