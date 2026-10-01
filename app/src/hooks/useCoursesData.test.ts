import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { Course, User, UserTenantMembership } from "shared/types";
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
        weekAnchor: new Date("2099-06-15T12:00:00.000Z"),
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.courses).toHaveLength(1);
    expect(result.current.error).toBeNull();
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
        weekAnchor: new Date("2099-06-15T12:00:00.000Z"),
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
