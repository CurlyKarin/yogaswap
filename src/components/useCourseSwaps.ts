import { useEffect, useState } from "react";
import type { Course, CourseDateOverride, Swap, SwapStatus } from "../types"; 
import { courses } from "../data/courses";
import { getEffectiveWaitlist } from "../lib/waitlist";
import { sameDayUTC } from "../lib/dates";

export function useCourseSwaps(initialOverrides: CourseDateOverride[] = [], initialSwaps: Swap[] = []) {
  // zentrale, termin-spezifische Änderungen im State
  const [overrides, setOverrides] = useState<CourseDateOverride[]>(initialOverrides);
  const [swaps, setSwaps] = useState<Swap[]>(initialSwaps);

    // 👉 Debug-Ausgabe bei jedem Swaps-Update
  useEffect(() => {
    console.log("🔄 Swaps updated:", swaps);
  }, [swaps]);

  function onToggleAbsence(course: Course, dateIso: string, userName: string) {
    // 👉 Absage/Rücknahme blockieren, wenn bereits Swap für diesen Termin existiert
    const hasSwap = swaps.some(
      (s) =>
        s.user === userName &&
        s.fromCourseId === course.id &&
        s.fromDate === dateIso &&
        s.status === "active" 
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
    let promoted: { user: string; toCourseId: number; toDateIso: string; fromCourseId: number; fromDate: string } | null = null;

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
            promoted = { user: nextUser, toCourseId: course.id, toDateIso: dateIso, fromCourseId: pending.fromCourseId, fromDate: pending.fromDate };
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

    if (promoted) { 
      // Falls jemand nachgerückt ist: pending → active umstellen (separater State)
      const { user, toCourseId, toDateIso, fromCourseId, fromDate } = promoted;
      setSwaps((prev) => {
        const updated = prev.map((s) =>
          s.user === user &&
          s.toCourseId === toCourseId &&
          s.toDate === toDateIso &&
          s.status === "pending"
            ? { ...s, status: "active" as const }
            : s
        );

        return updated.filter(
          (s) =>
            !(
              s.user === user &&
              s.fromCourseId === fromCourseId &&
              s.fromDate === fromDate &&
              s.status === "pending"
            )
        );
      });

      //  Wartelisten in Overrides bereinigen
      setOverrides((prev) =>
        prev.map((ov) =>
          ov.waitlist?.includes(user)
            ? { ...ov, waitlist: ov.waitlist.filter((u) => u !== user) }
            : ov
        )
      );

      // TODO: hier könnte man auch die Mail-Benachrichtigung triggern
    }
  }

  // Swap starten
  function confirmSwap(fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) {
    // Swap nur 1x aktiv pro User+Termin
    const existing = swaps.find(
      (s) =>
        s.user === userName &&
        s.fromCourseId === fromCourse.id &&
        s.fromDate === fromDateIso &&
        s.status === "active"
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

    cancelAllPendingSwapsFromOrigin(fromCourse.id, fromDateIso, userName);

    setSwaps((prev) => [
      ...prev,
      {
        user: userName,
        fromCourseId: fromCourse.id,
        fromDate: fromDateIso,
        toCourseId,
        toDate: toDateIso,
        status: "active" as const,
      },
    ]);
  }

  // Swap löschen
  function cancelSwap(swap: Swap, clickedCourseId: number) {
    const isOrigin = swap.fromCourseId === clickedCourseId;

    console.log("[cancelSwap] START", { swap, clickedCourseId, isOrigin });

    // alle zum ursprung gehörende Swaps löschen und Wartelisten bereinigen
    if (isOrigin && swap.status === "pending") {
      console.log("[cancelSwap] Ursprung + pending → alle bereinigen");
      cancelAllPendingSwapsFromOrigin(swap.fromCourseId, swap.fromDate, swap.user);
      return;
    }

    // 1) Overrides zuerst bereinigen
    setOverrides((prev) => {
      return prev.map((o) => {
        let newO = { ...o };
        const before = { ...o }; // vorheriger Zustand für Debug

        // Ursprungstermin
        if (isOrigin && o.courseId === swap.fromCourseId && o.date === swap.fromDate) {
          if (swap.status === "active") {
            newO.swapped = (o.swapped ?? []).filter((u) => u !== swap.user);
          } else if (swap.status === "pending") {
            newO.waitlist = (o.waitlist ?? []).filter((u) => u !== swap.user);
          }
        }

        // Zieltermin bereinigen, wenn Ursprung absagt
        if (isOrigin && o.courseId === swap.toCourseId && o.date === swap.toDate) {
          if (swap.status === "active") {
            newO.participants = o.participants.filter((p) => p !== swap.user);
            newO.swapped = (o.swapped ?? []).filter((u) => u !== swap.user);
          } else if (swap.status === "pending") {
            newO.waitlist = (o.waitlist ?? []).filter((u) => u !== swap.user);
          }
        }

        // Zieltermin bereinigen, wenn Ziel-Button gedrückt wird
        if (!isOrigin && o.courseId === swap.toCourseId && o.date === swap.toDate) {
          if (swap.status === "active") {
            newO.participants = o.participants.filter((p) => p !== swap.user);
            newO.swapped = (o.swapped ?? []).filter((u) => u !== swap.user);
          } else if (swap.status === "pending") {
            newO.waitlist = (o.waitlist ?? []).filter((u) => u !== swap.user);
          }
        }
        
        // Debug-Ausgabe, falls sich etwas geändert hat
        if (
          JSON.stringify(before.participants) !== JSON.stringify(newO.participants) ||
          JSON.stringify(before.swapped) !== JSON.stringify(newO.swapped) ||
          JSON.stringify(before.waitlist) !== JSON.stringify(newO.waitlist)
        ) {
          console.log("Override updated:", {
            courseId: o.courseId,
            date: o.date,
            before,
            after: newO,
          });
        }
        return newO;
      });
    });

    // 2) Swaps aufräumen
    setSwaps((prev) => {
      const filtered = isOrigin
        ? prev.filter(
            (s) =>
              !(
                s.user === swap.user &&
                s.fromCourseId === swap.fromCourseId &&
                s.fromDate === swap.fromDate
              )
          )
        : prev.filter(
            (s) =>
              !(
                s.user === swap.user &&
                s.fromCourseId === swap.fromCourseId &&
                s.fromDate === swap.fromDate &&
                s.toCourseId === swap.toCourseId &&
                s.toDate === swap.toDate
              )
          );

      console.log("Swaps after cancel:", filtered);
      return filtered;
    });

    // Hinweis: Der Ursprungstermin bleibt wie gehabt mit Override für Absage/Rücknahme bestehen.
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
        s.fromDate === fromDateIso &&
        s.toCourseId === toCourseId &&
        s.toDate === toDateIso
    );
    if (existing) {
      alert("Du hast diese Anfrage bereits gestellt!");
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

  function cancelAllPendingSwapsFromOrigin(
    fromCourseId: number,
    fromDateIso: string,
    userName: string
  ) {
    // Alle Pending-Swaps dieses Users vom Ursprungstermin merken
    const pendingFromOrigin = swaps.filter(
      (s) =>
        s.user === userName &&
        s.fromCourseId === fromCourseId &&
        s.fromDate === fromDateIso &&
        s.status === "pending"
    );

    // Swaps bereinigen
    setSwaps((prev) => {
      const withoutPending = prev.filter(
        (s) =>
          !(
            s.user === userName &&
            s.fromCourseId === fromCourseId &&
            s.fromDate === fromDateIso &&
            s.status === "pending"
          )
      );
      return withoutPending
    });

    // Wartelisten bereinigen (auf Basis der gemerkten pending-Swaps)
    setOverrides((prev) =>
      prev.map((o) => {
        const hadPendingSwap = pendingFromOrigin.some(
          (s) => s.toCourseId === o.courseId && s.toDate === o.date
        );
        if (hadPendingSwap) {
          return {
            ...o,
            waitlist: (o.waitlist ?? []).filter((u) => u !== userName),
          };
        }
        return o;
      })
    );
  }


  return {
    overrides,
    swaps,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
  };


}