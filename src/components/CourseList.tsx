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

  function onToggleAbsence(course: Course, dateIso: string, userName: string) {
    // 👉 Absage/Rücknahme blockieren, wenn bereits Swap für diesen Termin existiert
    const hasSwap = swaps.some(
      (s) =>
        s.user === userName &&
        s.fromCourseId === course.id &&
        s.fromDate === dateIso
    );
    if (hasSwap) {
      alert("Absagen nicht möglich, solange ein Tausch aktiv oder offen ist.");
      return;
    }

    setOverrides((prev) => {
      const date = new Date(dateIso);
      const idx = prev.findIndex(
        (o) => o.courseId === course.id && sameDayUTC(new Date(o.date), date)
      );

      const effectiveParticipants =
        idx >= 0 ? prev[idx].participants : course.participants;

      const isIn = effectiveParticipants.includes(userName);
      const updated = [...prev];

      if (isIn) {
        // ABSAGE
        const newList = effectiveParticipants.filter((p) => p !== userName);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], participants: newList }; // 👈 swapped unverändert
        } else {
          updated.push({
            courseId: course.id,
            date: dateIso,
            participants: newList,
            swapped: [], // neu, daher leer
            waitlist: [],  // neu, daher leer
          });
        }
      } else {
        // RÜCKNAHME (nur wenn noch Platz)
        if (effectiveParticipants.length < course.capacity) {
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              participants: [...updated[idx].participants, userName],
              swapped: updated[idx].swapped // 👈 beibehalten
            };
          } else {
            updated.push({
              courseId: course.id,
              date: dateIso,
              participants: [...effectiveParticipants, userName],
              swapped: [], // neu, daher leer
              waitlist: [],  // neu, daher leer
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
    // Swap nur 1x aktiv pro User+Termin
    const existing = swaps.find(
      (s) =>
        s.user === userName &&
        s.fromCourseId === fromCourse.id &&
        s.fromDate === fromDateIso
    );
    if (existing) {
      alert("Du hast bereits einen aktiven Tausch für diesen Termin!");
      return;
    }

    // 2) Kapazitäts-Check (vorher, damit nichts halb geändert wird)
    const targetCourse = courses.find((c) => c.id === toCourseId);
    if (!targetCourse) {
      alert("Zielkurs nicht gefunden.");
      return;
    }
    const existingTargetOverride = overrides.find(
      (o) => o.courseId === toCourseId && o.date === toDateIso
    );
    const effectiveTargetParticipants = existingTargetOverride
      ? existingTargetOverride.participants
      : targetCourse.participants;
    if (effectiveTargetParticipants.length >= targetCourse.capacity) {
      alert("Der gewählte Ersatztermin ist inzwischen voll.");
      return;
    }

    setOverrides((prev) => {
      let updated = [...prev];

      // Ursprung austragen
      const originIdx = updated.findIndex(
        (o) => o.courseId === fromCourse.id && o.date === fromDateIso
      );
      if (originIdx >= 0) {
        updated[originIdx] = {
          ...updated[originIdx],
          participants: updated[originIdx].participants.filter(
            (p) => p !== userName
          ),
          swapped: updated[originIdx].swapped ?? [],
          waitlist: updated[originIdx].waitlist ?? [],
        };
      } else {
        // wenn noch kein Override → neu anlegen, damit der User wirklich raus ist
        const baseParticipants = fromCourse.participants.filter(
          (p) => p !== userName
        );
        updated.push({
          courseId: fromCourse.id,
          date: fromDateIso,
          participants: baseParticipants,
          swapped: [],
          waitlist: [],
        });
      }

      // b) Target: suchen oder neu anlegen; participants + swapped updaten
      const targetIdx = updated.findIndex(
        (o) => o.courseId === toCourseId && o.date === toDateIso
      );
      if (targetIdx >= 0) {
        const cur = updated[targetIdx];
        const newParticipants = cur.participants.includes(userName)
          ? cur.participants
          : [...cur.participants, userName];
         updated[targetIdx] = {
          ...cur,
          participants: newParticipants,
          swapped: [...new Set([...(cur.swapped ?? []), userName])],
          waitlist: cur.waitlist ?? [],
        };
      } else {
        // neue Override basierend auf Basis-Teilnehmern des Zielkurses
        const baseTarget = [...targetCourse.participants];
        if (!baseTarget.includes(userName)) baseTarget.push(userName);
        updated.push({
          courseId: toCourseId,
          date: toDateIso,
          participants: baseTarget,
          swapped: [userName],
          waitlist: [],
        });
      }

      return updated;
    });

    // 3. Swap speichern
    setSwaps(prev => [...prev, {
      user: userName,
      fromCourseId: fromCourse.id,
      fromDate: fromDateIso,
      toCourseId,
      toDate: toDateIso,
      status: "active",
    }]);
  }

  // Swap löschen
  function cancelSwap(swap: Swap) {
    // 1) Swap aus dem Swap-State entfernen
    setSwaps((prev) => prev.filter(
      (s) =>
        !(
          s.user === swap.user &&
          s.fromCourseId === swap.fromCourseId &&
          s.fromDate === swap.fromDate &&
          s.toCourseId === swap.toCourseId &&
          s.toDate === swap.toDate
        )
    ));

    // 2) Ziel-Override bereinigen: user aus participants & swapped entfernen
    setOverrides((prev) => {
      let updated = prev.map((o) => {
        if (o.courseId === swap.toCourseId && o.date === swap.toDate) {
          const newParticipants = o.participants.filter((p) => p !== swap.user);
          const newSwapped = (o.swapped ?? []).filter((u) => u !== swap.user);
          return { ...o, participants: newParticipants, swapped: newSwapped };
        }
        return o;
      });

      // 3) Optional: Aufräumen - entferne Overrides, die wieder "neutral" sind
      // (neutral = keine swapped-Einträge UND participants == Basis-Teilnehmer des Kurses)
      updated = updated.filter((o) => {
        const course = courses.find((c) => c.id === o.courseId);
        if (!course) return true;
        const swappedEmpty = !(o.swapped && o.swapped.length > 0);
        const participantsEqualBase =
          o.participants.length === course.participants.length &&
          o.participants.every((p) => course.participants.includes(p));
        // wenn beides zutrifft: override ist wieder überflüssig
        return !(swappedEmpty && participantsEqualBase);
      });

      return updated;
    });

    // Hinweis: Ursprungstermin behalten wir als "abgesagt" (Override bleibt),
    // wie von dir gewünscht — Benutzer kann danach ggf. manuell Rücknahme klicken.
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
