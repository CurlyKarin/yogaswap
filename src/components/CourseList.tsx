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

  // State fürs Swap-Modal
  const [swapModal, setSwapModal] = useState<{
    course: Course;
    dateIso: string;
    userName: string;
  } | null>(null);

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

  function onToggleSwap(dateIso: string, userName: string) {
    setOverrides((prev) => {
      const updated = [...prev];
      const targetDate = new Date(dateIso);

      // 1) Ursprungs-Override suchen (dort, wo der User drin ist)
    const originIdx = updated.findIndex((o) =>
      o.participants.includes(userName)
    );

    if (originIdx >= 0) {
      // User aus bestehendem Override austragen
      updated[originIdx] = {
        ...updated[originIdx],
        participants: updated[originIdx].participants.filter(
          (p) => p !== userName
        ),
      };
    } else {
      // Kein Override vorhanden → neuen für Ursprungstermin anlegen
      const originCourse = courses.find((course) =>
        course.participants.includes(userName)
      );
      if (originCourse) {
        const originDate = originCourse.dates.find((d) => {
          const [h, m] = originCourse.time.split(":").map(Number);
          const cDate = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
            h,
            m
          );
          return cDate >= new Date(); // nächster gültiger Termin
        });
        if (originDate) {
          const [h, m] = originCourse.time.split(":").map(Number);
          const originDateIso = new Date(
            originDate.getFullYear(),
            originDate.getMonth(),
            originDate.getDate(),
            h,
            m
          ).toISOString();

          updated.push({
            courseId: originCourse.id,
            date: originDateIso,
            participants: originCourse.participants.filter(
              (p) => p !== userName
            ),
            swapped: [],
          });
        }
      }
    }

    // 2) Zielkurs anhand Termin finden
    const targetCourse = courses.find((course) =>
      course.dates.some((d) => {
        const [h, m] = course.time.split(":").map(Number);
        const cDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
        return cDate.getTime() === targetDate.getTime();
      })
    );

    if (!targetCourse) {
      console.warn("Kein Kurs zum Zieltermin gefunden:", dateIso);
      return updated;
    }

    // 3) Override für Zieltermin suchen oder anlegen
    let targetOverride = updated.find(
      (o) =>
        o.courseId === targetCourse.id &&
        new Date(o.date).getTime() === targetDate.getTime()
    );

    if (!targetOverride) {
      targetOverride = {
        courseId: targetCourse.id,
        date: dateIso,
        participants: [...targetCourse.participants],
        swapped: [],
      };
      updated.push(targetOverride);
    }

    // 4) User in Zieltermin eintragen
    if (!targetOverride.participants.includes(userName)) {
      targetOverride.participants.push(userName);
    }

    return updated;
  });

  setSwapModal(null);
  }
  
  function onConfirmSwap(targetDateIso: string, userName: string) {
    if (!swapModal) return;

    // Swap nur 1x aktiv pro User
    const existing = swaps.find(s => s.user === userName);
    if (existing) {
      alert("Du hast bereits einen aktiven Tausch!");
      setSwapModal(null);
      return;
    }

    setOverrides((prev) => {
      const targetDate = new Date(targetDateIso);

      // 1. User aus allen Kursen austragen, in denen er an diesem Tag eingetragen ist
      let updated = prev.map((o) =>
        o.participants.includes(userName)
          ? { ...o, participants: o.participants.filter((p) => p !== userName) }
          : o
      );

      // 2. Zielkurs anhand des Datums suchen
      const targetCourse = courses.find((c) =>
        c.dates.some((d) => sameDayUTC(d, targetDate))
      );

      if (!targetCourse) {
        console.warn("Kein passender Kurs für Zieltermin gefunden!");
        return updated;
      }

      // 3. Ziel-Override suchen oder anlegen
      const targetIdx = updated.findIndex(
        (o) => o.courseId === targetCourse.id && sameDayUTC(new Date(o.date), targetDate)
      );

      if (targetIdx >= 0) {
        // existiert schon → User hinzufügen
        updated[targetIdx] = {
          ...updated[targetIdx],
          participants: [...new Set([...updated[targetIdx].participants, userName])],
          swapped: [...new Set([...updated[targetIdx].swapped ?? [], userName])],
        };
      } else {
        // noch nicht vorhanden → mit Basis-Teilnehmern anlegen
        updated.push({
          courseId: targetCourse.id,
          date: targetDateIso,
          participants: [...new Set([...targetCourse.participants, userName])],
          swapped: [userName],
        });
      }

      return updated;
    });
    
  }
  
  // Swap löschen
  function cancelSwap(swap: Swap) {
    setSwaps(prev => prev.filter(s => s !== swap));
    // Zieltermin Eintrag löschen
    const course = courses.find(c => c.id === swap.toCourseId)!;
    onToggleAbsence(course, swap.toDate, swap.user);
    // Ursprungstermin wieder frei → kann rückgängig gemacht werden
    // (hier nicht automatisch eintragen, User kann Rücknahme klicken)
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
              onToggleSwap={onToggleSwap}
            />
          );
        })}
      </div>

      {swapModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Tauschanfrage</h3>
            <p>
              Du möchtest deinen Termin am{" "}
              {new Date(swapModal.dateIso).toLocaleDateString()} im Kurs{" "}
              <strong>{swapModal.course.name}</strong> tauschen.
            </p>
            <div className="actions">
              <button
                onClick={() => {
                  onToggleSwap(swapModal.dateIso, swapModal.userName);onConfirmSwap(swapModal.dateIso, swapModal.userName);
                  setSwapModal(null);
                }}
              >
                Bestätigen
              </button>
              <button onClick={() => setSwapModal(null)}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
