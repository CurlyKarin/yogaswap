import { useEffect} from "react";
import type { Course} from "../types"; 
import { courses } from "../data/courses";
import { getEffectiveWaitlist } from "../lib/waitlist";
import { sameDayUTC } from "../lib/dates";
import { Swap, CourseDateOverride } from "@shared/types";
import { createSwap, deleteSwap, getSwaps, updateSwap } from "../api/swaps";
import { createOverride, deleteOverride, updateOverride } from "../api/overrides";

export function useCourseSwaps(
  overrides: CourseDateOverride[], // Erlaube undefined
  setOverrides: React.Dispatch<React.SetStateAction<CourseDateOverride[]>>,
  swaps: Swap[],
  setSwaps: React.Dispatch<React.SetStateAction<Swap[]>>,
) {
  
  // Filtere Overrides für aktuelle und zukünftige Termine
  // Fallback auf leeres Array, wenn overrides undefined oder kein Array ist
  const filteredOverrides = overrides;

  useEffect(() => {
    console.log('🔄 Filtered Overrides:', filteredOverrides);
    console.log('🔄 Swaps:', swaps);
  }, [filteredOverrides, swaps]);

  async function onToggleAbsence(course: Course, dateIso: string, userName: string) {
    // Absagen blockieren, wenn bereits aktiver Swap
    // TODO: Prüfen, ob diese Prüfung notwendig ist (Kommentar im Originalcode)
    const hasSwap = swaps.some(
      (s: Swap) =>
        s.user === userName &&
        s.fromCourseId === course.id &&
        s.fromDate === dateIso &&
        s.status === 'active'
    );

    if (hasSwap) {
      alert('Absagen nicht möglich, solange ein Tausch aktiv oder offen ist.');
      return;
    }

    // Warnung bei Warteliste
    const waitlist = getEffectiveWaitlist(course, filteredOverrides, dateIso);
    if (waitlist.length > 0) {
      const proceed = confirm(
        `Achtung: Für diesen Termin existiert eine Warteliste (${waitlist.length} Person(en)). ` +
        `Deine Absage hat direkte Auswirkungen – jemand rückt automatisch nach. Möchtest du fortfahren?`
      );
      if (!proceed) return;
    }

    const updateOrCreateOverride = (
      prev: CourseDateOverride[],
      nextOverride: CourseDateOverride,
      idx: number,
      courseId: number,
      dateIso: string
    ) => {
      const updated = [...prev];
      if (idx >= 0) {
        updated[idx] = nextOverride;
        updateOverride(courseId, dateIso, { participants: nextOverride.participants });
      } else {
        updated.push(nextOverride);
        createOverride(nextOverride);
      }
      return updated;
    };

    setOverrides((prev: CourseDateOverride[]) => {
      const date = new Date(dateIso);
      const idx = prev.findIndex(
        (o: CourseDateOverride) => o.courseId === course.id && sameDayUTC(new Date(o.date), date)
      );

      const baseOverride: CourseDateOverride =
        idx >= 0
          ? { ...prev[idx] }
          : {
              courseId: course.id,
              date: dateIso,
              participants: [...course.participants],
              swapped: [],
              waitlist: [],
            };

      const courseCapacity = course.capacity;
      const isIn = baseOverride.participants.includes(userName);

      let nextParticipants: string[];
      if (isIn) {
        // Absage: User entfernen
        nextParticipants = baseOverride.participants.filter((p) => p !== userName);
      } else {
        // Rücknahme: User hinzufügen, nur wenn Platz frei
        if (baseOverride.participants.length >= courseCapacity) {
          alert('Dieser Termin ist inzwischen voll – Rücknahme nicht möglich.');
          return prev;
        }
        nextParticipants = [...baseOverride.participants, userName];
      }

      const nextOverride: CourseDateOverride = {
        ...baseOverride,
        participants: nextParticipants,
      };

      return updateOrCreateOverride(prev, nextOverride, idx, course.id, dateIso);
    });

    processPromotions(); // Nachrücken übernehmen
  }

  // Swap starten
  async function confirmSwap(fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) {
    // Swap nur 1x aktiv pro User+Termin
    // TODO: nur zur Sicherheit hier drin, Prüfen!!!
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

    // Kapazitäts-Check (vorher, damit nichts halb geändert wird)
    const targetCourse = courses.find((c) => c.id === toCourseId);
    if (!targetCourse) {
      alert("Zielkurs nicht gefunden.");
      return;
    }
    const existingTargetOverride = filteredOverrides.find(
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

    // Funktion zum Aktualisieren oder Erstellen eines Overrides
    const updateOrCreateOverride = (
      prev: CourseDateOverride[],
      nextOverride: CourseDateOverride,
      idx: number,
      courseId: number,
      dateIso: string
    ) => {
      const updated = [...prev];
      if (idx >= 0) {
        updated[idx] = nextOverride;
        updateOverride(courseId, dateIso, { participants: nextOverride.participants, swapped: nextOverride.swapped });
      } else {
        updated.push(nextOverride);
        createOverride(nextOverride);
      }
      console.log('call updateOrCreateOverride:', prev, nextOverride, idx, courseId, dateIso);
      return updated;
    };

    setOverrides((prev: CourseDateOverride[]) => {
      let updated = [...prev];

      // Ursprungstermin: Benutzer austragen
      const originIdx = updated.findIndex(
        (o: CourseDateOverride) => o.courseId === fromCourse.id && o.date === fromDateIso
      );
      const originOverride: CourseDateOverride =
        originIdx >= 0
          ? { ...updated[originIdx] }
          : {
              courseId: fromCourse.id,
              date: fromDateIso,
              participants: fromCourse.participants.filter((p) => p !== userName),
              swapped: [],
              waitlist: [],
            };
      const originNextOverride: CourseDateOverride = {
        ...originOverride,
        participants: originOverride.participants.filter((p) => p !== userName),
        swapped: originOverride.swapped ?? [],
        waitlist: originOverride.waitlist ?? [],
      };
      console.log('call updateOrCreateOverride');
      updated = updateOrCreateOverride(updated, originNextOverride, originIdx, fromCourse.id, fromDateIso);

      // Zieltermin: Benutzer hinzufügen und swapped aktualisieren
      const targetIdx = updated.findIndex(
        (o: CourseDateOverride) => o.courseId === toCourseId && o.date === toDateIso
      );
      const targetOverride: CourseDateOverride =
        targetIdx >= 0
          ? { ...updated[targetIdx] }
          : {
              courseId: toCourseId,
              date: toDateIso,
              participants: [...targetCourse.participants],
              swapped: [],
              waitlist: [],
            };
      const newParticipants = targetOverride.participants.includes(userName)
        ? targetOverride.participants
        : [...targetOverride.participants, userName];
      const targetNextOverride: CourseDateOverride = {
        ...targetOverride,
        participants: newParticipants,
        swapped: [...new Set([...(targetOverride.swapped ?? []), userName])],
        waitlist: targetOverride.waitlist ?? [],
      };
      updated = updateOrCreateOverride(updated, targetNextOverride, targetIdx, toCourseId, toDateIso);

      return updated;
    });

    // Swap-Verwaltung
    cancelAllPendingSwapsFromOrigin(fromCourse.id, fromDateIso, userName);
    const newSwap: Swap = {
      user: userName,
      fromCourseId: fromCourse.id,
      fromDate: fromDateIso,
      toCourseId,
      toDate: toDateIso,
      status: 'active',
    };
    await createSwap(newSwap);
    const updatedSwaps = await getSwaps(userName);
    console.log('Updated Swaps after confirmSwap:', updatedSwaps);
    setSwaps(updatedSwaps);

    processPromotions();
    console.log("confirmSwap");
  }

  // Swap löschen
  async function cancelSwap(swap: Swap, clickedCourseId: number) {
    const isOrigin = swap.fromCourseId === clickedCourseId;

    console.log("[cancelSwap] START", { swap, clickedCourseId, isOrigin });

    const swapsToDelete = isOrigin
      ? swaps.filter(
          (s) =>
            s.user === swap.user &&
            s.fromCourseId === swap.fromCourseId &&
            s.fromDate === swap.fromDate
        )
      : [swap];

   // API-Aufrufe für Löschung
    await Promise.all(
      swapsToDelete.map(async (s) => {
        // Sicherstellen, dass alle Felder vorhanden sind
        if (!s.fromDate || !s.fromCourseId || !s.toDate || !s.toCourseId || !s.user) {
          console.error('Invalid swap data:', s);
          return;
        }
        await deleteSwap(s);
      })
    );
    
    // alle zum ursprung gehörende Swaps löschen und Wartelisten bereinigen
    // if (isOrigin && swap.status === "pending") {
    //   console.log("[cancelSwap] Ursprung + pending → alle bereinigen");
    //   cancelAllPendingSwapsFromOrigin(swap.fromCourseId, swap.fromDate, swap.user);
    //   return;
    // }

    // 1) Overrides zuerst bereinigen
    setOverrides((prev) => {
      return prev.map((o) => {
        let newO = { ...o };
        const before = { ...o }; // vorheriger Zustand für Debug

        // Ursprungstermin
        if (isOrigin && o.courseId === swap.fromCourseId && o.date === swap.fromDate) {
          if (swap.status === "active") {
            newO.swapped = (o.swapped ?? []).filter((u) => u !== swap.user);
            newO.participants = (o.participants ?? []).filter((p) => p !== swap.user);
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
          updateOverride(o.courseId, o.date, {
            participants: newO.participants,
            swapped: newO.swapped,
            waitlist: newO.waitlist,
          });
        }
        return newO;
      });
    });

    const updatedSwaps = await getSwaps(swap.user);
    console.log('Updated Swaps after cancelSwap:', updatedSwaps);
    setSwaps(updatedSwaps);

    processPromotions();
    console.log("cancelswap");
    // Hinweis: Der Ursprungstermin bleibt wie gehabt mit Override für Absage/Rücknahme bestehen.
  }


  async function requestSwap(
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
    const newSwap: Swap = {
      user: userName,
      fromCourseId: fromCourse.id,
      fromDate: fromDateIso,
      toCourseId,
      toDate: toDateIso,
      status: 'pending',
    };
    await createSwap(newSwap);
    const updatedSwaps = await getSwaps(userName);
    setSwaps(updatedSwaps);
  }

  // Abbrechen aller Swaps des Users, die vom Ursprungstermin stammen
  async function cancelAllPendingSwapsFromOrigin(
    fromCourseId: number,
    fromDateIso: string,
    userName: string
  ) {
    // Alle Pending-Swaps dieses Users vom Ursprungstermin merken
    const pendingFromOrigin = swaps.filter(
      (s: Swap) =>
        s.user === userName &&
        s.fromCourseId === fromCourseId &&
        s.fromDate === fromDateIso &&
        s.status === 'pending'
    );

    // Swaps bereinigen
    await Promise.all(
      pendingFromOrigin.map((swap) => {
        return deleteSwap(swap);
      })
    );
    const updatedSwaps = await getSwaps(userName);
    setSwaps(updatedSwaps);

    // Funktion zum Aktualisieren eines Overrides für die Warteliste
    const updateOverrideForWaitlist = (
      prev: CourseDateOverride[],
      courseId: number,
      dateIso: string,
      userName: string
    ) => {
      const updated = [...prev];
      const idx = updated.findIndex(
        (o: CourseDateOverride) => o.courseId === courseId && o.date === dateIso
      );
      if (idx >= 0 && updated[idx].waitlist?.includes(userName)) {
        const nextOverride: CourseDateOverride = {
          ...updated[idx],
          waitlist: updated[idx].waitlist.filter((u) => u !== userName),
        };
        updated[idx] = nextOverride;
        updateOverride(courseId, dateIso, { waitlist: nextOverride.waitlist });
      }
      return updated;
    };

    // Wartelisten bereinigen
    setOverrides((prev: CourseDateOverride[]) => {
      let updated = [...prev];
      pendingFromOrigin.forEach((swap) => {
        updated = updateOverrideForWaitlist(updated, swap.toCourseId, swap.toDate, userName);
      });
      return updated;
    });

    console.log('cancelAllPendingSwapsFromOrigin');
  }

function processPromotions() {
  let changed = true;

  while (changed) {
    changed = false;

    setOverrides((prevOverrides) => {
      let updatedOverrides = [...prevOverrides];

      setSwaps((prevSwaps) => {
        let updatedSwaps = [...prevSwaps];

        // Iteriere über alle pending Swaps
        for (const swap of prevSwaps.filter((s) => s.status === "pending")) {
          const target = updatedOverrides.find(
            (o) => o.courseId === swap.toCourseId && o.date === swap.toDate
          );
          if (!target) continue;

          const targetCourse = courses.find((c) => c.id === target.courseId);
          const freeSpots = targetCourse ? targetCourse.capacity - target.participants.length : 0;

          if (freeSpots > 0) {
            // 🔹 Swap kann nachrücken
            changed = true;

            // 1️⃣ Swap auf active setzen
            const swapId = `${swap.fromDate}#${swap.fromCourseId}#${swap.toDate}#${swap.toCourseId}`;
            updateSwap(swapId, 'active');

            // 2️⃣ Teilnehmer im Zieltermin ergänzen
            target.participants = [...target.participants, swap.user];
            target.swapped = [...(target.swapped ?? []), swap.user];

            // 3️⃣ Entferne den User aus Ziel-Warteliste
            target.waitlist = (target.waitlist ?? []).filter((u) => u !== swap.user);
            
            // 4️⃣ Ursprungstermin bereinigen
            const origin = updatedOverrides.find(
              (o) => o.courseId === swap.fromCourseId && o.date === swap.fromDate
            );
            if (origin) {
              origin.participants = origin.participants.filter((p) => p !== swap.user);
              origin.swapped = (origin.swapped ?? []).filter((p) => p !== swap.user);
              origin.waitlist = (origin.waitlist ?? []).filter((u) => u !== swap.user);
            }

            console.log(`[processPromotions] ${swap.user} nachgerückt von ${swap.fromCourseId}/${swap.fromDate} → ${swap.toCourseId}/${swap.toDate}`);
          }
        }

        return updatedSwaps;
      });
      
      return updatedOverrides;
    });
        console.log("processPromotions");
  }
}
    console.log("return useCourseSwaps");
  return {
    overrides: filteredOverrides, // Rückgabe der gefilterten Overrides
    swaps,
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
  };


}