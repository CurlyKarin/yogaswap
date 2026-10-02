import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { Course, Swap, User, UserTenantMembership } from "shared/types";
import { useCoursesData } from "./useCoursesData";

vi.mock("../api/courses", () => ({
  getCourses: vi.fn(),
}));
vi.mock("../api/overrides", () => ({
  getOverrides: vi.fn(),
}));
vi.mock("../api/courseEnrollments", () => ({
  getCourseEnrollments: vi.fn(),
}));
vi.mock("../api/swaps", () => ({
  getSwaps: vi.fn(),
  getSwapsByStatus: vi.fn(),
}));
vi.mock("../api/participants", () => ({
  getParticipantRoster: vi.fn(),
}));
vi.mock("../components/useCourseSwaps", () => ({
  useCourseSwaps: () => ({
    overrides: [],
    swaps: [],
    confirmSwap: vi.fn(),
    requestSwap: vi.fn(),
    cancelSwap: vi.fn(),
    onToggleAbsence: vi.fn(),
    adjustGuestCount: vi.fn(),
  }),
}));

const { getCourses } = await import("../api/courses");
const { getOverrides } = await import("../api/overrides");
const { getCourseEnrollments } = await import("../api/courseEnrollments");
const { getSwaps, getSwapsByStatus } = await import("../api/swaps");
const { getParticipantRoster } = await import("../api/participants");

const mockedGetCourses = getCourses as unknown as ReturnType<typeof vi.fn>;
const mockedGetOverrides = getOverrides as unknown as ReturnType<typeof vi.fn>;
const mockedGetCourseEnrollments = getCourseEnrollments as unknown as ReturnType<typeof vi.fn>;
const mockedGetSwaps = getSwaps as unknown as ReturnType<typeof vi.fn>;
const mockedGetSwapsByStatus = getSwapsByStatus as unknown as ReturnType<typeof vi.fn>;
const mockedGetParticipantRoster = getParticipantRoster as unknown as ReturnType<typeof vi.fn>;

const baseUser: User = {
  nickname: "alice",
  email: "",
  role: "participant",
};

const membership: UserTenantMembership = {
  tenantId: "default-tenant",
  userId: "alice",
  participantId: "alice",
  role: "participant",
};

const mockCourse: Course = {
  tenantId: "default-tenant",
  id: 1,
  name: "Yoga Basic",
  weekday: "Monday",
  time: "10:00",
  capacity: 10,
  status: "active",
  participants: ["alice"],
  dates: ["2099-06-16"],
};

const weekAnchor = new Date("2099-06-15T12:00:00.000Z");

describe("useCoursesData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCourses.mockResolvedValue([mockCourse]);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetCourseEnrollments.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    mockedGetSwapsByStatus.mockResolvedValue([]);
    mockedGetParticipantRoster.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setzt loading=false nach Phase 1, bevor Swaps/Roster fertig sind (#328)", async () => {
    let resolveSwaps: (value: unknown) => void = () => undefined;
    const swapsPending = new Promise((resolve) => {
      resolveSwaps = resolve;
    });
    mockedGetSwaps.mockReturnValue(swapsPending);

    let resolveRoster: (value: unknown) => void = () => undefined;
    const rosterPending = new Promise((resolve) => {
      resolveRoster = resolve;
    });
    mockedGetParticipantRoster.mockReturnValue(rosterPending);

    const { result } = renderHook(() =>
      useCoursesData({
        currentUser: baseUser,
        membership,
        weekAnchor,
        onlyMyCourses: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.courses).toHaveLength(1);
    expect(result.current.error).toBeNull();
    expect(result.current.deferredError).toBeNull();
    expect(mockedGetCourses).toHaveBeenCalled();
    expect(mockedGetOverrides).toHaveBeenCalled();
    expect(mockedGetCourseEnrollments).toHaveBeenCalled();
    expect(mockedGetSwaps).toHaveBeenCalled();
    expect(mockedGetSwapsByStatus).not.toHaveBeenCalled();

    // Phase 2 noch offen — Roster/Swaps leer bis aufgelöst
    expect(result.current.swaps).toEqual([]);
    expect(result.current.participantRoster).toEqual([]);

    await act(async () => {
      resolveSwaps([]);
      resolveRoster([
        { tenantId: "default-tenant", userId: "alice", participantId: "alice" },
      ]);
    });

    await waitFor(() => {
      expect(result.current.participantRoster).toEqual([
        { tenantId: "default-tenant", userId: "alice", participantId: "alice" },
      ]);
    });
  });

  it("hält loading bei onlyMyCourses bis Phase 2 fertig (#372)", async () => {
    let resolveSwaps: (value: unknown) => void = () => undefined;
    mockedGetSwaps.mockReturnValue(
      new Promise((resolve) => {
        resolveSwaps = resolve;
      }),
    );
    mockedGetParticipantRoster.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useCoursesData({
        currentUser: baseUser,
        membership,
        weekAnchor,
        onlyMyCourses: true,
      }),
    );

    await waitFor(() => {
      expect(mockedGetSwaps).toHaveBeenCalled();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.courses).toHaveLength(1);

    await act(async () => {
      resolveSwaps([]);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.deferredError).toBeNull();
  });

  it("setzt deferredError bei Phase-2-Fehler ohne Phase-1-Daten zu verwerfen (#372)", async () => {
    mockedGetSwaps.mockRejectedValue(new Error("swap boom"));

    const { result } = renderHook(() =>
      useCoursesData({
        currentUser: baseUser,
        membership,
        weekAnchor,
        onlyMyCourses: false,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.deferredError).toMatch(/tauschdaten/i);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.courses).toHaveLength(1);
    expect(result.current.swaps).toEqual([]);
  });

  it("verwirft veraltete parallele fetchData-Ergebnisse (#372)", async () => {
    let resolveFirstSwaps: (value: Swap[]) => void = () => undefined;
    let resolveSecondSwaps: (value: Swap[]) => void = () => undefined;
    let swapCall = 0;

    mockedGetSwaps.mockImplementation(
      () =>
        new Promise<Swap[]>((resolve) => {
          swapCall += 1;
          if (swapCall === 1) resolveFirstSwaps = resolve;
          else resolveSecondSwaps = resolve;
        }),
    );
    mockedGetParticipantRoster.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useCoursesData({
        currentUser: baseUser,
        membership,
        weekAnchor,
        onlyMyCourses: false,
      }),
    );

    await waitFor(() => {
      expect(mockedGetSwaps).toHaveBeenCalledTimes(1);
    });

    act(() => {
      void result.current.fetchData();
    });

    await waitFor(() => {
      expect(mockedGetSwaps).toHaveBeenCalledTimes(2);
    });

    const staleSwap: Swap = {
      participantId: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 2,
      toDate: "2099-06-17",
      status: "pending",
    };
    const freshSwap: Swap = {
      ...staleSwap,
      status: "active",
    };

    await act(async () => {
      resolveSecondSwaps([freshSwap]);
    });
    await waitFor(() => {
      expect(result.current.swaps).toEqual([freshSwap]);
    });

    await act(async () => {
      resolveFirstSwaps([staleSwap]);
    });

    // Microtask: stale Phase-2 darf den neueren Stand nicht überschreiben.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.swaps).toEqual([freshSwap]);
  });

  it("lädt für Admin pending/active Swaps sequenziell in Phase 2", async () => {
    const adminMembership: UserTenantMembership = { ...membership, role: "admin" };
    const callOrder: string[] = [];

    mockedGetCourses.mockImplementation(async () => {
      callOrder.push("courses");
      return [mockCourse];
    });
    mockedGetOverrides.mockImplementation(async () => {
      callOrder.push("overrides");
      return [];
    });
    mockedGetCourseEnrollments.mockImplementation(async () => {
      callOrder.push("enrollments");
      return [];
    });
    mockedGetSwapsByStatus.mockImplementation(async (status: string) => {
      callOrder.push(`swaps:${status}`);
      return [];
    });
    mockedGetParticipantRoster.mockImplementation(async () => {
      callOrder.push("roster");
      return [];
    });

    const { result } = renderHook(() =>
      useCoursesData({
        currentUser: { ...baseUser, role: "admin" },
        membership: adminMembership,
        weekAnchor,
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(callOrder).toContain("roster");
    });

    expect(mockedGetSwaps).not.toHaveBeenCalled();
    const phase1End = Math.max(
      callOrder.indexOf("courses"),
      callOrder.indexOf("overrides"),
      callOrder.indexOf("enrollments"),
    );
    expect(callOrder.indexOf("swaps:pending")).toBeGreaterThan(phase1End);
    expect(callOrder.indexOf("swaps:active")).toBeGreaterThan(callOrder.indexOf("swaps:pending"));
    expect(callOrder.indexOf("roster")).toBeGreaterThan(callOrder.indexOf("swaps:active"));
  });
});
