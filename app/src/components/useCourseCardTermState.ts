import { useEffect, useMemo, useState } from "react";
import type { Course, CourseDateOverride, Swap, TenantSettings, User } from "shared/types";
import {
  buildCourseOccurrenceLocal,
  getInactiveGraceLastDayIso,
  isCourseInInactiveGracePeriod,
  isWithinPostCourseEndGrace,
  isOccurrenceInPast,
  lastScheduledOccurrenceIso,
  looksLikeAutomaticallyInactive,
} from "shared/courseStatus";
import { resolveSwapWindow } from "shared/tenantSettings";
import {
  canCancelSwap,
  canCreateSwapFromOrigin,
  hasEffectiveCancellation,
  isRegularCancellation,
  isShortNoticeCancelled,
  isWithinCancellationSwapCutoff,
  resolveCancellationSwapCutoffMinutes,
} from "shared/cancellationSwapCutoff";
import { getAvailableDates, getWaitlistDates, toDateKey } from "../lib/dates";
import { resolveInactiveParticipantNotice, resolvePastTermNotice } from "../lib/courseCardLabels";
import { canRequestSwapFromPastCancelledOrigin, isTermInParticipantSwapGrace } from "../lib/courseTermActions";
import { formatSwapStatusLine } from "../lib/courseTermActionLabels";
import { isExcludedCourseDate } from "../lib/courseWeekOccurrences";
import type { SwapSettings } from "../types";

export type AbsenceToggleOutcome = "cancelled" | "shortNoticeCancelled" | "undo";

function sameDayUTC(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export type UseCourseCardTermStateParams = {
  course: Course;
  allCourses: Course[];
  currentUser: User;
  dates: Date[];
  overrides: CourseDateOverride[];
  swaps: Swap[];
  participantActionsLocked?: boolean;
  tenantSettings?: TenantSettings;
  initialSelectedDate?: Date;
  includePastTermsInSelect?: boolean;
};

export function useCourseCardTermState({
  course,
  allCourses,
  currentUser,
  dates,
  overrides,
  swaps,
  participantActionsLocked = false,
  tenantSettings,
  initialSelectedDate,
  includePastTermsInSelect = false,
}: UseCourseCardTermStateParams) {
  const swapWindow: SwapSettings = useMemo(
    () => resolveSwapWindow(tenantSettings),
    [tenantSettings],
  );

  const [selectedDate, setSelectedDate] = useState<string>(
    () => (initialSelectedDate ?? dates[0])?.toISOString() || "",
  );

  const userName = currentUser.nickname;
  const selectedDateKey = toDateKey(new Date(selectedDate));

  const override = useMemo(
    () =>
      overrides.find((o) =>
        o.courseId === course.id && sameDayUTC(new Date(o.date), new Date(selectedDate)),
      ),
    [overrides, course.id, selectedDate],
  );

  const hasNoUpcomingDates = dates.length === 0;
  const participants = hasNoUpcomingDates ? course.participants : (override ? override.participants : course.participants);
  const swapped = hasNoUpcomingDates ? [] : (override?.swapped ?? []);
  const shortNotice = hasNoUpcomingDates ? [] : (override?.shortNoticeCancellations ?? []);
  const waitlist = hasNoUpcomingDates ? [] : (override?.waitlist ?? []);
  const guestCount = hasNoUpcomingDates ? 0 : (override?.anonymousTrialCount ?? 0);

  const userNameLower = userName.toLowerCase();
  const isParticipant = participants.some((p) => p.toLowerCase() === userNameLower);
  const originallyParticipant = course.participants.some((p) => p.toLowerCase() === userNameLower);
  const isShortNotice = isShortNoticeCancelled(override, userName);
  const hasCancelled = hasEffectiveCancellation(
    originallyParticipant,
    override,
    participants,
    userName,
  );
  const cutoffMinutes = resolveCancellationSwapCutoffMinutes(tenantSettings);
  const originInCutoff = isWithinCancellationSwapCutoff(
    selectedDateKey,
    course.time,
    cutoffMinutes,
  );
  const canSwapFromOrigin =
    (originallyParticipant || hasCancelled) &&
    canCreateSwapFromOrigin({
      isoDate: selectedDateKey,
      courseTime: course.time,
      tenantSettings,
      override,
      userName,
      participants,
      originallyParticipant,
    });
  const hasActiveOriginSwapInPast = swaps.some(
    (s) =>
      s.user === userName &&
      s.status === "active" &&
      s.fromCourseId === course.id &&
      s.fromDate === selectedDateKey &&
      new Date(s.toDate) < new Date(),
  );
  const hasActiveSwapFromOrigin = swaps.some(
    (s) =>
      s.user === userName &&
      s.status === "active" &&
      s.fromCourseId === course.id &&
      s.fromDate === selectedDateKey,
  );
  const hasRegularCancellation = isRegularCancellation(
    originallyParticipant,
    override,
    participants,
    userName,
  );
  const canUndoRegularAbsence =
    hasCancelled && !isShortNotice && !isParticipant && !hasActiveOriginSwapInPast;

  const pendingSwapsFromOrigin = useMemo(
    () =>
      swaps.filter(
        (s) =>
          s.user === userName &&
          s.fromCourseId === course.id &&
          s.fromDate === selectedDateKey &&
          s.status === "pending",
      ),
    [swaps, userName, course.id, selectedDateKey],
  );

  const existingPendingTargetCourseIds = useMemo(
    () => new Set(pendingSwapsFromOrigin.map((swap) => swap.toCourseId)),
    [pendingSwapsFromOrigin],
  );

  const availableSwapDates = useMemo(
    () =>
      getAvailableDates(
        allCourses,
        overrides,
        currentUser,
        swapWindow,
        new Date(selectedDate),
        undefined,
        tenantSettings,
      )
        .filter((option) => !existingPendingTargetCourseIds.has(option.course.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allCourses, overrides, currentUser, selectedDate, existingPendingTargetCourseIds, swapWindow, tenantSettings],
  );

  const waitlistDates = useMemo(
    () =>
      getWaitlistDates(
        allCourses,
        overrides,
        currentUser,
        swapWindow,
        new Date(selectedDate),
        undefined,
        tenantSettings,
      )
        .filter((option) => !existingPendingTargetCourseIds.has(option.course.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [allCourses, overrides, currentUser, selectedDate, existingPendingTargetCourseIds, swapWindow, tenantSettings],
  );

  const swapForThisTerm = useMemo(
    () =>
      swaps.find(
        (s) =>
          s.user === userName &&
          ((s.fromCourseId === course.id && s.fromDate === selectedDateKey) ||
            (s.toCourseId === course.id && s.toDate === selectedDateKey)),
      ),
    [swaps, userName, course.id, selectedDateKey],
  );

  const allSwapsForThisTerm = useMemo(
    () =>
      swaps.filter(
        (s) =>
          (s.fromCourseId === course.id && s.fromDate === selectedDateKey && s.user === userName) ||
          (s.toCourseId === course.id && s.toDate === selectedDateKey && s.user === userName),
      ),
    [swaps, userName, course.id, selectedDateKey],
  );

  const swapForWaitlist = useMemo(
    () =>
      swaps.find(
        (s) =>
          s.user === userName &&
          s.toCourseId === course.id &&
          s.toDate === selectedDateKey &&
          s.status === "pending",
      ),
    [swaps, userName, course.id, selectedDateKey],
  );

  const pendingCount = pendingSwapsFromOrigin.length;
  const hasPendingRequestsFromOrigin = pendingCount > 0;

  const hasUpcomingDates = dates.length > 0;
  const courseStatus = course.status ?? "active";
  const isInactiveCourse = courseStatus === "inactive";
  const inPostEndGrace = isWithinPostCourseEndGrace(course, tenantSettings);
  const inInactiveGrace =
    isInactiveCourse && isCourseInInactiveGracePeriod(course, tenantSettings);
  const graceLastIso =
    inPostEndGrace || inInactiveGrace
      ? getInactiveGraceLastDayIso(course, tenantSettings)
      : undefined;
  const lastActualOccurrenceIso = useMemo(
    () => lastScheduledOccurrenceIso({ dates: course.dates }),
    [course.dates],
  );
  const lastOccurrenceDate =
    lastActualOccurrenceIso != null
      ? buildCourseOccurrenceLocal(lastActualOccurrenceIso, course.time)
      : null;
  const showLastTermInSelect =
    hasNoUpcomingDates && lastOccurrenceDate != null && inPostEndGrace;
  const showLastTermMarkerInSelect =
    lastActualOccurrenceIso != null &&
    (showLastTermInSelect ||
      (includePastTermsInSelect &&
        isTermInParticipantSwapGrace(lastActualOccurrenceIso, course.time, tenantSettings)));
  const showAutoInactiveBadge =
    participantActionsLocked && looksLikeAutomaticallyInactive(course, hasUpcomingDates);
  const userSwapsOnCourse = useMemo(
    () =>
      swaps.filter(
        (s) =>
          s.user === userName &&
          (s.fromCourseId === course.id || s.toCourseId === course.id),
      ),
    [swaps, userName, course.id],
  );
  const cancellableUserSwapsOnCourse = useMemo(
    () => userSwapsOnCourse.filter((swap) => canCancelSwap(swap, allCourses)),
    [userSwapsOnCourse, allCourses],
  );
  const isPastOccurrence = isOccurrenceInPast(selectedDateKey, course.time);
  const isSelectedTermExcluded = isExcludedCourseDate(course, selectedDateKey);
  const termInSwapGrace = isTermInParticipantSwapGrace(
    selectedDateKey,
    course.time,
    tenantSettings,
  );
  const showPastGraceMarker =
    (includePastTermsInSelect || participantActionsLocked) &&
    isPastOccurrence &&
    !isSelectedTermExcluded &&
    termInSwapGrace;
  const showCutoffMarker =
    includePastTermsInSelect &&
    !isPastOccurrence &&
    !isSelectedTermExcluded &&
    originInCutoff;
  const showExcludedTermMarker = includePastTermsInSelect && isSelectedTermExcluded;
  const canUseFullTermActions =
    !participantActionsLocked &&
    hasUpcomingDates &&
    (isParticipant || originallyParticipant) &&
    !isPastOccurrence &&
    !isSelectedTermExcluded;
  const canRequestPastRcSwap = canRequestSwapFromPastCancelledOrigin({
    isoDate: selectedDateKey,
    courseTime: course.time,
    tenantSettings,
    override,
    userName,
    participants,
    originallyParticipant,
  });
  const canSwapFromPastCancelled = swapForThisTerm == null && canRequestPastRcSwap;
  const canRequestMorePastRcSwaps =
    canRequestPastRcSwap &&
    hasPendingRequestsFromOrigin &&
    canCreateSwapFromOrigin({
      isoDate: selectedDateKey,
      courseTime: course.time,
      tenantSettings,
      override,
      userName,
      participants,
      originallyParticipant,
    });
  const swapForThisTermCancellable =
    swapForThisTerm != null && canCancelSwap(swapForThisTerm, allCourses);
  const showPastTermSwapActions =
    !isSelectedTermExcluded &&
    isPastOccurrence &&
    (isParticipant || originallyParticipant || hasCancelled) &&
    (swapForThisTermCancellable || canSwapFromPastCancelled || canRequestMorePastRcSwaps);
  const excludedTermNotice = showExcludedTermMarker
    ? "Dieser Termin entfällt — vom Studio abgesagt."
    : null;

  const isAutomaticallyInactive =
    isInactiveCourse && looksLikeAutomaticallyInactive(course, hasUpcomingDates);
  const pastTermNotice =
    isPastOccurrence && !isSelectedTermExcluded
      ? resolvePastTermNotice({
          inSwapGrace: termInSwapGrace,
          hasRegularCancellation,
          hasShortNoticeCancellation: isShortNotice,
          hasPendingSwapFromOrigin: hasPendingRequestsFromOrigin,
          hasActiveSwapFromOrigin,
          canRequestAlternativeTerm: canRequestPastRcSwap && !hasPendingRequestsFromOrigin,
        })
      : null;
  const inactiveNotice =
    participantActionsLocked && !pastTermNotice && !isPastOccurrence
      ? resolveInactiveParticipantNotice({ isAutomaticallyInactive })
      : null;

  useEffect(() => {
    if (includePastTermsInSelect) return;
    if (showLastTermInSelect && lastOccurrenceDate) {
      setSelectedDate(lastOccurrenceDate.toISOString());
    }
  }, [includePastTermsInSelect, showLastTermInSelect, lastActualOccurrenceIso, course.time, lastOccurrenceDate]);

  const initialSelectedTime = initialSelectedDate?.getTime();
  useEffect(() => {
    if (initialSelectedTime == null) return;
    setSelectedDate(new Date(initialSelectedTime).toISOString());
  }, [initialSelectedTime]);

  const termSelectDisabled = hasNoUpcomingDates && !showLastTermInSelect;

  const swapStatusLines = useMemo(
    () =>
      allSwapsForThisTerm.map((swap) => formatSwapStatusLine(swap, course.id, allCourses)),
    [allSwapsForThisTerm, course.id, allCourses],
  );

  const showCutoffHint =
    canUseFullTermActions &&
    !swapForThisTerm &&
    originInCutoff &&
    (originallyParticipant || hasCancelled) &&
    !canSwapFromOrigin;

  const cutoffStatusLabel = showCutoffHint
    ? `Weniger als ${cutoffMinutes} Minuten vor Termin, kein Tausch mehr möglich`
    : undefined;

  const swapStatusExtras = swapStatusLines.length > 0 ? swapStatusLines : undefined;
  const cutoffExtras = cutoffStatusLabel ? [cutoffStatusLabel] : undefined;
  const termActionExtras = [...(swapStatusExtras ?? []), ...(cutoffExtras ?? [])];

  const swapPendingAbsenceAction = useMemo((): {
    action: string;
    outcome: AbsenceToggleOutcome;
  } | null => {
    if (swapForThisTerm?.status === "pending" && originallyParticipant) {
      return {
        action: hasCancelled ? "Absage zurücknehmen" : "Termin absagen",
        outcome: hasCancelled ? "undo" : "cancelled",
      };
    }
    return null;
  }, [swapForThisTerm, originallyParticipant, hasCancelled]);

  const primaryAbsenceAction = useMemo((): {
    action: string;
    outcome: AbsenceToggleOutcome;
  } | null => {
    if (isShortNotice) {
      return { action: "Absage zurücknehmen", outcome: "undo" };
    }
    if (isParticipant) {
      return {
        action: "Termin absagen",
        outcome: originInCutoff ? "shortNoticeCancelled" : "cancelled",
      };
    }
    if (canUndoRegularAbsence) {
      return { action: "Absage zurücknehmen", outcome: "undo" };
    }
    return null;
  }, [isShortNotice, isParticipant, canUndoRegularAbsence, originInCutoff]);

  const swapModalTitle = hasCancelled ? "Anderen Termin wählen" : "Tauschanfrage starten";

  return {
    swapWindow,
    selectedDate,
    setSelectedDate,
    selectedDateKey,
    override,
    participants,
    swapped,
    shortNotice,
    waitlist,
    guestCount,
    userName,
    userNameLower,
    isParticipant,
    originallyParticipant,
    isShortNotice,
    hasCancelled,
    cutoffMinutes,
    originInCutoff,
    canSwapFromOrigin,
    canUndoRegularAbsence,
    pendingSwapsFromOrigin,
    pendingCount,
    hasPendingRequestsFromOrigin,
    availableSwapDates,
    waitlistDates,
    swapForThisTerm,
    allSwapsForThisTerm,
    swapForWaitlist,
    hasNoUpcomingDates,
    hasUpcomingDates,
    showLastTermInSelect,
    showLastTermMarkerInSelect,
    lastActualOccurrenceIso,
    lastOccurrenceDate,
    showAutoInactiveBadge,
    graceLastIso,
    userSwapsOnCourse,
    cancellableUserSwapsOnCourse,
    isPastOccurrence,
    isSelectedTermExcluded,
    showPastGraceMarker,
    showCutoffMarker,
    showExcludedTermMarker,
    canUseFullTermActions,
    canSwapFromPastCancelled,
    canRequestMorePastRcSwaps,
    swapForThisTermCancellable,
    showPastTermSwapActions,
    excludedTermNotice,
    inactiveNotice,
    pastTermNotice,
    termSelectDisabled,
    swapStatusLines,
    showCutoffHint,
    cutoffStatusLabel,
    termActionExtras,
    swapPendingAbsenceAction,
    primaryAbsenceAction,
    swapModalTitle,
  };
}

export type CourseCardTermState = ReturnType<typeof useCourseCardTermState>;
