import { useCallback, useEffect, useRef } from "react";
import axios from "axios";
import { getEffectiveWaitlist } from "../lib/waitlist";
import { findOverrideForCourseDate, sameInstant } from "../lib/dates";
import { overrideCourseUidFields, swapCourseUidFields } from "../lib/courseUid";
import { Swap, CourseDateOverride, Course, User, TenantSettings } from "shared/types";
import {
  addUserUniqueCaseInsensitive,
  canCancelSwap,
  canCreateSwapFromOrigin,
  includesUserCaseInsensitive,
  isShortNoticeCancelled,
  isSwapTargetInCutoffWindow,
  isWithinCancellationSwapCutoff,
  removeUserCaseInsensitive,
  resolveCancellationSwapCutoffMinutes,
} from "shared/cancellationSwapCutoff";
import { hasRegularBookingCapacity, resolveMaxCapacity } from "shared/courseCapacity";
import { createSwap, deleteSwap, processPromotions, processRingSwaps } from "../api/swaps";
import { createOverride, updateOverride } from "../api/overrides";

function overrideMatchesCourseDate(
  override: CourseDateOverride,
  courseId: number,
  dateIso: string,
): boolean {
  return override.courseId === courseId && sameInstant(override.date, dateIso);
}

function buildOverridePatch(
  before: CourseDateOverride,
  after: CourseDateOverride,
): Partial<CourseDateOverride> {
  const patch: Partial<CourseDateOverride> = {};
  if (JSON.stringify(before.participants) !== JSON.stringify(after.participants)) {
    patch.participants = after.participants;
  }
  if (JSON.stringify(before.swapped) !== JSON.stringify(after.swapped)) {
    patch.swapped = after.swapped;
  }
  if (JSON.stringify(before.waitlist) !== JSON.stringify(after.waitlist)) {
    patch.waitlist = after.waitlist;
  }
  return patch;
}

function findOverrideIndex(
  list: CourseDateOverride[],
  courseId: number,
  dateIso: string,
): number {
  return list.findIndex((o) => o.courseId === courseId && o.date === dateIso);
}

function upsertCourseDateOverride(
  prev: CourseDateOverride[],
  next: CourseDateOverride,
  courseId: number,
  dateIso: string,
): CourseDateOverride[] {
  const idx = findOverrideIndex(prev, courseId, dateIso);
  if (idx >= 0) {
    const updated = [...prev];
    updated[idx] = next;
    return updated;
  }
  return [...prev, next];
}

async function persistCourseDateOverride(
  courseId: number,
  dateIso: string,
  next: CourseDateOverride,
  exists: boolean,
): Promise<void> {
  const payload = {
    participants: next.participants,
    shortNoticeCancellations: next.shortNoticeCancellations ?? [],
  };
  if (exists) {
    await updateOverride(courseId, dateIso, payload);
  } else {
    await createOverride({ ...next, courseId, date: dateIso });
  }
}

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
        return false;
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
          if (!proceed) return false;
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
          return false;
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
        if (!proceed) return false;
        if (originSwaps.length > 0) {
          await cleanupAllSwapsFromOrigin(course.id, dateIso, userName);
        }
      }

      const existingIndex = findOverrideIndex(filteredOverrides, course.id, dateIso);
      const baseOverride: CourseDateOverride =
        existingIndex >= 0
          ? { ...filteredOverrides[existingIndex] }
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
          return false;
        }
        nextParticipants = addUserUniqueCaseInsensitive(nextParticipants, userName);
      }

      const nextOverride: CourseDateOverride = {
        ...baseOverride,
        participants: nextParticipants,
        shortNoticeCancellations: nextShortNotice,
      };

      await persistCourseDateOverride(course.id, dateIso, nextOverride, existingIndex >= 0);
      setOverrides((prev) => upsertCourseDateOverride(prev, nextOverride, course.id, dateIso));

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

      return true;
    } catch (err) {
        console.error('Error in onToggleAbsence:', err);
        alert("Fehler beim Speichern der Absage. Bitte erneut versuchen.");
        await fetchData();
        return false;
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

  const assertSwapTargetNotInCutoff = (targetCourse: Course, toDateIso: string): boolean => {
    if (isSwapTargetInCutoffWindow(toDateIso, targetCourse.time, tenantSettings)) {
      alert(
        "Für diesen Zieltermin ist keine Tauschanfrage mehr möglich (kurz vor Kursbeginn).",
      );
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
        if (!assertSwapTargetNotInCutoff(targetCourse, toDateIso)) return;

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

        if (!hasRegularBookingCapacity(effectiveTargetParticipants.length, targetCourse)) {
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
              const affectedPending = pendingFromSameOrigin.filter((swap) =>
                overrideMatchesCourseDate(override, swap.toCourseId, swap.toDate),
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
        if (!canCancelSwap(swap, courses)) {
          alert(
            "Dieser Tausch kann nicht mehr abgebrochen werden — Ursprung und Zieltermin liegen in der Vergangenheit.",
          );
          return;
        }
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
          const nextParticipants = includesUserCaseInsensitive(baseOverride.participants, swap.user)
            ? baseOverride.participants
            : addUserUniqueCaseInsensitive(baseOverride.participants, swap.user);

          const nextOverride: CourseDateOverride = {
            ...baseOverride,
            participants: nextParticipants,
            shortNoticeCancellations: nextShortNotice,
          };
          const idx = findOverrideIndex(filteredOverrides, swap.toCourseId, swap.toDate);
          try {
            await persistCourseDateOverride(
              swap.toCourseId,
              swap.toDate,
              nextOverride,
              idx >= 0,
            );
            setOverrides((prev) =>
              upsertCourseDateOverride(prev, nextOverride, swap.toCourseId, swap.toDate),
            );
          } catch (err) {
            console.error("Error in cancelSwap (cutoff SN):", err);
            alert("Fehler beim Speichern der Absage. Bitte erneut versuchen.");
            await fetchData();
          }
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

        // 1) Overrides bereinigen — alle betroffenen Swaps in swapsToDelete berücksichtigen
        const overridePatches: Array<{
          courseId: number;
          date: string;
          patch: Partial<CourseDateOverride>;
          next: CourseDateOverride;
        }> = [];

        const nextOverrides = filteredOverrides.map((o) => {
          const newO = { ...o };
          const before = { ...o };

          for (const s of swapsToDelete) {
            const userLower = s.user.toLowerCase();

            if (
              isOrigin &&
              overrideMatchesCourseDate(o, s.fromCourseId, s.fromDate) &&
              s.status === "active"
            ) {
              newO.swapped = (newO.swapped ?? []).filter((u) => u.toLowerCase() !== userLower);
              newO.participants = (newO.participants ?? []).filter((p) => p.toLowerCase() !== userLower);
            }

            const cleansTarget =
              (isOrigin && overrideMatchesCourseDate(o, s.toCourseId, s.toDate)) ||
              (!isOrigin && overrideMatchesCourseDate(o, swap.toCourseId, swap.toDate));

            if (cleansTarget) {
              if (s.status === "active") {
                newO.participants = (newO.participants ?? []).filter((p) => p.toLowerCase() !== userLower);
                newO.swapped = (newO.swapped ?? []).filter((u) => u.toLowerCase() !== userLower);
              } else if (s.status === "pending") {
                newO.waitlist = (newO.waitlist ?? []).filter((u) => u.toLowerCase() !== userLower);
              }
            }
          }

          const patch = buildOverridePatch(before, newO);
          if (Object.keys(patch).length > 0) {
            overridePatches.push({
              courseId: o.courseId,
              date: o.date,
              patch,
              next: newO,
            });
          }
          return newO;
        });

        await Promise.all(
          overridePatches.map(({ courseId, date, patch }) => updateOverride(courseId, date, patch)),
        );
        if (overridePatches.length > 0) {
          setOverrides(nextOverrides);
        }

        try {
          await processRingSwaps();
        } catch (ringError) {
          console.warn("processRingSwaps failed after cancelSwap, continue with processPromotions", ringError);
        }

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
            sameInstant(s.toDate, toDateIso),
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
        if (!assertSwapTargetNotInCutoff(targetCourse, toDateIso)) return;

        const existingTargetOverride = findOverrideForCourseDate(
          filteredOverrides,
          toCourseId,
          toDateIso,
        );
        const targetDateKey = existingTargetOverride?.date ?? toDateIso;

        const hasPendingSwapToTarget = swaps.some(
          (s) =>
            s.status === "pending" &&
            s.user.toLowerCase() === userName.toLowerCase() &&
            s.fromCourseId === fromCourse.id &&
            s.fromDate === fromDateIso &&
            s.toCourseId === toCourseId &&
            sameInstant(s.toDate, targetDateKey),
        );

        // 3) Warteliste in Overrides ergänzen (API-Aufrufe außerhalb von setState)
        const userNameLowerForWaitlist = userName.toLowerCase();

        const appendWaitlist = (current: string[] | undefined): string[] => {
          const base = current ?? [];
          if (base.some((entry) => entry.toLowerCase() === userNameLowerForWaitlist)) {
            return base;
          }
          return [...base, userName];
        };

        const persistWaitlistUpdate = async (nextWaitlist: string[]) => {
          await updateOverride(toCourseId, targetDateKey, { waitlist: nextWaitlist });
          setOverrides((prev) =>
            prev.map((o) =>
              overrideMatchesCourseDate(o, toCourseId, targetDateKey)
                ? { ...o, waitlist: nextWaitlist }
                : o,
            ),
          );
        };

        const alreadyOnWaitlist = existingTargetOverride?.waitlist?.some(
          (entry) => entry.toLowerCase() === userNameLowerForWaitlist,
        );

        if (alreadyOnWaitlist && hasPendingSwapToTarget) {
          alert("Du hast diese Anfrage bereits gestellt!");
          return;
        }

        if (!alreadyOnWaitlist) {
          if (existingTargetOverride) {
            await persistWaitlistUpdate(appendWaitlist(existingTargetOverride.waitlist));
          } else {
            const nextOverride: CourseDateOverride = {
              courseId: toCourseId,
              date: targetDateKey,
              participants: [...targetCourse.participants],
              swapped: [],
              waitlist: [userName],
              ...overrideCourseUidFields(targetCourse),
            };
            try {
              await createOverride(nextOverride);
              setOverrides((prev) => [...prev, nextOverride]);
            } catch (err) {
              if (axios.isAxiosError(err) && err.response?.status === 409) {
                const existingWaitlist = Array.isArray(err.response.data?.override?.waitlist)
                  ? (err.response.data.override.waitlist as string[])
                  : [];
                const nextWaitlist = appendWaitlist(existingWaitlist);
                if (
                  nextWaitlist.some((entry) => entry.toLowerCase() === userNameLowerForWaitlist)
                ) {
                  await persistWaitlistUpdate(nextWaitlist);
                }
              } else {
                throw err;
              }
            }
          }
        }

        // 4) Swap mit Status "pending" speichern
        const newSwap: Swap = {
          user: userName,
          fromCourseId: fromCourse.id,
          fromDate: fromDateIso,
          toCourseId,
          toDate: targetDateKey,
          status: 'pending',
          ...swapCourseUidFields(fromCourse, targetCourse),
        };
        await createSwap(newSwap);

        console.log("Calling processRingSwaps for requestSwap...");
        try {
          const ringResult = await processRingSwaps();
          console.log("processRingSwaps response:", ringResult);
        } catch (ringError) {
          // Ringtausch-Analyse ist entkoppelt; Fehler blockieren den normalen Promotion-Flow nicht.
          console.warn("processRingSwaps failed, continue with processPromotions", ringError);
        }

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
