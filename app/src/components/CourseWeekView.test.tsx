import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CourseWeekView from "./CourseWeekView";
import type { Course, User } from "shared/types";

const courseCardMock = vi.fn();

vi.mock("./CourseCard", () => ({
  default: (props: unknown) => {
    courseCardMock(props);
    return <div data-testid="course-card-mock">CourseCard</div>;
  },
}));

const baseUser: User = {
  nickname: "maya",
  email: "maya@example.com",
  role: "participant",
};

const sampleCourse: Course = {
  id: 1,
  name: "Morgen Yoga",
  weekday: "Mon",
  time: "10:00",
  capacity: 8,
  participants: ["maya"],
  dates: ["2099-06-01", "2099-06-08"],
  excludedDates: [],
};

const noop = () => {};

const baseProps = {
  weekAnchor: new Date(2099, 5, 2),
  onWeekAnchorChange: vi.fn(),
  loading: false,
  error: null as string | null,
  courses: [sampleCourse],
  hiddenPastCourseCount: 0,
  overrides: [],
  swaps: [],
  currentUser: baseUser,
  canSeeCourseManagement: false,
  onToggleAbsence: noop,
  confirmSwap: noop,
  requestSwap: noop,
  cancelSwap: noop,
};

describe("CourseWeekView", () => {
  beforeEach(() => {
    cleanup();
    courseCardMock.mockReset();
    courseCardMock.mockImplementation(() => <div data-testid="course-card-mock">CourseCard</div>);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders course cards in a grid for the week", () => {
    render(
      <CourseWeekView
        {...baseProps}
        rows={[{ course: sampleCourse, occurrences: [{ dateIso: "2099-06-08", kind: "scheduled" }] }]}
      />,
    );

    const weekRegion = screen.getByRole("region", { name: /wochenansicht/i });
    expect(weekRegion).toBeInTheDocument();
    expect(weekRegion.querySelector(".grid")).toBeTruthy();
    expect(screen.getByTestId("course-card-mock")).toBeInTheDocument();
    const firstCallProps = courseCardMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(firstCallProps).toEqual(
      expect.objectContaining({
        course: sampleCourse,
        onDateChange: expect.any(Function),
        initialSelectedDate: expect.any(Date),
      }),
    );
  });

  it("changes week anchor when a date outside the current week is selected", () => {
    const onWeekAnchorChange = vi.fn();

    render(
      <CourseWeekView
        {...baseProps}
        onWeekAnchorChange={onWeekAnchorChange}
        rows={[{ course: sampleCourse, occurrences: [{ dateIso: "2099-06-08", kind: "scheduled" }] }]}
      />,
    );

    const props = courseCardMock.mock.calls[0]?.[0] as { onDateChange?: (d: Date) => void };
    props.onDateChange?.(new Date(2099, 5, 22));
    expect(onWeekAnchorChange).toHaveBeenCalled();
  });

  it("shows empty state when no courses in week", () => {
    render(<CourseWeekView {...baseProps} rows={[]} />);
    expect(screen.getByText("In dieser Kalenderwoche sind keine Termine sichtbar.")).toBeInTheDocument();
  });

  it("shows hint when past courses are hidden outside grace", () => {
    render(
      <CourseWeekView
        {...baseProps}
        hiddenPastCourseCount={2}
        rows={[{ course: sampleCourse, occurrences: [{ dateIso: "2099-06-08", kind: "scheduled" }] }]}
      />,
    );
    expect(screen.getByText(/2 weitere Kurse/i)).toBeInTheDocument();
  });
});
