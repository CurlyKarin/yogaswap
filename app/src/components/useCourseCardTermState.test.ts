import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Course, CourseDateOverride, Swap, User } from "shared/types";
import { useCourseCardTermState } from "./useCourseCardTermState";

const baseUser: User = {
  nickname: "alice",
  email: "",
  role: "participant",
};

const baseCourse: Course = {
  tenantId: "default-tenant",
  id: 1,
  name: "Yoga Basic",
  weekday: "Monday",
  time: "10:00",
  capacity: 10,
  participants: ["alice"],
  dates: ["2099-06-16"],
};

const baseOverride: CourseDateOverride = {
  courseId: 1,
  date: "2099-06-16",
  participants: ["alice"],
  swapped: [],
  waitlist: [],
};

const futureDate = new Date("2099-06-16T10:00:00Z");

function renderTermState(
  overrides: Partial<Parameters<typeof useCourseCardTermState>[0]> = {},
) {
  return renderHook(() =>
    useCourseCardTermState({
      course: baseCourse,
      allCourses: [baseCourse],
      currentUser: baseUser,
      dates: [futureDate],
      overrides: [baseOverride],
      swaps: [],
      ...overrides,
    }),
  );
}

describe("useCourseCardTermState", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leitet selectedDateKey und Teilnehmerstatus für den gewählten Termin ab", () => {
    const { result } = renderTermState();

    expect(result.current.selectedDateKey).toBe("2099-06-16");
    expect(result.current.isParticipant).toBe(true);
    expect(result.current.canUseFullTermActions).toBe(true);
    expect(result.current.primaryAbsenceAction).toEqual({
      action: "Termin absagen",
      outcome: "cancelled",
    });
  });

  it("erlaubt Tausch und Absage-Rücknahme nach regulärer Absage", () => {
    const cancelledOverride: CourseDateOverride = {
      ...baseOverride,
      participants: [],
    };

    const { result } = renderTermState({ overrides: [cancelledOverride] });

    expect(result.current.isParticipant).toBe(false);
    expect(result.current.hasCancelled).toBe(true);
    expect(result.current.canSwapFromOrigin).toBe(true);
    expect(result.current.primaryAbsenceAction).toEqual({
      action: "Absage zurücknehmen",
      outcome: "undo",
    });
  });

  it("setzt canUseFullTermActions auf false für vergangene Termine in der Wochenansicht", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-06-20T10:00:00Z"));

    const { result } = renderTermState({
      includePastTermsInSelect: true,
      dates: [new Date("2099-06-16T10:00:00Z")],
    });

    expect(result.current.isPastOccurrence).toBe(true);
    expect(result.current.canUseFullTermActions).toBe(false);

    vi.useRealTimers();
  });

  it("liefert Tausch-Modal-Titel abhängig vom Absagestatus", () => {
    const { result: enrolled } = renderTermState();
    expect(enrolled.current.swapModalTitle).toBe("Tauschanfrage starten");

    const cancelledOverride: CourseDateOverride = {
      ...baseOverride,
      participants: [],
    };
    const { result: cancelled } = renderTermState({ overrides: [cancelledOverride] });
    expect(cancelled.current.swapModalTitle).toBe("Anderen Termin wählen");
  });

  it("findet pending Swap für den gewählten Termin", () => {
    const pendingSwap: Swap = {
      user: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 2,
      toDate: "2099-06-17",
      status: "pending",
    };

    const { result } = renderTermState({
      swaps: [pendingSwap],
      allCourses: [baseCourse, { ...baseCourse, id: 2, name: "Yoga Advanced" }],
    });

    expect(result.current.swapForThisTerm).toEqual(pendingSwap);
    expect(result.current.swapPendingAbsenceAction).toEqual({
      action: "Termin absagen",
      outcome: "cancelled",
    });
  });
});
