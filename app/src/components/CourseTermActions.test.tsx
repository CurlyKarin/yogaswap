import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen, renderHook } from "@testing-library/react";
import React from "react";
import type { Course, CourseDateOverride, User } from "shared/types";
import CourseTermActions from "./CourseTermActions";
import { useCourseCardTermState } from "./useCourseCardTermState";

const baseUser: User = {
  nickname: "alice",
  email: "",
  role: "participant",
};

const baseCourse: Course = {
  tenantId: "default-tenant",
  id: 1,
  name: "Yoga Basic",
  weekday: "Monday",
  time: "10:00",
  capacity: 10,
  participants: ["alice"],
  dates: ["2099-06-16"],
};

const baseOverride: CourseDateOverride = {
  courseId: 1,
  date: "2099-06-16",
  participants: ["alice"],
  swapped: [],
  waitlist: [],
};

const futureDate = new Date("2099-06-16T10:00:00Z");

function renderCourseTermActions(
  overrides: {
    termStateOverrides?: Partial<Parameters<typeof useCourseCardTermState>[0]>;
    props?: Partial<React.ComponentProps<typeof CourseTermActions>>;
  } = {},
) {
  const { result } = renderHook(() =>
    useCourseCardTermState({
      course: baseCourse,
      allCourses: [baseCourse],
      currentUser: baseUser,
      dates: [futureDate],
      overrides: [baseOverride],
      swaps: [],
      ...overrides.termStateOverrides,
    }),
  );

  const props: React.ComponentProps<typeof CourseTermActions> = {
    course: baseCourse,
    allCourses: [baseCourse],
    overrides: [baseOverride],
    userName: baseUser.nickname,
    selectedDate: futureDate.toISOString(),
    includePastTermsInSelect: false,
    participantActionsLocked: false,
    hasNoUpcomingDates: false,
    termState: result.current,
    absenceSaving: false,
    absenceButtonRef: { current: null },
    showSwapModal: false,
    notEnrolledInTermHint: <div className="muted">Nicht in diesem Termin eingetragen</div>,
    onToggleAbsence: vi.fn(),
    onOpenSwapModal: vi.fn(),
    onCloseSwapModal: vi.fn(),
    onCancelSwap: vi.fn(),
    onConfirmSwap: vi.fn(),
    onRequestSwap: vi.fn(),
    ...overrides.props,
  };

  return render(<CourseTermActions {...props} />);
}

describe("CourseTermActions", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("zeigt Kernaktionen für eingetragene Teilnehmer", () => {
    vi.setSystemTime(new Date("2099-06-10T10:00:00Z"));
    renderCourseTermActions();

    expect(
      screen.getByRole("button", { name: /Termin absagen, Yoga Basic, 16\.06\.2099/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tauschen anfragen, Yoga Basic, 16\.06\.2099/i }),
    ).toBeInTheDocument();
  });

  it("zeigt Hinweis für vergangene Termine ohne Aktionen", () => {
    vi.setSystemTime(new Date("2099-06-20T10:00:00Z"));
    renderCourseTermActions({
      termStateOverrides: { includePastTermsInSelect: true },
    });

    expect(
      screen.getByText(/Vergangener Termin — keine Änderungen mehr möglich/i),
    ).toBeInTheDocument();
  });
});
