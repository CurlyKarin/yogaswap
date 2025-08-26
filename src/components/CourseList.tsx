import { useState } from "react";
import { courses } from "../data/courses";
import type { Course, User, CourseDateOverride, Swap } from "../types";
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
  const [swaps, setSwaps] = useState<Swap[]>([]);

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
  
  // Swap starten
  function confirmSwap(fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) {
    //if (!swapModal) return;
    //const { course: fromCourse, dateIso: fromDateIso, userName } = swapModal;

    // Swap nur 1x aktiv pro User
    const existing = swaps.find(s => s.user === userName);
    if (existing) {
      alert("Du hast bereits einen aktiven Tausch!");
      return;
    }

    setOverrides(prev => {
    let updated = [...prev];

    // Ursprung austragen
    const originIdx = updated.findIndex(o => o.courseId === fromCourse.id && o.date === fromDateIso);
    if (originIdx >= 0) {
      updated[originIdx] = {
        ...updated[originIdx],
        participants: updated[originIdx].participants.filter(p => p !== userName),
      };
    }

    // Ziel eintragen
    const targetCourse = courses.find(c => c.id === toCourseId)!;
    const targetIdx = updated.findIndex(o => o.courseId === toCourseId && o.date === toDateIso);
    const effective = targetIdx >= 0 ? updated[targetIdx].participants : targetCourse.participants;

    if (!effective.includes(userName)) {
      if (targetIdx >= 0) {
        updated[targetIdx] = { 
          ...updated[targetIdx], 
          participants: [...effective, userName],
          swapped: [...new Set([...(updated[targetIdx].swapped ?? []), userName])]
        };
      } else {
        updated.push({
          courseId: toCourseId,
          date: toDateIso,
          participants: [...effective, userName],
          swapped: [userName]
        });
      }
    }

    return updated;
  });

    // 3. Swap speichern
    setSwaps(prev => [...prev, {
      user: userName,
      fromCourseId: fromCourse.id,
      fromDate: fromDateIso,
      toCourseId,
      toDate: toDateIso
    }]);
  }

  // Swap löschen
  function cancelSwap(swap: Swap) {
    setSwaps(prev => prev.filter(s => s !== swap));
  
    setOverrides((prev) => {
      let updated = [...prev];

      // Zieltermin austragen
      const targetIdx = updated.findIndex(
        (o) => o.courseId === swap.toCourseId && o.date === swap.toDate
      );
      if (targetIdx >= 0) {
        updated[targetIdx] = {
          ...updated[targetIdx],
          participants: updated[targetIdx].participants.filter((p) => p !== swap.user),
          swapped: (updated[targetIdx].swapped ?? []).filter((u) => u !== swap.user),
        };
      }

      // Ursprungstermin könnte der User wieder per Rücknahme belegen –
      // daher: NICHT automatisch eintragen, sondern nur Button anzeigen
      return updated;
    });
  }


  return (
    <>
      <div className="grid">
        {courses.map((course) => {
          const dates = getCourseDates(course);
          return (
            <CourseCard
              key={course.id}
              course={course}
              currentUser={currentUser}
              dates={dates}
              overrides={overrides}
              swaps={swaps}
              onToggleAbsence={onToggleAbsence}
              confirmSwap={confirmSwap}
              cancelSwap={cancelSwap}
            />
          );
        })}
      </div>
    </>
  );
}
