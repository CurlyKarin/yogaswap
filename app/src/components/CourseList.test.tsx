import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import CourseList from "./CourseList";
import { createCourse, deleteCourse, getCourses, updateCourse } from "../api/courses";
import { getOverrides } from "../api/overrides";
import { getSwaps } from "../api/swaps";
import type { User, Tenant, UserTenantMembership, Course } from "shared/types";
import { canSeeCourse } from "shared/permissions";

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
const mockedCreateCourse = createCourse as unknown as ReturnType<typeof vi.fn>;
const mockedUpdateCourse = updateCourse as unknown as ReturnType<typeof vi.fn>;
const mockedDeleteCourse = deleteCourse as unknown as ReturnType<typeof vi.fn>;
const mockedGetOverrides = getOverrides as unknown as ReturnType<typeof vi.fn>;
const mockedGetSwaps = getSwaps as unknown as ReturnType<typeof vi.fn>;
const mockedCanSeeCourse = canSeeCourse as unknown as ReturnType<typeof vi.fn>;

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
    mockedCreateCourse.mockReset();
    mockedUpdateCourse.mockReset();
    mockedDeleteCourse.mockReset();
    mockedCanSeeCourse.mockImplementation(() => true);
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

  it("rendert alle Kurse ohne Filter, wenn kein Tenant und keine Membership übergeben werden", async () => {
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

    // Kurse werden ohne Filter gerendert (können mehrfach vorkommen)
    const kursAElements = await screen.findAllByText("Kurs A");
    const kursBElements = await screen.findAllByText("Kurs B");
    expect(kursAElements.length).toBeGreaterThan(0);
    expect(kursBElements.length).toBeGreaterThan(0);

    // Ohne Tenant/Membership wird canSeeCourse nicht aufgerufen
    expect(canSeeCourse).not.toHaveBeenCalled();
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
    expect(screen.getByText(/Serienplanung: z\. B\. Quartal/i)).toBeInTheDocument();
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
    expect(screen.getByText(/Serienplanung: z\. B\. Quartal/i)).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Kursname bearbeiten");
    await user.clear(nameInput);
    await user.type(nameInput, "Kurs A Neu");
    expect(saveButton).not.toBeDisabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          name: "Kurs A Neu",
        }),
      );
    });
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
        status: "active",
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

    expect(screen.getByLabelText("Serienstart")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("Serienende")).toHaveValue("2026-01-31");

    const excludedInput = screen.getByLabelText("Ausnahmetermin");
    await user.clear(excludedInput);
    await user.type(excludedInput, "2026-01-13");
    await user.click(screen.getByRole("button", { name: /ausnahmedatum hinzufügen/i }));
    expect(screen.getByText("2026-01-13")).toBeInTheDocument();

    const saveButtons = screen.getAllByRole("button", { name: /termine übernehmen/i });
    await user.click(saveButtons[saveButtons.length - 1]);

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          planningMode: "bounded_series",
          visibilityMode: "fixed_window",
          seriesStartDate: "2026-01-01",
          seriesEndDate: "2026-01-31",
          excludedDates: ["2026-01-13"],
        }),
      );
    });
  });
});

