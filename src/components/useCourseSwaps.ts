import { useState } from "react";
import type { Course, CourseDateOverride, Swap, SwapStatus } from "../types"; 
import { courses } from "../data/courses";
import { getEffectiveWaitlist } from "../lib/waitlist";
import { sameDayUTC } from "../lib/dates";

export function useCourseSwaps(initialOverrides: CourseDateOverride[] = [], initialSwaps: Swap[] = []) {
  // zentrale, termin-spezifische Änderungen im State
  const [overrides, setOverrides] = useState<CourseDateOverride[]>(initialOverrides);
  const [swaps, setSwaps] = useState<Swap[]>(initialSwaps);

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

    // 🟡 Vorwarnung bei bestehender Warteliste
    const waitlist = getEffectiveWaitlist(course, overrides, dateIso);
    if (waitlist.length > 0) {
      const proceed = confirm(
        `Achtung: Für diesen Termin existiert eine Warteliste (${waitlist.length} Person(en)). ` +
          `Deine Absage hat direkte Auswirkungen – jemand rückt automatisch nach. Möchtest du fortfahren?`
      );
      if (!proceed) return;
    }

    // Wir merken uns, ob jemand aus der Warteliste nachgerückt ist,
    // um danach den Swap-Status von pending -> active zu setzen.
    let promoted: { user: string; toCourseId: number; toDateIso: string } | null = null;

    setOverrides((prev) => {
      const updated = [...prev];

      const date = new Date(dateIso);
      const idx = prev.findIndex(
        (o) => o.courseId === course.id && sameDayUTC(new Date(o.date), date)
      );
      const baseOverride: CourseDateOverride = idx >= 0
        ? updated[idx]
        : {
            courseId: course.id,
            date: dateIso,
            participants: [...course.participants],
            swapped: [],
            waitlist: [],
          };

      const courseCapacity = course.capacity;
      const isIn = baseOverride.participants.includes(userName);

      // --------- A) ABSAGE ----------
      if (isIn) {
        let nextOverride: CourseDateOverride = {
          ...baseOverride,
          participants: baseOverride.participants.filter((p) => p !== userName),
        };

        // Direkt im gleichen Draft: Nachrücken, falls möglich
        if (
          nextOverride.participants.length < courseCapacity &&
          (nextOverride.waitlist?.length ?? 0) > 0
        ) {
          const nextUser = nextOverride.waitlist![0];
          nextOverride = {
            ...nextOverride,
            participants: [...nextOverride.participants, nextUser],
            swapped: [...(nextOverride.swapped ?? []), nextUser],
            waitlist: nextOverride.waitlist!.slice(1),
          };

          // Ursprungs-Termin des Nachrückers austragen (falls pending Swap vorhanden)
          const pending = swaps.find(
            (s) =>
              s.user === nextUser &&
              s.toCourseId === course.id &&
              s.toDate === dateIso &&
              s.status === "pending"
          );
          if (pending) {
            const originIdx = updated.findIndex(
              (o) => o.courseId === pending.fromCourseId && o.date === pending.fromDate
            );
            if (originIdx >= 0) {
              const originOv = updated[originIdx];
              updated[originIdx] = {
                ...originOv,
                participants: originOv.participants.filter((p) => p !== nextUser),
              };
            } else {
              // kein Override für Ursprung → aus Basis austragen
              const originCourse = courses.find((c) => c.id === pending.fromCourseId);
              if (originCourse) {
                updated.push({
                  courseId: originCourse.id,
                  date: pending.fromDate,
                  participants: originCourse.participants.filter((p) => p !== nextUser),
                  swapped: [],
                  waitlist: [],
                });
              }
            }

            // nach dem State-Commit den Swap auf "active" setzen
            promoted = { user: nextUser, toCourseId: course.id, toDateIso: dateIso };
          }
        }

        // Override reinschreiben
        if (idx >= 0) updated[idx] = nextOverride;
        else updated.push(nextOverride);

        return updated;
      }
      // --------- B) RÜCKNAHME ----------
      const canRejoin = baseOverride.participants.length < courseCapacity;
      if (!canRejoin) {
        alert("Dieser Termin ist inzwischen voll – Rücknahme nicht möglich.");
        return prev; // keine Änderung
      }

      const nextOverride: CourseDateOverride = {
        ...baseOverride,
        participants: [...baseOverride.participants, userName],
        // swapped/waitlist unverändert übernehmen
      };

      if (idx >= 0) updated[idx] = nextOverride;
      else updated.push(nextOverride);

      return updated;
    });

    // Falls jemand nachgerückt ist: pending → active umstellen (separater State)
    if (promoted) {
      setSwaps((prev) =>
        prev.map((s) =>
          s.user === promoted!.user &&
          s.toCourseId === promoted!.toCourseId &&
          s.toDate === promoted!.toDateIso &&
          s.status === "pending"
            ? { ...s, status: "active" }
            : s
        )
      );
      // TODO: hier könnte man auch die Mail-Benachrichtigung triggern
    }
  }

  function tryPromoteWaitlist(courseId: number, dateIso: string) {
    setOverrides((prevOverrides) => {
      const updated = [...prevOverrides];
      const idx = updated.findIndex(
        (o) => o.courseId === courseId && o.date === dateIso
      );
      if (idx < 0) return updated; // nix gefunden

      const course = courses.find((c) => c.id === courseId);
      if (!course) return updated;

      const override = updated[idx];
      const effectiveParticipants = override.participants;
      const capacity = course.capacity;

      if (
        effectiveParticipants.length < capacity &&
        override.waitlist !== undefined &&
        override.waitlist.length > 0
      ) {
        // den ersten Nachrücker nehmen
        const nextUser = override.waitlist[0];

        // Teilnehmer hinzufügen
        const newParticipants = [...effectiveParticipants, nextUser];
        const newSwapped = [...(override.swapped ?? []), nextUser];
        const newWaitlist = override.waitlist.slice(1);

        updated[idx] = {
          ...override,
          participants: newParticipants,
          swapped: newSwapped,
          waitlist: newWaitlist,
        };

        // Swaps-Status updaten: pending → active (nur wenn der Status passt)
        setSwaps((prevSwaps) => {
          const nextSwaps = prevSwaps.map((s) =>
            s.user === nextUser &&
            s.toCourseId === courseId &&
            s.toDate === dateIso &&
            s.status === "pending"
              ? { ...s, status: "active" as SwapStatus }
              : s
          );
        

          // Origin austragen
          const swap = nextSwaps.find(
            (s) =>
              s.user === nextUser &&
              s.toCourseId === courseId &&
              s.toDate === dateIso
          );
          if (swap) {
            const originIdx = updated.findIndex(
              (o) => o.courseId === swap.fromCourseId && o.date === swap.fromDate
            );
            if (originIdx >= 0) {
              updated[originIdx] = {
               ...updated[originIdx],
                participants: updated[originIdx].participants.filter(
                  (p) => p !== nextUser
                ),
              };
            }
          }
          
          return nextSwaps; 
        });
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

    // Wenn es bereits eine Warteliste gibt -> NICHT bestätigen, sondern in die Warteliste (requestSwap)
    const hasWaitlist =
      !!(existingTargetOverride && Array.isArray(existingTargetOverride.waitlist) && existingTargetOverride.waitlist.length > 0);

    if (hasWaitlist) {
      // automatischer Fallback: statt direktem Eintragen -> Warteliste
      requestSwap(fromCourse, fromDateIso, toCourseId, toDateIso, userName);
      alert("Dieser Termin hat bereits eine Warteliste. Du wurdest in die Warteliste eingetragen.");
      return;
    }

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
          const newWaitlist = (o.waitlist ?? []).filter((u) => u !== swap.user);
          return { ...o, participants: newParticipants, swapped: newSwapped, waitlist: newWaitlist };
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

  function requestSwap(
    fromCourse: Course,
    fromDateIso: string,
    toCourseId: number,
    toDateIso: string,
    userName: string
  ) {
    // 1) prüfen, ob schon ein Swap existiert
    const existing = swaps.find(
      (s) =>
        s.user === userName &&
        s.fromCourseId === fromCourse.id &&
        s.fromDate === fromDateIso
    );
    if (existing) {
      alert("Du hast bereits einen Tausch für diesen Termin gestartet!");
      return;
    }

    // 2) Zielkurs suchen
    const targetCourse = courses.find((c) => c.id === toCourseId);
    if (!targetCourse) {
      alert("Zielkurs nicht gefunden.");
      return;
    }

    // 3) in Overrides die Warteliste ergänzen
    setOverrides((prev) => {
      const updated = [...prev];
      const targetIdx = updated.findIndex(
        (o) => o.courseId === toCourseId && o.date === toDateIso
      );

      if (targetIdx >= 0) {
        const cur = updated[targetIdx];
        // nur hinzufügen, falls User nicht schon drin
        if (!cur.waitlist?.includes(userName)) {
          updated[targetIdx] = {
            ...cur,
            waitlist: [...(cur.waitlist ?? []), userName],
          };
        }
      } else {
        // Override neu anlegen → Basis sind immer die aktuellen Kursdaten
        const baseParticipants = targetCourse.participants;
        updated.push({
          courseId: toCourseId,
          date: toDateIso,
          participants: [...baseParticipants],  // alle bisherigen Teilnehmer
          swapped: [],
          waitlist: [userName], // neue Warteliste
        });
      }

      return updated;
    });

    // 4) Swap mit Status "pending" speichern
    setSwaps((prev) => [
      ...prev,
      {
        user: userName,
        fromCourseId: fromCourse.id,
        fromDate: fromDateIso,
        toCourseId,
        toDate: toDateIso,
        status: "pending",
      },
    ]);
  }


  return {
    overrides,
    swaps,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    tryPromoteWaitlist,
  };


}