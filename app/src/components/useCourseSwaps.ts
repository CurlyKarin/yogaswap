import { useCallback, useEffect} from "react";
import { getEffectiveWaitlist } from "../lib/waitlist";
import { sameDayUTC } from "../lib/dates";
import { Swap, CourseDateOverride, Course, User } from "shared/types";
import { createSwap, deleteSwap, getSwaps, getSwapsByStatus, processPromotions, updateSwap } from "../api/swaps";
import { createOverride, getOverrides, updateOverride } from "../api/overrides";


export function useCourseSwaps(
  courses: Course[],
  overrides: CourseDateOverride[], 
  setOverrides: React.Dispatch<React.SetStateAction<CourseDateOverride[]>>, 
  swaps: Swap[], 
  setSwaps: React.Dispatch<React.SetStateAction<Swap[]>>, 
  currentUser: User,
  fetchData: () => Promise<() => void>
) {
  
  // Filtere Overrides für aktuelle und zukünftige Termine
  // Fallback auf leeres Array, wenn overrides undefined oder kein Array ist
  const filteredOverrides = overrides;
// const filteredOverrides = useMemo(
//     () => overrides.filter((o) => courses.some((c) => c.id === o.courseId)),
//     [overrides, courses]
//   );

  useEffect(() => {
    console.log('🔄 Filtered Overrides:', filteredOverrides);
    console.log('🔄 Swaps:', swaps);
  }, [filteredOverrides, swaps]);

  /**
   * onToggleAbsence: Funktion zum Aktivieren und Deaktivieren von Absagen
   * Wenn ein Tausch bereits aktiv ist, wird er deaktiviert.
   * Wenn ein Tausch nicht existiert, wird er erstellt.
   * Wenn ein Tausch offen ist, wird er abgelehnt.
   * @param {Course} course - der Kurs, für den der Tausch erstellt werden soll
   * @param {string} dateIso - das Datum im ISO-Format, für den der Tausch erstellt werden soll
   * @param {string} userName - der Benutzername, unter dem der Tausch erstellt werden soll
   */
  const onToggleAbsence = useCallback(
    async (course: Course, dateIso: string, userName: string) => {
      try {
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

      console.log('Calling processPromotions for onToggleAbsence...');
      const response = await processPromotions(); // Nachrücken übernehmen
      console.log('processPromotions completed, calling fetchData...');

      if (response && response.swaps && response.overrides) {
        setSwaps(response.swaps);
        setOverrides(response.overrides);
      } else {
        console.warn('No valid response from processPromotions, falling back to fetchData');
        await fetchData();
      }

    } catch (err) {
        console.error('Error in onToggleAbsence:', err);
      }
    },
    [courses, filteredOverrides, swaps, currentUser.nickname, fetchData]
  );

  /**
   * Bestätigt einen Tausch.
   * @param {Course} fromCourse - der Kurs, von dem der Tausch kommt
   * @param {string} fromDateIso - das Datum des Tausches im ISO-Format
   * @param {number} toCourseId - die ID des Kurses, zu dem der Tausch geht
   * @param {string} toDateIso - das Datum des Tausches im ISO-Format
   * @param {string} userName - der Name des Benutzers, der den Tausch durchführen soll
   * @returns {Promise<void>} - das zurückgegebene Promise
   */
  const confirmSwap = useCallback(
    async (fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) => {
      try {
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
        const newSwap: Swap = {
          user: userName,
          fromCourseId: fromCourse.id,
          fromDate: fromDateIso,
          toCourseId,
          toDate: toDateIso,
          status: 'active',
        };
        await createSwap(newSwap);

        console.log('Calling processPromotions for confirmSwap...');
        const response = await processPromotions();
        console.log('processPromotions response:', response);

        if (response && response.swaps && response.overrides) {
          setSwaps(response.swaps);
          setOverrides(response.overrides);
        } else {
          console.warn('No valid response from processPromotions, falling back to fetchData');
          await fetchData();
        }
      } catch (err) {
        console.error('Error in confirmSwap:', err);
        alert('Fehler beim Bestätigen des Tauschs. Daten werden neu geladen.');
        await fetchData();
      }
    },
    [courses, filteredOverrides, swaps, currentUser.nickname, fetchData]
  );

  /**
   * Swap löschen
   * 
   * @param {Swap} swap - der zu löschende Swap
   * @param {number} clickedCourseId - die ID des Kurses, auf den der Benutzer geklickt hat
   * 
   * @returns {Promise<void>}
   */
  const cancelSwap = useCallback(
    async (swap: Swap, clickedCourseId: number) => {
      try {
        console.log("[cancelSwap use] START", { swap, clickedCourseId, swaps });
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
            console.log("[cancelSwap] Deleting swap:", s);
            await deleteSwap(s);
          })
        );

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
            
            // UpdateOverride, falls sich etwas geändert hat
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

        console.log('Calling processPromotions for cancelSwap...');
        const response = await processPromotions();
        console.log('processPromotions response:', response);

        if (response && response.swaps && response.overrides) {
          setSwaps(response.swaps);
          setOverrides(response.overrides);
        } else {
          console.warn('No valid response from processPromotions, falling back to fetchData');
          await fetchData();
        }
      } catch (err) {
        console.error('Error in cancelSwap:', err);
        alert('Fehler beim Stornieren des Tauschs. Daten werden neu geladen.');
        await fetchData();
      }
    },
    [swaps, currentUser.nickname, fetchData]
  );

  /**
   * Tausch anfragen
   * @param {Course} fromCourse - Quellkurs
   * @param {string} fromDateIso - Quell-Datum (ISO-String)
   * @param {number} toCourseId - Zielkurs-ID
   * @param {string} toDateIso - Ziel-Datum (ISO-String)
   * @param {string} userName - Name des anfragenden Nutzers
   * @returns {Promise<void>} - Daten werden neu geladen, wenn der Tausch erfolgreich war
   */
  const requestSwap = useCallback(
    async (fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) => {
      try {
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

          let nextOverride: CourseDateOverride;

          if (targetIdx >= 0) {
            const cur = updated[targetIdx];
            // nur hinzufügen, falls User nicht schon drin
            if (!cur.waitlist?.includes(userName)) {
              nextOverride = {
                ...cur,
                waitlist: [...(cur.waitlist ?? []), userName],
              };
              updated[targetIdx] = nextOverride;
              // Backend-Aufruf: Override aktualisieren
              updateOverride(toCourseId, toDateIso, { waitlist: nextOverride.waitlist });
            } else {
              return prev; // Keine Änderung, falls schon in Warteliste
            }
          } else {
            // Override neu anlegen → Basis sind immer die aktuellen Kursdaten
            const baseParticipants = targetCourse.participants;
            nextOverride = {
              courseId: toCourseId,
              date: toDateIso,
              participants: [...baseParticipants],  // alle bisherigen Teilnehmer
              swapped: [],
              waitlist: [userName], // neue Warteliste
            };
            updated.push(nextOverride);
            // Backend-Aufruf: Override erstellen
            createOverride(nextOverride);
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

        console.log('Calling processPromotions for requestSwap...');
        const response = await processPromotions();
        console.log('processPromotions response:', response);

        if (response && response.swaps && response.overrides) {
          setSwaps(response.swaps);
          setOverrides(response.overrides);
        } else {
          console.warn('No valid response from processPromotions, falling back to fetchData');
          await fetchData();
        }
      } catch (err) {
        console.error('Error in requestSwap:', err);
        alert('Fehler beim Anfragen des Tauschs. Daten werden neu geladen.');
        await fetchData();
      }
    },
    [courses, swaps, currentUser.nickname, fetchData]
  );

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

function delay(arg0: number) {
  throw new Error("Function not implemented.");
}
