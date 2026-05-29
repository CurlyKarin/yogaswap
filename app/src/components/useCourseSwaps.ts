import { useCallback, useEffect, useRef } from "react";
import { getEffectiveWaitlist } from "../lib/waitlist";
import { sameDayUTC } from "../lib/dates";
import { overrideCourseUidFields, swapCourseUidFields } from "../lib/courseUid";
import { Swap, CourseDateOverride, Course, User, TenantSettings } from "shared/types";
import {
  addUserUniqueCaseInsensitive,
  canCreateSwapFromOrigin,
  includesUserCaseInsensitive,
  isShortNoticeCancelled,
  isWithinCancellationSwapCutoff,
  removeUserCaseInsensitive,
  resolveCancellationSwapCutoffMinutes,
} from "shared/cancellationSwapCutoff";
import { hasBookingCapacity, resolveMaxCapacity } from "shared/courseCapacity";
import { createSwap, deleteSwap, processPromotions } from "../api/swaps";
import { createOverride, updateOverride } from "../api/overrides";

/** Behält shortNotice, falls API-Antwort das Feld (noch) nicht liefert. */
function mergeOverridesPreservingShortNotice(
  prev: CourseDateOverride[],
  next: CourseDateOverride[],
): CourseDateOverride[] {
  return next.map((o) => {
    const prior = prev.find((p) => p.courseId === o.courseId && p.date === o.date);
    if (
      prior?.shortNoticeCancellations?.length &&
      !o.shortNoticeCancellations?.length
    ) {
      return { ...o, shortNoticeCancellations: prior.shortNoticeCancellations };
    }
    return o;
  });
}

export function useCourseSwaps(
  courses: Course[],
  overrides: CourseDateOverride[], 
  setOverrides: React.Dispatch<React.SetStateAction<CourseDateOverride[]>>, 
  swaps: Swap[], 
  setSwaps: React.Dispatch<React.SetStateAction<Swap[]>>, 
  currentUser: User,
  fetchData: () => Promise<void>,
  tenantSettings?: TenantSettings,
) {
  const equalsIgnoreCase = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const requestSwapRef = useRef<(fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) => Promise<void>>(null!);
  // Filtere Overrides für aktuelle und zukünftige Termine
  // Fallback auf leeres Array, wenn overrides undefined oder kein Array ist
  const filteredOverrides = overrides;

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
  const cleanupPendingSwapsFromOrigin = useCallback(
    async (fromCourseId: number, fromDateIso: string, userName: string) => {
      const pendingFromOrigin = swaps.filter(
        (s) =>
          s.status === "pending" &&
          equalsIgnoreCase(s.user, userName) &&
          s.fromCourseId === fromCourseId &&
          s.fromDate === fromDateIso,
      );
      if (pendingFromOrigin.length === 0) return;

      await Promise.all(pendingFromOrigin.map((s) => deleteSwap(s)));
      setSwaps((prev) =>
        prev.filter(
          (s) =>
            !pendingFromOrigin.some(
              (p) =>
                p.fromCourseId === s.fromCourseId &&
                p.fromDate === s.fromDate &&
                p.toCourseId === s.toCourseId &&
                p.toDate === s.toDate &&
                equalsIgnoreCase(p.user, s.user),
            ),
        ),
      );
      setOverrides((prev) =>
        prev.map((o) => {
          const affected = pendingFromOrigin.filter(
            (p) => p.toCourseId === o.courseId && p.toDate === o.date,
          );
          if (affected.length === 0) return o;
          const usersToRemove = new Set(affected.map((p) => p.user.toLowerCase()));
          const waitlistAfter = (o.waitlist ?? []).filter((u) => !usersToRemove.has(u.toLowerCase()));
          if (waitlistAfter.length === (o.waitlist ?? []).length) return o;
          updateOverride(o.courseId, o.date, { waitlist: waitlistAfter });
          return { ...o, waitlist: waitlistAfter };
        }),
      );
    },
    [swaps, setOverrides, setSwaps],
  );

  const cleanupAllSwapsFromOrigin = useCallback(
    async (fromCourseId: number, fromDateIso: string, userName: string) => {
      const originSwaps = swaps.filter(
        (s) =>
          equalsIgnoreCase(s.user, userName) &&
          s.fromCourseId === fromCourseId &&
          s.fromDate === fromDateIso,
      );
      if (originSwaps.length === 0) return;

      await Promise.all(originSwaps.map((s) => deleteSwap(s)));
      setSwaps((prev) =>
        prev.filter(
          (s) =>
            !originSwaps.some(
              (o) =>
                equalsIgnoreCase(o.user, s.user) &&
                o.fromCourseId === s.fromCourseId &&
                o.fromDate === s.fromDate &&
                o.toCourseId === s.toCourseId &&
                o.toDate === s.toDate,
            ),
        ),
      );

      setOverrides((prev) =>
        prev.map((o) => {
          const next = { ...o };
          const before = { ...o };
          for (const swap of originSwaps) {
            if (o.courseId === swap.fromCourseId && o.date === swap.fromDate) {
              if (swap.status === "active") {
                next.swapped = (next.swapped ?? []).filter((u) => !equalsIgnoreCase(u, swap.user));
                next.participants = next.participants.filter((p) => !equalsIgnoreCase(p, swap.user));
              } else {
                next.waitlist = (next.waitlist ?? []).filter((u) => !equalsIgnoreCase(u, swap.user));
              }
            }
            if (o.courseId === swap.toCourseId && o.date === swap.toDate) {
              if (swap.status === "active") {
                next.participants = next.participants.filter((p) => !equalsIgnoreCase(p, swap.user));
                next.swapped = (next.swapped ?? []).filter((u) => !equalsIgnoreCase(u, swap.user));
              } else {
                next.waitlist = (next.waitlist ?? []).filter((u) => !equalsIgnoreCase(u, swap.user));
              }
            }
          }
          if (
            JSON.stringify(before.participants) !== JSON.stringify(next.participants) ||
            JSON.stringify(before.swapped) !== JSON.stringify(next.swapped) ||
            JSON.stringify(before.waitlist) !== JSON.stringify(next.waitlist)
          ) {
            updateOverride(o.courseId, o.date, {
              participants: next.participants,
              swapped: next.swapped,
              waitlist: next.waitlist,
            });
          }
          return next;
        }),
      );
    },
    [swaps, setOverrides, setSwaps],
  );

  const onToggleAbsence = useCallback(
    async (course: Course, dateIso: string, userName: string) => {
      try {
      const hasActiveSwapFromOrigin = swaps.some(
        (s: Swap) =>
          equalsIgnoreCase(s.user, userName) &&
          s.fromCourseId === course.id &&
          s.fromDate === dateIso &&
          s.status === "active",
      );

      if (hasActiveSwapFromOrigin) {
        alert("Absagen nicht möglich, solange ein aktiver Tausch vom Ursprungstermin besteht.");
        return;
      }

      const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
      const inCutoff = isWithinCancellationSwapCutoff(dateIso, course.time, cutoffMinutes);

      const existingOverride = filteredOverrides.find(
        (o) => o.courseId === course.id && o.date === dateIso,
      );
      const isSn = isShortNoticeCancelled(existingOverride, userName);
      const isIn = includesUserCaseInsensitive(
        existingOverride?.participants ?? course.participants,
        userName,
      );

      if (isIn && !isSn && !inCutoff) {
        const waitlist = getEffectiveWaitlist(course, filteredOverrides, dateIso);
        if (waitlist.length > 0) {
          const proceed = confirm(
            `Achtung: Für diesen Termin existiert eine Warteliste (${waitlist.length} Person(en)). ` +
              `Deine Absage hat direkte Auswirkungen – jemand rückt automatisch nach. Möchtest du fortfahren?`,
          );
          if (!proceed) return;
        }
      }

      const originSwaps = swaps.filter(
        (s) =>
          equalsIgnoreCase(s.user, userName) &&
          s.fromCourseId === course.id &&
          s.fromDate === dateIso,
      );
      const pendingCount = originSwaps.filter((s) => s.status === "pending").length;
      const activeFutureCount = originSwaps.filter(
        (s) => s.status === "active" && new Date(s.toDate) >= new Date(),
      ).length;
      const activePastCount = originSwaps.filter(
        (s) => s.status === "active" && new Date(s.toDate) < new Date(),
      ).length;

      if (!isIn && !isSn) {
        if (activePastCount > 0) {
          alert("Diese Absage kann nicht mehr zurückgenommen werden, weil ein aktiver Tausch in der Vergangenheit liegt.");
          return;
        }
        const warningParts: string[] = [
          "Absage zurücknehmen und wieder am Termin teilnehmen?",
          "Der Anspruch auf Ersatztermin erlischt.",
        ];
        if (pendingCount > 0) {
          warningParts.push(`Offene Tauschanfragen (${pendingCount}) werden gelöscht.`);
        }
        if (activeFutureCount > 0) {
          warningParts.push(`Aktive zukünftige Tausche (${activeFutureCount}) werden aufgehoben.`);
        }
        const proceed = confirm(warningParts.join(" "));
        if (!proceed) return;
        if (originSwaps.length > 0) {
          await cleanupAllSwapsFromOrigin(course.id, dateIso, userName);
        }
      }

      const persistOverride = (
        courseId: number,
        dateKey: string,
        nextOverride: CourseDateOverride,
        idx: number,
        prev: CourseDateOverride[],
      ) => {
        const updated = [...prev];
        const payload = {
          participants: nextOverride.participants,
          shortNoticeCancellations: nextOverride.shortNoticeCancellations ?? [],
        };
        if (idx >= 0) {
          updated[idx] = nextOverride;
          updateOverride(courseId, dateKey, payload);
        } else {
          updated.push(nextOverride);
          createOverride(nextOverride);
        }
        return updated;
      };

      setOverrides((prev: CourseDateOverride[]) => {
        const date = new Date(dateIso);
        const idx = prev.findIndex(
          (o: CourseDateOverride) => o.courseId === course.id && sameDayUTC(new Date(o.date), date),
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
                shortNoticeCancellations: [],
                ...overrideCourseUidFields(course),
              };

        const maxCapacity = resolveMaxCapacity(course);
        let nextParticipants = [...baseOverride.participants];
        let nextShortNotice = [...(baseOverride.shortNoticeCancellations ?? [])];

        if (isSn) {
          nextShortNotice = removeUserCaseInsensitive(nextShortNotice, userName);
        } else if (isIn && inCutoff) {
          nextShortNotice = addUserUniqueCaseInsensitive(nextShortNotice, userName);
        } else if (isIn) {
          nextParticipants = removeUserCaseInsensitive(nextParticipants, userName);
        } else {
          if (nextParticipants.length >= maxCapacity) {
            alert("Dieser Termin ist inzwischen voll – Rücknahme nicht möglich.");
            return prev;
          }
          nextParticipants = addUserUniqueCaseInsensitive(nextParticipants, userName);
        }

        const nextOverride: CourseDateOverride = {
          ...baseOverride,
          participants: nextParticipants,
          shortNoticeCancellations: nextShortNotice,
        };

        return persistOverride(course.id, dateIso, nextOverride, idx, prev);
      });

      if (isIn && !isSn && inCutoff) {
        await cleanupPendingSwapsFromOrigin(course.id, dateIso, userName);
      }

      console.log('Calling processPromotions for onToggleAbsence...');
      const response = await processPromotions(); // Nachrücken übernehmen
      console.log('processPromotions completed, calling fetchData...');

      if (response && response.swaps && response.overrides) {
        setSwaps(response.swaps);
        setOverrides((prev) => mergeOverridesPreservingShortNotice(prev, response.overrides!));
      } else {
        console.warn('No valid response from processPromotions, falling back to fetchData');
        await fetchData();
      }

    } catch (err) {
        console.error('Error in onToggleAbsence:', err);
      }
    },
    // courses, currentUser.nickname kept so callback updates when they change
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOverrides/setSwaps stable; courses/nickname intentional
    [courses, filteredOverrides, swaps, currentUser.nickname, fetchData, setOverrides, setSwaps, tenantSettings, cleanupPendingSwapsFromOrigin, cleanupAllSwapsFromOrigin]
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
  const assertCanSwapFromOrigin = (fromCourse: Course, fromDateIso: string, userName: string) => {
    const override = filteredOverrides.find(
      (o) => o.courseId === fromCourse.id && o.date === fromDateIso,
    );
    const participants = override?.participants ?? fromCourse.participants;
    const originallyParticipant = fromCourse.participants.some((p) =>
      equalsIgnoreCase(p, userName),
    );
    if (
      !canCreateSwapFromOrigin({
        isoDate: fromDateIso,
        courseTime: fromCourse.time,
        tenantSettings,
        override,
        userName,
        participants,
        originallyParticipant,
      })
    ) {
      alert("In diesem Zeitfenster ist kein Tausch vom Ursprungstermin mehr möglich.");
      return false;
    }
    return true;
  };

  const confirmSwap = useCallback(
    async (fromCourse: Course, fromDateIso: string, toCourseId: number, toDateIso: string, userName: string) => {
      try {
        if (!assertCanSwapFromOrigin(fromCourse, fromDateIso, userName)) return;

        // Swap nur 1x aktiv pro User+Termin
        // TODO: nur zur Sicherheit hier drin, Prüfen!!!
        const existing = swaps.find(
          (s) =>
            s.user.toLowerCase() === userName.toLowerCase() &&
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
          requestSwapRef.current(fromCourse, fromDateIso, toCourseId, toDateIso, userName);
          alert("Dieser Termin hat bereits eine Warteliste. Du wurdest in die Warteliste eingetragen.");
          return;
        }

        const effectiveTargetParticipants = existingTargetOverride
          ? existingTargetOverride.participants
          : targetCourse.participants;

        if (!hasBookingCapacity(effectiveTargetParticipants.length, targetCourse)) {
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
                  participants: fromCourse.participants.filter((p) => p.toLowerCase() !== userName.toLowerCase()),
                  swapped: [],
                  waitlist: [],
                  ...overrideCourseUidFields(fromCourse),
                };
          const originNextOverride: CourseDateOverride = {
            ...originOverride,
            participants: originOverride.participants.filter((p) => p.toLowerCase() !== userName.toLowerCase()),
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
                  ...overrideCourseUidFields(targetCourse),
                };
          const newParticipants = targetOverride.participants.some(
            (p) => p.toLowerCase() === userName.toLowerCase()
          )
            ? targetOverride.participants
            : [...targetOverride.participants.filter((p) => p.toLowerCase() !== userName.toLowerCase()), userName];
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
          ...swapCourseUidFields(fromCourse, targetCourse),
        };
        await createSwap(newSwap);

        // Nach erfolgreichem Tausch alle übrigen pending Anfragen vom selben Ursprung auflösen.
        const pendingFromSameOrigin = swaps.filter(
          (s) =>
            s.status === "pending" &&
            equalsIgnoreCase(s.user, userName) &&
            s.fromCourseId === fromCourse.id &&
            s.fromDate === fromDateIso &&
            !(s.toCourseId === toCourseId && s.toDate === toDateIso)
        );
        if (pendingFromSameOrigin.length > 0) {
          await Promise.all(pendingFromSameOrigin.map((swap) => deleteSwap(swap)));

          setOverrides((prev) =>
            prev.map((override) => {
              const affectedPending = pendingFromSameOrigin.filter(
                (swap) => swap.toCourseId === override.courseId && swap.toDate === override.date
              );
              if (affectedPending.length === 0) return override;
              const usersToRemove = new Set(
                affectedPending.map((swap) => swap.user.toLowerCase())
              );
              const waitlistBefore = override.waitlist ?? [];
              const waitlistAfter = waitlistBefore.filter(
                (entry) => !usersToRemove.has(entry.toLowerCase())
              );
              if (waitlistAfter.length === waitlistBefore.length) return override;
              updateOverride(override.courseId, override.date, { waitlist: waitlistAfter });
              return {
                ...override,
                waitlist: waitlistAfter,
              };
            })
          );
        }

        console.log('Calling processPromotions for confirmSwap...');
        const response = await processPromotions();
        console.log('processPromotions response:', response);

        if (response && response.swaps && response.overrides) {
          setSwaps(response.swaps);
          setOverrides((prev) => mergeOverridesPreservingShortNotice(prev, response.overrides!));
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
    // requestSwap via ref to avoid circular dependency (confirmSwap -> requestSwap)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courses, filteredOverrides, swaps, currentUser.nickname, fetchData, setOverrides, setSwaps, tenantSettings]
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
        const targetCourse = courses.find((c) => c.id === swap.toCourseId);
        const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
        const targetInCutoff =
          targetCourse &&
          isWithinCancellationSwapCutoff(swap.toDate, targetCourse.time, cutoffMinutes);

        if (swap.status === "active" && !isOrigin && targetInCutoff) {
          const targetOverride = filteredOverrides.find(
            (o) => o.courseId === swap.toCourseId && o.date === swap.toDate,
          );
          const isSn = isShortNoticeCancelled(targetOverride, swap.user);
          const baseOverride: CourseDateOverride = targetOverride ?? {
            courseId: swap.toCourseId,
            date: swap.toDate,
            participants: targetCourse?.participants ?? [],
            swapped: [],
            waitlist: [],
            shortNoticeCancellations: [],
            ...(targetCourse ? overrideCourseUidFields(targetCourse) : {}),
          };
          const nextShortNotice = isSn
            ? removeUserCaseInsensitive(baseOverride.shortNoticeCancellations ?? [], swap.user)
            : addUserUniqueCaseInsensitive(baseOverride.shortNoticeCancellations ?? [], swap.user);

          const nextOverride: CourseDateOverride = {
            ...baseOverride,
            shortNoticeCancellations: nextShortNotice,
          };
          const idx = filteredOverrides.findIndex(
            (o) => o.courseId === swap.toCourseId && o.date === swap.toDate,
          );
          setOverrides((prev) => {
            const updated = [...prev];
            if (idx >= 0) {
              updated[idx] = nextOverride;
              updateOverride(swap.toCourseId, swap.toDate, {
                shortNoticeCancellations: nextShortNotice,
              });
            } else {
              updated.push(nextOverride);
              createOverride(nextOverride);
            }
            return updated;
          });
          return;
        }

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
            const newO = { ...o };
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
          setOverrides((prev) => mergeOverridesPreservingShortNotice(prev, response.overrides!));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentUser.nickname intentional for refresh
    [swaps, courses, filteredOverrides, currentUser.nickname, fetchData, setOverrides, setSwaps, tenantSettings]
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
        if (!assertCanSwapFromOrigin(fromCourse, fromDateIso, userName)) return;

        // 1) prüfen, ob schon ein Swap existiert
        const existing = swaps.find(
          (s) =>
            s.user.toLowerCase() === userName.toLowerCase() &&
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
            const userNameLowerForWaitlist = userName.toLowerCase();
            if (!cur.waitlist?.some((p) => p.toLowerCase() === userNameLowerForWaitlist)) {
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
              ...overrideCourseUidFields(targetCourse),
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
          ...swapCourseUidFields(fromCourse, targetCourse),
        };
        await createSwap(newSwap);

        console.log('Calling processPromotions for requestSwap...');
        const response = await processPromotions();
        console.log('processPromotions response:', response);

        if (response && response.swaps && response.overrides) {
          setSwaps(response.swaps);
          setOverrides((prev) => mergeOverridesPreservingShortNotice(prev, response.overrides!));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentUser.nickname intentional for refresh
    [courses, swaps, filteredOverrides, currentUser.nickname, fetchData, setOverrides, setSwaps, tenantSettings]
  );

  requestSwapRef.current = requestSwap;

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
