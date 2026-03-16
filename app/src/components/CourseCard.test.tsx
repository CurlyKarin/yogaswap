import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import CourseCard from "./CourseCard";
import type { Course, CourseDateOverride, Swap, User } from "shared/types";

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

const baseUser: User = {
  nickname: "alice",
  email: "",
  role: "participant",
};

const baseOverride: CourseDateOverride = {
  courseId: 1,
  date: "2099-06-16",
  participants: ["alice"],
  swapped: [],
  waitlist: [],
};

const baseSwap: Swap = {
  user: "alice",
  fromCourseId: 1,
  fromDate: "2099-06-16",
  toCourseId: 2,
  toDate: "2099-06-17",
  status: "pending",
};

function renderCourseCard(overrides: Partial<React.ComponentProps<typeof CourseCard>> = {}) {
  const now = new Date("2099-06-10T10:00:00Z");
  const dates = [new Date("2099-06-16T10:00:00Z")];

  const props: React.ComponentProps<typeof CourseCard> = {
    course: baseCourse,
    allCourses: [baseCourse],
    currentUser: baseUser,
    dates,
    overrides: [baseOverride],
    swaps: [],
    onToggleAbsence: vi.fn(),
    confirmSwap: vi.fn(),
    requestSwap: vi.fn(),
    cancelSwap: vi.fn(),
    ...overrides,
  };

  // Fix system time for deterministic date rendering
  vi.setSystemTime(now);
  const result = render(<CourseCard {...props} />);
  return { ...result, props };
}

describe("CourseCard", () => {
  it("zeigt Hinweis, wenn keine zukünftigen Termine vorhanden sind", () => {
    const courseWithoutFutureDates: Course = {
      ...baseCourse,
      dates: ["2000-01-01"],
    };

    renderCourseCard({
      course: courseWithoutFutureDates,
      dates: [],
      overrides: [],
    });

    expect(
      screen.getByText(/Zur Zeit sind keine zukünftigen Termine für diesen Kurs geplant\./i),
    ).toBeInTheDocument();
    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("ruft onToggleAbsence auf, wenn 'Termin absagen' geklickt wird", () => {
    const onToggleAbsence = vi.fn();

    const { props } = renderCourseCard({ onToggleAbsence });

    const button = screen.getByRole("button", { name: /Termin absagen/i });
    fireEvent.click(button);

    expect(onToggleAbsence).toHaveBeenCalledTimes(1);
    const [courseArg, dateIsoArg, userNameArg] = onToggleAbsence.mock.calls[0];
    expect(courseArg).toEqual(props.course);
    expect(userNameArg).toBe("alice");
    expect(typeof dateIsoArg).toBe("string");
  });

  it("ruft cancelSwap auf, wenn 'Tauschanfragen abbrechen' geklickt wird", () => {
    const cancelSwap = vi.fn();
    const swaps: Swap[] = [baseSwap];

    renderCourseCard({ swaps, cancelSwap });

    const button = screen.getByRole("button", { name: /Tauschanfragen abbrechen/i });
    fireEvent.click(button);

    expect(cancelSwap).toHaveBeenCalledTimes(1);
    const [swapArg, clickedCourseId] = cancelSwap.mock.calls[0];
    expect(swapArg).toEqual(baseSwap);
    expect(clickedCourseId).toBe(1);
  });

  it("zeigt Status-Text für eine pending Tauschanfrage an", () => {
    const swaps: Swap[] = [
      {
        ...baseSwap,
        status: "pending",
      },
    ];

    const targetCourse: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Advanced",
    };

    renderCourseCard({
      swaps,
      allCourses: [baseCourse, targetCourse],
    });

    expect(
      screen.getByText(/Tauschanfrage für .*Yoga Advanced/i),
    ).toBeInTheDocument();
  });

  it("öffnet das Swap-Modal und ruft confirmSwap bzw. requestSwap korrekt auf", () => {
    const confirmSwap = vi.fn();
    const requestSwap = vi.fn();

    const alternativeCourse: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Abend",
      dates: ["2099-06-20"],
      participants: [],
    };

    const overrideWithWaitlist: CourseDateOverride = {
      courseId: 2,
      date: "2099-06-21",
      participants: ["bob"],
      swapped: [],
      waitlist: [],
    };

    renderCourseCard({
      confirmSwap,
      requestSwap,
      allCourses: [baseCourse, alternativeCourse],
      overrides: [baseOverride, overrideWithWaitlist],
    });

    // Swap-Modal öffnen (es kann mehrere gleich benannte Buttons geben)
    const [swapButton] = screen.getAllByRole("button", { name: /Tauschen anfragen/i });
    fireEvent.click(swapButton);

    expect(screen.getByText(/Tauschanfrage starten/i)).toBeInTheDocument();

    // Es gibt in diesem Szenario keine passenden Ersatztermine
    expect(
      screen.getByText(/Keine passenden Ersatztermine verfügbar/i),
    ).toBeInTheDocument();

    // Button ist deaktiviert und bleibt es auch, da keine Auswahl möglich ist
    const confirmButton = screen.getByRole("button", { name: /Bestätigen/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(confirmButton);
    expect(confirmSwap).not.toHaveBeenCalled();
    expect(requestSwap).not.toHaveBeenCalled();
  });
});

