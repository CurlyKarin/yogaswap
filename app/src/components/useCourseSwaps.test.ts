import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCourseSwaps } from "./useCourseSwaps";
import type { Course, CourseDateOverride, Swap, User } from "shared/types";

vi.mock("../api/swaps", () => ({
  createSwap: vi.fn(),
  deleteSwap: vi.fn(),
  processPromotions: vi.fn(),
}));

vi.mock("../api/overrides", () => ({
  createOverride: vi.fn(),
  updateOverride: vi.fn(),
}));

vi.mock("../lib/waitlist", () => ({
  getEffectiveWaitlist: vi.fn().mockReturnValue([]),
}));

const { createSwap, deleteSwap, processPromotions } = await import("../api/swaps");

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
  user: "alice",
  fromCourseId: 1,
  fromDate: "2099-06-16",
  toCourseId: 2,
  toDate: "2099-06-17",
  status: "pending",
};

describe("useCourseSwaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.onToggleAbsence(course, "2099-06-16", baseUser.nickname);
    });

    expect(processPromotions).toHaveBeenCalledTimes(1);
  });

  it("requestSwap legt Swap mit Status 'pending' an und ruft processPromotions auf", async () => {
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
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.requestSwap(course, "2099-06-16", 1, "2099-06-17", baseUser.nickname);
    });

    expect(createSwap).toHaveBeenCalledTimes(1);
    const [swapArg] = (createSwap as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((swapArg as Swap).status).toBe("pending");
    expect(processPromotions).toHaveBeenCalledTimes(1);
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
        fetchData,
      ),
    );

    await act(async () => {
      await result.current.cancelSwap(pendingSwap, 1);
    });

    expect(deleteSwap).toHaveBeenCalledTimes(1);
    expect(processPromotions).toHaveBeenCalledTimes(1);
  });
});

