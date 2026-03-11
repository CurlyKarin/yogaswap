import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import CourseList from "./CourseList";
import { getCourses } from "../api/courses";
import { getOverrides } from "../api/overrides";
import { getSwaps } from "../api/swaps";
import type { User, Tenant, UserTenantMembership, Course } from "shared/types";

vi.mock("../api/courses");
vi.mock("../api/overrides");
vi.mock("../api/swaps");
vi.mock("./useCourseSwaps", () => {
  return {
    useCourseSwaps: () => ({
      overrides: [],
      swaps: [],
      confirmSwap: vi.fn(),
      requestSwap: vi.fn(),
      cancelSwap: vi.fn(),
      onToggleAbsence: vi.fn(),
    }),
  };
});

const mockedGetCourses = getCourses as unknown as ReturnType<typeof vi.fn>;
const mockedGetOverrides = getOverrides as unknown as ReturnType<typeof vi.fn>;
const mockedGetSwaps = getSwaps as unknown as ReturnType<typeof vi.fn>;

const baseUser: User = {
  nickname: "alice",
} as any;

const baseTenant: Tenant = {
  id: "default-tenant",
  name: "Default Tenant",
  settings: {
    visibility: "public",
  },
} as any;

const baseMembership: UserTenantMembership = {
  tenantId: "default-tenant",
  userId: "alice",
  role: "participant",
} as any;

describe("CourseList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt während des Ladens 'Loading...' an und rendert anschließend Kurse (mit zukünftigen Terminen)", async () => {
    const mockCourses: Course[] = [
      {
        id: 1,
        name: "Yoga Basic",
        weekday: "Monday",
        time: "10:00",
        capacity: 10,
        participants: ["alice"],
        dates: ["2099-06-16"],
      } as any,
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(
      <CourseList currentUser={baseUser} tenant={baseTenant} membership={baseMembership} />,
    );

    // Initial: Loading
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();

    // Danach wird entweder der Kursname oder zumindest das Grid gerendert
    await waitFor(() => {
      expect(screen.queryByText(/Loading.../i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(
          /Aktuell keine Termine zum Anzeigen\. Es gibt nur vergangene Termine oder noch keine Kurse\./i,
        ),
      ).not.toBeInTheDocument();
    });
  });

  it("zeigt eine Fehlermeldung an, wenn das Laden fehlschlägt", async () => {
    mockedGetCourses.mockRejectedValue(new Error("Network error"));
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(
      <CourseList currentUser={baseUser} tenant={baseTenant} membership={baseMembership} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load data/i)).toBeInTheDocument();
    });
  });
});

