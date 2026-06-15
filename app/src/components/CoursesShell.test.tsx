import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoursesShell from "./CoursesShell";
import { User, Tenant, UserTenantMembership } from "shared/types";
import { formatWeekNavLabel, startOfWeekMonday, addWeeks } from "../lib/courseWeek";
import {
  buildWeekAnchorStorageKey,
  readStoredWeekAnchor,
  writeStoredWeekAnchor,
} from "../lib/weekNavPersistence";
import { getActorUserId } from "../api/delegation";

vi.mock("../api/delegation", () => ({
  getActorUserId: vi.fn(() => "maya"),
}));

const { mockUseCoursesData, createCoursesDataMock } = vi.hoisted(() => {
  type MockCoursesData = {
    loading: boolean;
    error: string | null;
    courses: [];
    weekCourseRows: [];
    hiddenPastCourseCount: number;
    overrides: [];
    swaps: [];
    confirmSwap: ReturnType<typeof vi.fn>;
    requestSwap: ReturnType<typeof vi.fn>;
    cancelSwap: ReturnType<typeof vi.fn>;
    onToggleAbsence: ReturnType<typeof vi.fn>;
    earliestWeekAnchor: Date;
  };

  const createCoursesDataMock = (overrides: Partial<MockCoursesData> = {}): MockCoursesData => ({
    loading: false,
    error: null,
    courses: [],
    weekCourseRows: [],
    hiddenPastCourseCount: 0,
    overrides: [],
    swaps: [],
    confirmSwap: vi.fn(),
    requestSwap: vi.fn(),
    cancelSwap: vi.fn(),
    onToggleAbsence: vi.fn(),
    earliestWeekAnchor: new Date(2026, 0, 5),
    ...overrides,
  });

  return {
    createCoursesDataMock,
    mockUseCoursesData: vi.fn(() => createCoursesDataMock()),
  };
});

vi.mock("./CourseList", () => ({
  default: () => <div>CourseList Mock</div>,
}));

vi.mock("../hooks/useCoursesData", () => ({
  useCoursesData: () => mockUseCoursesData(),
}));

vi.mock("./CourseWeekView", () => ({
  default: ({ loading, error }: { loading?: boolean; error?: string | null }) => {
    if (loading) {
      return (
        <div role="status" aria-live="polite">
          Kurse werden geladen…
        </div>
      );
    }
    if (error) {
      return <div role="alert">{error}</div>;
    }
    return <div>CourseWeekView Mock</div>;
  },
}));

const baseUser: User = {
  nickname: "maya",
  email: "maya@example.com",
  role: "participant",
};

const baseTenant: Tenant = {
  tenantId: "default-tenant",
  name: "Default",
};

const participantMembership: UserTenantMembership = {
  tenantId: "default-tenant",
  userId: "maya",
  role: "participant",
};

const adminMembership: UserTenantMembership = {
  tenantId: "default-tenant",
  userId: "admin",
  role: "admin",
};

describe("CoursesShell", () => {
  beforeEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.mocked(getActorUserId).mockReturnValue("maya");
    mockUseCoursesData.mockReturnValue(createCoursesDataMock());
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
  });

  it("shows week view by default for participants without view toggle", () => {
    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    expect(screen.getByText("CourseWeekView Mock")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /kursansicht/i })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /kalenderwoche/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /wochenansicht/i })).toHaveAttribute(
      "aria-describedby",
      "course-views-hint",
    );
  });

  it("lets admin switch between week and course overview", async () => {
    const user = userEvent.setup();
    render(
      <CoursesShell
        currentUser={{ ...baseUser, nickname: "admin", role: "admin" }}
        tenant={baseTenant}
        membership={adminMembership}
      />,
    );

    const weekToggle = screen.getByRole("button", { name: /wochenansicht/i });
    const listToggle = screen.getByRole("button", { name: /kursübersicht/i });
    expect(weekToggle).toHaveAttribute("aria-controls", "course-week-panel");
    expect(listToggle).toHaveAttribute("aria-controls", "course-list-panel");

    expect(screen.getByText("CourseWeekView Mock")).toBeInTheDocument();

    await user.click(listToggle);
    expect(screen.getByRole("region", { name: /kursübersicht/i })).toBeInTheDocument();
    expect(screen.getByText("CourseList Mock")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /kalenderwoche/i })).not.toBeInTheDocument();

    await user.click(weekToggle);
    expect(screen.getByText("CourseWeekView Mock")).toBeInTheDocument();
  });

  it("updates week label when navigating weeks", async () => {
    const user = userEvent.setup();
    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /kalenderwoche/i });
    const label = within(nav).getByText(/^KW \d+ · /);
    expect(label).toHaveAttribute("aria-live", "polite");
    const before = label.textContent;
    await user.click(within(nav).getByRole("button", { name: /nächste woche/i }));
    expect(label.textContent).not.toBe(before);
  });

  it("setzt Fokus auf Nächste Woche nach Sprung zur frühesten KW", async () => {
    const user = userEvent.setup();
    const currentWeek = startOfWeekMonday(new Date());
    const previousWeek = new Date(currentWeek);
    previousWeek.setDate(previousWeek.getDate() - 7);

    mockUseCoursesData.mockReturnValue(
      createCoursesDataMock({ earliestWeekAnchor: previousWeek }),
    );

    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /kalenderwoche/i });
    const prevBtn = within(nav).getByRole("button", { name: /vorherige woche/i });
    const nextBtn = within(nav).getByRole("button", { name: /nächste woche/i });

    expect(prevBtn).not.toBeDisabled();
    await user.click(prevBtn);

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toHaveFocus();
    expect(document.getElementById("course-week-nav-limit-status")).toHaveTextContent(
      "Früheste sichtbare Kalenderwoche erreicht.",
    );
  });

  it("erklärt deaktivierte Vorherige-Woche-Schaltfläche", () => {
    mockUseCoursesData.mockReturnValue(
      createCoursesDataMock({ earliestWeekAnchor: startOfWeekMonday(new Date()) }),
    );

    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    const prevBtn = screen.getByRole("button", { name: /vorherige woche/i });
    expect(prevBtn).toBeDisabled();
    expect(prevBtn).toHaveAttribute("aria-describedby", "course-week-nav-prev-limit");
    expect(screen.getByText(/früheste sichtbare kalenderwoche erreicht/i)).toBeInTheDocument();
  });

  it("zeigt Lade- und Fehlerzustand in der Wochenansicht", () => {
    mockUseCoursesData.mockReturnValue(createCoursesDataMock({ loading: true }));

    const { rerender } = render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    expect(screen.getByText(/kurse werden geladen/i)).toBeInTheDocument();

    mockUseCoursesData.mockReturnValue(
      createCoursesDataMock({ error: "Netzwerkfehler" }),
    );

    rerender(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Netzwerkfehler");
  });

  it("restores weekAnchor from sessionStorage on mount", () => {
    const storedWeek = startOfWeekMonday(new Date(2099, 5, 14));
    writeStoredWeekAnchor(buildWeekAnchorStorageKey("default-tenant", "maya"), storedWeek);

    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    expect(screen.getByText(formatWeekNavLabel(storedWeek))).toBeInTheDocument();
  });

  it("persists week navigation in sessionStorage", async () => {
    const user = userEvent.setup();
    const storageKey = buildWeekAnchorStorageKey("default-tenant", "maya");
    const initialWeek = startOfWeekMonday(new Date());
    const expectedWeek = addWeeks(initialWeek, 1);

    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /kalenderwoche/i });
    await user.click(within(nav).getByRole("button", { name: /nächste woche/i }));

    expect(within(nav).getByText(formatWeekNavLabel(expectedWeek))).toBeInTheDocument();
    expect(readStoredWeekAnchor(storageKey)?.getTime()).toBe(expectedWeek.getTime());
  });

  it("keeps weekAnchor when switching into delegation view", async () => {
    const user = userEvent.setup();
    vi.mocked(getActorUserId).mockReturnValue("admin");

    const { rerender } = render(
      <CoursesShell
        currentUser={{ ...baseUser, nickname: "admin", role: "admin" }}
        tenant={baseTenant}
        membership={adminMembership}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /kalenderwoche/i });
    await user.click(within(nav).getByRole("button", { name: /nächste woche/i }));
    const labelAfterNav = within(nav).getByText(/^KW \d+ · /).textContent;

    rerender(
      <CoursesShell
        currentUser={{ ...baseUser, nickname: "maya", role: "participant" }}
        tenant={baseTenant}
        membership={adminMembership}
        forceParticipantView
      />,
    );

    expect(within(screen.getByRole("navigation", { name: /kalenderwoche/i })).getByText(
      /^KW \d+ · /,
    ).textContent).toBe(labelAfterNav);
  });

  it("resets to current week via Heute and updates sessionStorage", async () => {
    const user = userEvent.setup();
    const storageKey = buildWeekAnchorStorageKey("default-tenant", "maya");
    const currentWeek = startOfWeekMonday(new Date());
    const futureWeek = addWeeks(currentWeek, 2);

    render(
      <CoursesShell
        currentUser={baseUser}
        tenant={baseTenant}
        membership={participantMembership}
      />,
    );

    const nav = screen.getByRole("navigation", { name: /kalenderwoche/i });
    await user.click(within(nav).getByRole("button", { name: /nächste woche/i }));
    await user.click(within(nav).getByRole("button", { name: /nächste woche/i }));
    expect(within(nav).getByText(formatWeekNavLabel(futureWeek))).toBeInTheDocument();

    await user.click(within(nav).getByRole("button", { name: /zur aktuellen kalenderwoche springen/i }));

    expect(within(nav).getByText(formatWeekNavLabel(currentWeek))).toBeInTheDocument();
    expect(readStoredWeekAnchor(storageKey)?.getTime()).toBe(currentWeek.getTime());
  });
});
