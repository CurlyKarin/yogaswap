import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import CourseList from "./CourseList";
import { createCourse, deleteCourse, getCourses, updateCourse } from "../api/courses";
import { getOverrides } from "../api/overrides";
import { getSwaps, getSwapsByStatus } from "../api/swaps";
import { getParticipants } from "../api/participants";
import type { User, Tenant, UserTenantMembership, Course } from "shared/types";
import { canSeeCourse } from "shared/permissions";

vi.mock("../api/courses");
vi.mock("../api/overrides");
vi.mock("../api/swaps");
vi.mock("../api/participants");
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
const mockedCreateCourse = createCourse as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateCourse = updateCourse as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteCourse = deleteCourse as unknown as ReturnType<typeof vi.fn>;
const mockedGetOverrides = getOverrides as unknown as ReturnType<typeof vi.fn>;
const mockedGetSwaps = getSwaps as unknown as ReturnType<typeof vi.fn>;
const mockedGetSwapsByStatus = getSwapsByStatus as unknown as ReturnType<typeof vi.fn>;
const mockedGetParticipants = getParticipants as unknown as ReturnType<typeof vi.fn>;
const mockedCanSeeCourse = canSeeCourse as unknown as ReturnType<typeof vi.fn>;

vi.mock("shared/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("shared/permissions")>();
  return {
    ...actual,
    canSeeCourse: vi.fn(),
  };
});

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

function formatDateForDisplay(isoDate: string): string {
  return new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate}T12:00:00.000Z`),
  );
}

describe("CourseList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCourses.mockReset();
    mockedGetOverrides.mockReset();
    mockedGetSwaps.mockReset();
    mockedGetSwapsByStatus.mockReset();
    mockedCreateCourse.mockReset();
    mockedUpdateCourse.mockReset();
    mockedDeleteCourse.mockReset();
    mockedGetParticipants.mockReset();
    mockedGetParticipants.mockResolvedValue([]);
    mockedCanSeeCourse.mockImplementation(() => true);
    mockedGetSwapsByStatus.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
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
        screen.queryByText(/Aktuell keine Kurse in dieser Ansicht/i),
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
      expect(screen.getByText(/Aktuell keine Kurse in dieser Ansicht/i)).toBeInTheDocument();
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
        expect(membershipArg).toEqual(baseMembership);
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

  it("wendet canSeeCourse mit Cognito-Fallback an, wenn kein Tenant/Membership übergeben wird", async () => {
    const mockCourses: Course[] = [
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
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    const { canSeeCourse } = await import("shared/permissions");

    render(<CourseList currentUser={baseUser} />);

    // Standard-Teilnehmer sieht beide aktiven Kurse; Kacheln können mehrfach vorkommen
    const kursAElements = await screen.findAllByText("Kurs A");
    const kursBElements = await screen.findAllByText("Kurs B");
    expect(kursAElements.length).toBeGreaterThan(0);
    expect(kursBElements.length).toBeGreaterThan(0);

    // Synthetische Membership: canSeeCourse wird pro Kurs aufgerufen (Standard-Teilnehmer sieht beide Kurse)
    await waitFor(() => {
      expect(canSeeCourse).toHaveBeenCalled();
    });
  });

  it("zeigt Admin-Kursverwaltung und legt Kurs über Modal an", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "draft",
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    mockedCreateCourse.mockResolvedValue({
      id: 2,
      name: "Neuer Kurs",
      weekday: "Tue",
      time: "18:30",
      capacity: 12,
      status: "draft",
      participants: [],
      dates: [],
    });

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const courseMatches = await screen.findAllByText("Kurs A");
    expect(courseMatches.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    const createButtons = screen.getAllByRole("button", { name: /kurs anlegen/i });
    await user.click(createButtons[createButtons.length - 1]);
    expect(screen.getByText(/Kursblock: z\. B\. Quartal/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Kursname"), "Neuer Kurs");
    await user.clear(screen.getByLabelText("Kapazität"));
    await user.type(screen.getByLabelText("Kapazität"), "12");
    await user.click(screen.getByRole("button", { name: /^anlegen$/i }));

    await waitFor(() => {
      expect(mockedCreateCourse).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Neuer Kurs",
          capacity: 12,
          planningMode: "bounded_series",
          visibilityMode: "fixed_window",
        }),
      );
    });
  });

  it("zeigt Instructor-Aktionen deaktiviert", async () => {
    const instructorMembership: UserTenantMembership = {
      ...baseMembership,
      role: "instructor",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "active",
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={instructorMembership} />);

    const courseMatches = await screen.findAllByText("Kurs A");
    expect(courseMatches.length).toBeGreaterThan(0);

    expect(
      screen
        .getAllByRole("button", { name: /kurs anlegen/i })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: /kurs bearbeiten kurs a/i })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: /kurs löschen kurs a/i })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: /mitglieder bearbeiten kurs a/i })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: /termine bearbeiten kurs a/i })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });

  it("blendet Kursverwaltung im Vertretungsmodus aus (auch für Admin)", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
      userId: "admin",
    };
    const delegatedUser: User = {
      ...baseUser,
      nickname: "maya",
      role: "participant",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "active",
        participants: ["maya"],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(
      <CourseList
        currentUser={delegatedUser}
        tenant={baseTenant}
        membership={adminMembership}
        forceParticipantView
      />,
    );

    await screen.findAllByText("Kurs A");
    expect(screen.queryByText(/Kurse verwalten/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /kurs anlegen/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mitglieder bearbeiten kurs a/i })).not.toBeInTheDocument();

    expect(mockedCanSeeCourse).toHaveBeenCalled();
    const firstMembershipArg = mockedCanSeeCourse.mock.calls[0][0] as UserTenantMembership;
    expect(firstMembershipArg.role).toBe("participant");
    expect(firstMembershipArg.userId).toBe("maya");
  });

  it("aktiviert Speichern im Edit-Dialog erst nach Änderungen", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "draft",
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    mockedUpdateCourse.mockResolvedValue({
      ...mockCourses[0],
      name: "Kurs A Neu",
    });

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const courseMatches = await screen.findAllByText("Kurs A");
    expect(courseMatches.length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /kurs bearbeiten kurs a/i })[0]);

    const saveButton = screen.getByRole("button", { name: /^speichern$/i });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/Kursblock: z\. B\. Quartal/i)).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Kursname bearbeiten");
    await user.clear(nameInput);
    await user.type(nameInput, "Kurs A Neu");
    expect(saveButton).not.toBeDisabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          name: "Kurs A Neu",
        }),
      );
    });
  });

  it("überschreibt beim Kursbearbeiten keinen gesetzten Kursblock-Zeitraum", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurzer Block",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "draft",
        planningMode: "bounded_series",
        seriesStartDate: "2026-01-05",
        seriesEndDate: "2026-01-05",
        visibleFrom: "2026-01-05",
        visibleUntil: "2026-01-05",
        participants: [],
        dates: ["2026-01-05"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    mockedUpdateCourse.mockResolvedValue({ ...mockCourses[0], name: "Kurzer Block umbenannt" });

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const user = userEvent.setup();
    await screen.findByText("Kurzer Block");
    await user.click(screen.getAllByRole("button", { name: /kurs bearbeiten kurzer block/i })[0]);

    const nameInput = screen.getByLabelText("Kursname bearbeiten");
    await user.clear(nameInput);
    await user.type(nameInput, "Kurzer Block umbenannt");
    await user.click(screen.getByRole("button", { name: /^speichern$/i }));

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        "1",
        expect.not.objectContaining({
          seriesStartDate: expect.any(String),
          seriesEndDate: expect.any(String),
        }),
      );
    });
  });

  it("sperrt Modus und Inaktiv bei aktivem Durchlaufend-Kurs mit Teilnehmern", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Rollend",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "active",
        planningMode: "rolling_continuous",
        visibilityMode: "rolling_horizon",
        participants: ["luna"],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const user = userEvent.setup();
    await screen.findByText("Rollend");
    await user.click(screen.getByRole("button", { name: /kurs bearbeiten rollend/i }));

    expect(screen.getByLabelText("Planungsmodus bearbeiten")).toBeDisabled();
    expect(screen.getByText(/Planungsmodus kann bei einem aktiven Kurs/)).toBeInTheDocument();
    expect(screen.getByLabelText("Status bearbeiten")).toBeEnabled();
    const inactiveOption = screen.getByRole("option", { name: /inaktiv/i });
    expect(inactiveOption).toBeDisabled();
    expect(screen.getByText(/ein Kursende/)).toBeInTheDocument();
  });

  it("setzt Fokus beim Öffnen ins Edit-Modal und hält Tab im Dialog", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "draft",
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const user = userEvent.setup();
    await screen.findAllByText("Kurs A");
    await user.click(screen.getAllByRole("button", { name: /kurs bearbeiten kurs a/i })[0]);

    const nameInput = screen.getByLabelText("Kursname bearbeiten");
    await waitFor(() => {
      expect(nameInput).toHaveFocus();
    });

    // Durch viele Tabs darf der Fokus den Dialog nicht verlassen.
    for (let i = 0; i < 10; i += 1) {
      await user.tab();
      const active = document.activeElement;
      expect(active).not.toBeNull();
      expect(screen.getByLabelText("Kurs bearbeiten").contains(active as Node)).toBe(true);
    }
  });

  it("schließt den Lösch-Dialog mit Escape", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "inactive",
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const user = userEvent.setup();
    await screen.findAllByText("Kurs A");
    await user.click(screen.getAllByRole("button", { name: /kurs löschen kurs a/i })[0]);

    expect(screen.getByLabelText("Kurs löschen")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByLabelText("Kurs löschen")).not.toBeInTheDocument();
    });
  });

  it("öffnet Mitglieder- und Termine-Dialog über Statusleisten-Icons", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Mon",
        time: "10:00",
        capacity: 10,
        status: "active",
        planningMode: "rolling_continuous",
        participants: [],
        dates: ["2099-06-16"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const user = userEvent.setup();
    await screen.findAllByText("Kurs A");

    const membersButtons = screen.getAllByRole("button", { name: /mitglieder bearbeiten kurs a/i });
    await user.click(membersButtons[membersButtons.length - 1]);
    expect(screen.getByLabelText("Kursmitglieder bearbeiten")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByLabelText("Kursmitglieder bearbeiten")).not.toBeInTheDocument();
    });

    const datesButtons = screen.getAllByRole("button", { name: /termine bearbeiten kurs a/i });
    await user.click(datesButtons[datesButtons.length - 1]);
    expect(screen.getByLabelText("Kurstermine bearbeiten")).toBeInTheDocument();
    expect(screen.getByText(/Durchlaufend \(rollend\)/i)).toBeInTheDocument();
  });

  it("speichert Serienplanung mit excludedDates im Termine-Dialog", async () => {
    const adminMembership: UserTenantMembership = {
      ...baseMembership,
      role: "admin",
    };
    const mockCourses: Course[] = [
      {
        tenantId: "default-tenant",
        id: 1,
        name: "Kurs A",
        weekday: "Tue",
        time: "10:00",
        capacity: 10,
        status: "draft",
        planningMode: "bounded_series",
        seriesStartDate: "2026-01-01",
        seriesEndDate: "2026-01-31",
        excludedDates: [],
        participants: [],
        dates: ["2026-01-06"],
      },
    ];

    mockedGetCourses.mockResolvedValue(mockCourses);
    mockedGetOverrides.mockResolvedValue([]);
    mockedGetSwaps.mockResolvedValue([]);
    mockedUpdateCourse.mockResolvedValue(mockCourses[0]);

    render(<CourseList currentUser={baseUser} tenant={baseTenant} membership={adminMembership} />);

    const user = userEvent.setup();
    await screen.findAllByText("Kurs A");
    const datesButtons = screen.getAllByRole("button", { name: /termine bearbeiten kurs a/i });
    await user.click(datesButtons[datesButtons.length - 1]);

    expect(screen.getByLabelText("Startdatum Wert")).toHaveTextContent(formatDateForDisplay("2026-01-01"));
    expect(screen.getByLabelText("Enddatum Wert")).toHaveTextContent(formatDateForDisplay("2026-01-31"));

    await user.click(screen.getByRole("button", { name: /kalender für zeitraum öffnen/i }));
    expect(screen.getByRole("button", { name: /kalender schließen/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /datum 2026-01-05/i }));
    await user.click(screen.getByRole("button", { name: /datum 2026-01-26/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Startdatum Wert")).toHaveTextContent(formatDateForDisplay("2026-01-05"));
      expect(screen.getByLabelText("Enddatum Wert")).toHaveTextContent(formatDateForDisplay("2026-01-26"));
    });
    await user.click(screen.getByRole("button", { name: /kalender schließen/i }));
    expect(screen.queryByRole("button", { name: /datum 2026-01-13/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /kalender für ausnahmetermin öffnen/i }));
    const excludedCell = screen.getByRole("button", { name: /ausnahme datum 2026-01-13/i });
    await user.click(excludedCell);
    expect(screen.getByText(formatDateForDisplay("2026-01-13"))).toBeInTheDocument();
    await user.click(excludedCell);
    expect(screen.getByText(/keine ausgeschlossenen termine/i)).toBeInTheDocument();
    await user.click(excludedCell);
    expect(screen.getByText(formatDateForDisplay("2026-01-13"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /kalender schließen/i }));
    expect(screen.queryByRole("button", { name: /ausnahme datum 2026-01-13/i })).not.toBeInTheDocument();

    const saveButtons = screen.getAllByRole("button", { name: /termine übernehmen/i });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          planningMode: "bounded_series",
          visibilityMode: "fixed_window",
          seriesStartDate: "2026-01-05",
          seriesEndDate: "2026-01-26",
          excludedDates: ["2026-01-13"],
        }),
      );
    });
  });
});

