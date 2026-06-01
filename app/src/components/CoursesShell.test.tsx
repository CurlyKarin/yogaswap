import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CoursesShell from "./CoursesShell";
import { User, Tenant, UserTenantMembership } from "shared/types";

vi.mock("./CourseList", () => ({
  default: () => <div>CourseList Mock</div>,
}));

vi.mock("../hooks/useCoursesData", () => ({
  useCoursesData: () => ({
    loading: false,
    error: null,
    weekCourseRows: [],
    overrides: [],
  }),
}));

vi.mock("./CourseWeekView", () => ({
  default: () => <div>CourseWeekView Mock</div>,
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
  });

  afterEach(() => {
    cleanup();
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

    expect(screen.getByText("CourseWeekView Mock")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /kursübersicht/i }));
    expect(screen.getByText("CourseList Mock")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /kalenderwoche/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /wochenansicht/i }));
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
    const before = label.textContent;
    await user.click(within(nav).getByRole("button", { name: /nächste woche/i }));
    expect(label.textContent).not.toBe(before);
  });
});
