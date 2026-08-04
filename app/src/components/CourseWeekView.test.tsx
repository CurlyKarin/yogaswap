import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CourseWeekView from "./CourseWeekView";
import type { Course, User } from "shared/types";

const courseCardMock = vi.fn();

vi.mock("./CourseCard", () => ({
  default: (props: unknown) => courseCardMock(props),
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
const noopToggleAbsence = async () => true;

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
  onToggleAbsence: noopToggleAbsence,
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
    const emptyState = screen.getByText("In dieser Kalenderwoche sind keine Termine sichtbar.");
    expect(emptyState).toBeInTheDocument();
    expect(emptyState.closest('[role="status"]')).toBeTruthy();
  });

  it("exposes loading state as status region", () => {
    render(<CourseWeekView {...baseProps} loading rows={[]} />);
    const loadingStatus = screen.getByRole("status");
    expect(loadingStatus).toHaveTextContent(/kurse werden geladen/i);
    expect(loadingStatus).toHaveAttribute("aria-live", "polite");
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

  it("scrolls and highlights the focused course from Heute", () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const focusCourse: Course = {
      ...sampleCourse,
      id: 42,
      time: "10:00",
      dates: ["2099-06-16"],
    };

    courseCardMock.mockImplementation((props: { highlighted?: boolean; course: Course }) => (
      <article
        className={`course-card${props.highlighted ? " course-card--today-focus" : ""}`}
        tabIndex={-1}
        data-testid={`course-card-${props.course.id}`}
      >
        CourseCard
      </article>
    ));

    const { rerender } = render(
      <CourseWeekView
        {...baseProps}
        weekAnchor={new Date(2099, 5, 15)}
        rows={[{ course: focusCourse, occurrences: [{ dateIso: "2099-06-16", kind: "scheduled" }] }]}
      />,
    );

    const hostCard = screen.getByTestId("course-card-42");
    hostCard.focus = focus;

    rerender(
      <CourseWeekView
        {...baseProps}
        weekAnchor={new Date(2099, 5, 15)}
        rows={[{ course: focusCourse, occurrences: [{ dateIso: "2099-06-16", kind: "scheduled" }] }]}
        todayFocusRequest={{ courseId: 42, dateIso: "2099-06-16", nonce: 1 }}
      />,
    );

    expect(scrollIntoView).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(hostCard).toHaveClass("course-card--today-focus");

    const props = courseCardMock.mock.calls.at(-1)?.[0] as {
      initialSelectedDate?: Date;
      highlighted?: boolean;
    };
    expect(props.highlighted).toBe(true);
    expect(props.initialSelectedDate?.getFullYear()).toBe(2099);
    expect(props.initialSelectedDate?.getMonth()).toBe(5);
    expect(props.initialSelectedDate?.getDate()).toBe(16);
    expect(props.initialSelectedDate?.getHours()).toBe(10);
  });
});
