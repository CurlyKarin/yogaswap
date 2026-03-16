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

vi.mock("shared/permissions", () => ({
  canSeeCourse: vi.fn(),
}));

const baseUser: User = {
  nickname: "alice",
  email: "",
  role: "participant",
};

const baseTenant: Tenant = {
  tenantId: "default-tenant",
  name: "Default Tenant",
  settings: {},
};

const baseMembership: UserTenantMembership = {
  tenantId: "default-tenant",
  userId: "alice",
  role: "participant",
};

describe("CourseList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("zeigt während des Ladens 'Loading...' an und rendert anschließend Kurse (mit zukünftigen Terminen)", async () => {
    const { canSeeCourse } = await import("shared/permissions");

    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Yoga Basic",
        weekday: "Monday",
        time: "10:00",
        capacity: 10,
        participants: ["alice"],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    (canSeeCourse as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => true);

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

  it("zeigt Empty-State, wenn keine sichtbaren zukünftigen Termine vorhanden sind", async () => {
    const pastOnlyCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Vergangener Kurs",
        weekday: "Monday",
        time: "10:00",
        capacity: 10,
        participants: ["alice"],
        dates: ["2000-01-01"],
      },
    ];

    mockedGetCourses.mockResolvedValue(pastOnlyCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(
      <CourseList currentUser={baseUser} tenant={baseTenant} membership={baseMembership} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          /Aktuell keine Termine zum Anzeigen\. Es gibt nur vergangene Termine oder noch keine Kurse\./i,
        ),
      ).toBeInTheDocument();
    });
  });

  it("filtert Kurse anhand von canSeeCourse und sortiert sie nach ID", async () => {
    const { canSeeCourse } = await import("shared/permissions");

    const unsortedCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 2,
        name: "Kurs B",
        weekday: "Tuesday",
        time: "11:00",
        capacity: 10,
        participants: [],
        dates: ["2099-06-17"],
      },
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Monday",
        time: "10:00",
        capacity: 10,
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(unsortedCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    (canSeeCourse as unknown as ReturnType<typeof vi.fn>)
      .mockImplementation((membershipArg: UserTenantMembership, _settings, courseArg: Course) => {
        // Nur Kurs mit ID 2 ist sichtbar
        expect(membershipArg).toBe(baseMembership);
        return courseArg.id === 2;
      });

    render(
      <CourseList currentUser={baseUser} tenant={baseTenant} membership={baseMembership} />,
    );

    await waitFor(() => {
      // Kurs A sollte gefiltert sein
      expect(screen.queryByText("Kurs A")).not.toBeInTheDocument();
      // Kurs B wird gerendert
      expect(screen.getByText("Kurs B")).toBeInTheDocument();
    });
  });
});

