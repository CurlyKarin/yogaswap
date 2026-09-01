import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCourseSwaps } from "./useCourseSwaps";
import type { Course, CourseDateOverride, Swap, User } from "shared/types";

vi.mock("../api/swaps", () => ({
  createSwap: vi.fn(),
  deleteSwap: vi.fn(),
  processPromotions: vi.fn(),
  processRingSwaps: vi.fn(),
}));

vi.mock("../api/overrides", () => ({
  createOverride: vi.fn(),
  updateOverride: vi.fn(),
}));

vi.mock("../lib/waitlist", () => ({
  getEffectiveWaitlist: vi.fn().mockReturnValue([]),
}));

const { createSwap, deleteSwap, processPromotions, processRingSwaps } = await import("../api/swaps");
const { createOverride, updateOverride } = await import("../api/overrides");

const baseUser: User = {
  nickname: "alice",
  email: "",
  role: "participant",
};

const course: Course = {
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

const pendingSwap: Swap = {
  participantId: "alice",
  fromCourseId: 1,
  fromDate: "2099-06-16",
  toCourseId: 2,
  toDate: "2099-06-17",
  status: "pending",
};

describe("useCourseSwaps", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    (updateOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (createOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (processRingSwaps as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: "Ring swap analysis complete",
      diagnostics: {
        pendingSwaps: 0,
        graphNodes: 0,
        graphEdges: 0,
        detectedCycles: 0,
        selectedCycles: 0,
        droppedSwaps: 0,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("onToggleAbsence persistiert kurzfristige Absage im Cutoff vor processPromotions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 5, 16, 9, 30));

    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([baseOverride]),
    );
    const setSwaps = vi.fn();
    (updateOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [{ ...baseOverride, shortNoticeCancellations: [] }],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.onToggleAbsence(course, "2099-06-16", baseUser.nickname);
    });

    expect(updateOverride).toHaveBeenCalledWith(1, "2099-06-16", {
      participants: [],
      cancelledParticipants: [],
      swapped: [],
      waitlist: [],
      shortNoticeCancellations: ["alice"],
    });
    expect(processPromotions).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("onToggleAbsence aktualisiert Overrides und ruft processPromotions auf", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn();
    const setSwaps = vi.fn();

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.onToggleAbsence(course, "2099-06-16", baseUser.nickname);
    });

    expect(processPromotions).toHaveBeenCalledTimes(1);
  });

  it("requestSwap legt Swap mit Status 'pending' an und ruft Ringtausch + Promotions auf", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([baseOverride]),
    );
    const setSwaps = vi.fn();

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [pendingSwap],
      overrides: [baseOverride],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.requestSwap(course, "2099-06-16", 1, "2099-06-17", baseUser.nickname);
    });

    expect(createSwap).toHaveBeenCalledTimes(1);
    const [swapArg] = (createSwap as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((swapArg as Swap).status).toBe("pending");
    expect(processRingSwaps).toHaveBeenCalledTimes(1);
    expect(processPromotions).toHaveBeenCalledTimes(1);
  });

  it("requestSwap blockiert Zieltermin im Cutoff", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2099, 5, 17, 9, 30));

    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn();
    const setSwaps = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const targetCourse: Course = {
      ...course,
      id: 2,
      time: "10:00",
      capacity: 2,
      participants: ["bob"],
      dates: ["2099-06-17"],
    };

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, targetCourse],
        [{ ...baseOverride, date: "2099-06-20" }],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
        { cancellationSwapCutoffMinutesBeforeStart: 60 },
      ),
    );

    await act(async () => {
      await result.current.requestSwap(course, "2099-06-20", 2, "2099-06-17", baseUser.nickname);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Für diesen Zieltermin ist keine Tauschanfrage mehr möglich (kurz vor Kursbeginn).",
    );
    expect(createSwap).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    vi.useRealTimers();
  });

  it("confirmSwap bricht ab, wenn nur Überplanungs-Freiraum am Ziel", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([baseOverride]),
    );
    const setSwaps = vi.fn();

    const overbookTarget: Course = {
      ...course,
      id: 2,
      capacity: 2,
      overbookLimit: 1,
      participants: ["bob", "carol"],
      dates: ["2099-06-17"],
    };

    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, overbookTarget],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.confirmSwap(course, "2099-06-16", 2, "2099-06-17", baseUser.nickname);
    });

    expect(alertSpy).toHaveBeenCalledWith("Der gewählte Ersatztermin ist inzwischen voll.");
    expect(createSwap).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("confirmSwap bricht ab, wenn der Zieltermin inzwischen voll ist", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([baseOverride]),
    );
    const setSwaps = vi.fn();

    const fullTargetCourse: Course = {
      ...course,
      id: 2,
      name: "Yoga Advanced",
      capacity: 1,
      participants: ["bob"], // bereits voll
      dates: ["2099-06-17"],
    };

    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, fullTargetCourse],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.confirmSwap(course, "2099-06-16", 2, "2099-06-17", baseUser.nickname);
    });

    expect(alertSpy).toHaveBeenCalledWith("Der gewählte Ersatztermin ist inzwischen voll.");
    expect(createSwap).not.toHaveBeenCalled();
    expect(processPromotions).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("cancelSwap löscht Swaps und ruft deleteSwap sowie processPromotions auf", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([baseOverride]),
    );
    const setSwaps = vi.fn();

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [pendingSwap],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.cancelSwap(pendingSwap, 1);
    });

    expect(deleteSwap).toHaveBeenCalledTimes(1);
    expect(processRingSwaps).toHaveBeenCalledTimes(1);
    expect(processPromotions).toHaveBeenCalledTimes(1);
  });

  it("cancelSwap vom Ursprung bereinigt Wartelisten aller pending Ziele", async () => {
    const targetCourseA: Course = {
      ...course,
      id: 2,
      name: "Yoga A",
      dates: ["2099-06-17"],
      participants: ["bob"],
    };
    const targetCourseB: Course = {
      ...course,
      id: 3,
      name: "Yoga B",
      dates: ["2099-06-17"],
      participants: ["carol"],
    };
    const overrideA: CourseDateOverride = {
      courseId: 2,
      date: "2099-06-17",
      participants: ["bob"],
      swapped: [],
      waitlist: ["alice"],
    };
    const overrideB: CourseDateOverride = {
      courseId: 3,
      date: "2099-06-17",
      participants: ["carol"],
      swapped: [],
      waitlist: ["alice"],
    };
    const pendingToA: Swap = {
      participantId: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 2,
      toDate: "2099-06-17",
      status: "pending",
    };
    const pendingToB: Swap = {
      participantId: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 3,
      toDate: "2099-06-17",
      status: "pending",
    };

    const fetchData = vi.fn().mockResolvedValue(undefined);
    let latestOverrides: CourseDateOverride[] = [baseOverride, overrideA, overrideB];
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) => {
      latestOverrides = updater(latestOverrides);
    });
    const setSwaps = vi.fn();

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, targetCourseA, targetCourseB],
        latestOverrides,
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [pendingToA, pendingToB],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.cancelSwap(pendingToA, 1);
    });

    expect(deleteSwap).toHaveBeenCalledTimes(2);
    expect(updateOverride).toHaveBeenCalledWith(
      2,
      "2099-06-17",
      expect.objectContaining({ waitlist: [] }),
    );
    expect(updateOverride).toHaveBeenCalledWith(
      3,
      "2099-06-17",
      expect.objectContaining({ waitlist: [] }),
    );
  });

  it("cancelSwap pending sendet nur Wartelisten-Patch bei vollem Termin", async () => {
    const targetCourse: Course = {
      ...course,
      id: 2,
      capacity: 2,
      participants: ["bob", "carol"],
      dates: ["2099-06-17"],
    };
    const fullOverride: CourseDateOverride = {
      courseId: 2,
      date: "2099-06-17",
      participants: ["bob", "carol"],
      swapped: [],
      waitlist: ["alice"],
    };
    const pendingToTarget: Swap = {
      ...pendingSwap,
      toCourseId: 2,
      toDate: "2099-06-17",
    };

    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn();
    const setSwaps = vi.fn();

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, targetCourse],
        [baseOverride, fullOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [pendingToTarget],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.cancelSwap(pendingToTarget, 1);
    });

    expect(updateOverride).toHaveBeenCalledWith(2, "2099-06-17", { waitlist: [] });
    expect(updateOverride).not.toHaveBeenCalledWith(
      2,
      "2099-06-17",
      expect.objectContaining({ participants: expect.anything() }),
    );
  });

  it("requestSwap erstellt Swap erneut bei verwaistem Wartelisten-Eintrag", async () => {
    const targetCourse: Course = {
      ...course,
      id: 2,
      capacity: 2,
      participants: ["bob", "carol"],
      dates: ["2099-06-17"],
    };
    const orphanedOverride: CourseDateOverride = {
      courseId: 2,
      date: "2099-06-17",
      participants: ["bob", "carol"],
      swapped: [],
      waitlist: ["alice"],
    };

    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn();
    const setSwaps = vi.fn();

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [
        {
          ...pendingSwap,
          toCourseId: 2,
          toDate: "2099-06-17",
          status: "pending",
        },
      ],
      overrides: [orphanedOverride],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, targetCourse],
        [baseOverride, orphanedOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.requestSwap(course, "2099-06-16", 2, "2099-06-17", baseUser.nickname);
    });

    expect(updateOverride).not.toHaveBeenCalled();
    expect(createSwap).toHaveBeenCalledTimes(1);
    expect(processPromotions).toHaveBeenCalledTimes(1);
  });

  it("cancelSwap blockiert Abbrechen bei vergangenem Ursprung und Ziel", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0));

    const targetCourse: Course = {
      ...course,
      id: 2,
      dates: ["2020-01-13"],
    };
    const historicalSwap: Swap = {
      ...pendingSwap,
      fromDate: "2020-01-06",
      toDate: "2020-01-13",
      toCourseId: 2,
      status: "active",
    };
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn();
    const setSwaps = vi.fn();

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, targetCourse],
        [baseOverride],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [historicalSwap],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.cancelSwap(historicalSwap, 1);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining("Vergangenheit"),
    );
    expect(deleteSwap).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("confirmSwap löst übrige pending Anfragen vom selben Ursprung auf", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([
        baseOverride,
        {
          courseId: 2,
          date: "2099-06-17",
          participants: ["bob"],
          swapped: [],
          waitlist: ["alice", "mia"],
        },
        {
          courseId: 3,
          date: "2099-06-18",
          participants: ["nora"],
          swapped: [],
          waitlist: ["ALICE", "zoe"],
        },
      ]),
    );
    const setSwaps = vi.fn();
    const targetCourse: Course = {
      ...course,
      id: 4,
      name: "Yoga Ziel",
      participants: [],
      dates: ["2099-06-19"],
    };
    const pendingA: Swap = {
      participantId: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 2,
      toDate: "2099-06-17",
      status: "pending",
    };
    const pendingB: Swap = {
      participantId: "Alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 3,
      toDate: "2099-06-18",
      status: "pending",
    };

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course, targetCourse],
        [
          baseOverride,
          { courseId: 2, date: "2099-06-17", participants: ["bob"], swapped: [], waitlist: ["alice", "mia"] },
          { courseId: 3, date: "2099-06-18", participants: ["nora"], swapped: [], waitlist: ["ALICE", "zoe"] },
        ],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [pendingA, pendingB],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.confirmSwap(course, "2099-06-16", 4, "2099-06-19", baseUser.nickname);
    });

    expect(createSwap).toHaveBeenCalledTimes(1);
    expect(deleteSwap).toHaveBeenCalledTimes(2);
    expect(updateOverride).toHaveBeenCalledWith(
      2,
      "2099-06-17",
      expect.objectContaining({ waitlist: ["mia"] }),
    );
    expect(updateOverride).toHaveBeenCalledWith(3, "2099-06-18", { waitlist: ["zoe"] });
    expect(processPromotions).toHaveBeenCalledTimes(1);
  });

  it("RC-Rücknahme mit pending Swaps zeigt Warnung und räumt Swaps auf", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([
        {
          ...baseOverride,
          participants: [],
          cancelledParticipants: ["alice"], // RC: user ist ausgetragen
        },
        {
          courseId: 2,
          date: "2099-06-17",
          participants: ["bob"],
          swapped: [],
          waitlist: ["alice", "mia"],
        },
      ]),
    );
    const setSwaps = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    const pending: Swap = {
      participantId: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 2,
      toDate: "2099-06-17",
      status: "pending",
    };

    (processPromotions as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      swaps: [],
      overrides: [],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [
          { ...baseOverride, participants: [], cancelledParticipants: ["alice"] },
          { courseId: 2, date: "2099-06-17", participants: ["bob"], swapped: [], waitlist: ["alice", "mia"] },
        ],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [pending],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.onToggleAbsence(course, "2099-06-16", baseUser.nickname);
    });

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("Offene Tauschanfragen (1) werden gelöscht."),
    );
    expect(deleteSwap).toHaveBeenCalledTimes(1);
    expect(updateOverride).toHaveBeenCalledWith(
      2,
      "2099-06-17",
      expect.objectContaining({ waitlist: ["mia"] }),
    );
    confirmSpy.mockRestore();
  });

  it("RC-Rücknahme bricht bei Warnung-Abbruch ab", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([{ ...baseOverride, participants: [], cancelledParticipants: ["alice"] }]),
    );
    const setSwaps = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [{ ...baseOverride, participants: [], cancelledParticipants: ["alice"] }],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.onToggleAbsence(course, "2099-06-16", baseUser.nickname);
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(processPromotions).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("RC-Rücknahme blockiert bei aktivem Swap in der Vergangenheit", async () => {
    const fetchData = vi.fn().mockResolvedValue(undefined);
    const setOverrides = vi.fn((updater: (prev: CourseDateOverride[]) => CourseDateOverride[]) =>
      updater([{ ...baseOverride, participants: [], cancelledParticipants: ["alice"] }]),
    );
    const setSwaps = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    const activePast: Swap = {
      participantId: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 9,
      toDate: "2000-01-01",
      status: "active",
    };

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [{ ...baseOverride, participants: [], cancelledParticipants: ["alice"] }],
        setOverrides as unknown as (
          value:
            | CourseDateOverride[]
            | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [activePast],
        setSwaps as unknown as (
          value: Swap[] | ((prev: Swap[]) => Swap[])
        ) => void,
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.onToggleAbsence(course, "2099-06-16", baseUser.nickname);
    });

    expect(alertSpy).toHaveBeenCalledWith(
      "Absagen nicht möglich, solange ein aktiver Tausch vom Ursprungstermin besteht.",
    );
    expect(processPromotions).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("adjustGuestCount erhöht anonymousTrialCount per updateOverride", async () => {
    const setOverrides = vi.fn();
    const fetchData = vi.fn().mockResolvedValue(undefined);
    (updateOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (processPromotions as ReturnType<typeof vi.fn>).mockResolvedValue({ overrides: [] });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [baseOverride],
        setOverrides as unknown as (
          value: CourseDateOverride[] | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        vi.fn(),
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.adjustGuestCount(course, "2099-06-16", 1);
    });

    expect(updateOverride).toHaveBeenCalledWith(1, "2099-06-16", { anonymousTrialCount: 1 });
    expect(createOverride).not.toHaveBeenCalled();
    expect(fetchData).toHaveBeenCalled();
    expect(processPromotions).not.toHaveBeenCalled();
  });

  it("adjustGuestCount legt Override per createOverride an", async () => {
    const setOverrides = vi.fn();
    const fetchData = vi.fn().mockResolvedValue(undefined);
    (createOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [],
        setOverrides as unknown as (
          value: CourseDateOverride[] | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        vi.fn(),
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.adjustGuestCount(course, "2099-06-16", 1);
    });

    expect(createOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymousTrialCount: 1,
        participants: [],
        cancelledParticipants: [],
      }),
    );
    expect(fetchData).toHaveBeenCalled();
  });

  it("adjustGuestCount reduziert Gäste und ruft processPromotions auf", async () => {
    const setOverrides = vi.fn();
    const fetchData = vi.fn().mockResolvedValue(undefined);
    (updateOverride as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (processPromotions as ReturnType<typeof vi.fn>).mockResolvedValue({
      overrides: [baseOverride],
    });

    const { result } = renderHook(() =>
      useCourseSwaps(
        [course],
        [{ ...baseOverride, anonymousTrialCount: 1 }],
        setOverrides as unknown as (
          value: CourseDateOverride[] | ((prev: CourseDateOverride[]) => CourseDateOverride[])
        ) => void,
        [],
        vi.fn(),
        baseUser,
        { nickname: baseUser.nickname },
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.adjustGuestCount(course, "2099-06-16", -1);
    });

    expect(updateOverride).toHaveBeenCalledWith(1, "2099-06-16", { anonymousTrialCount: 0 });
    expect(processPromotions).toHaveBeenCalled();
  });
});

