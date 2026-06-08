import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { afterEach } from "vitest";
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
  afterEach(() => {
    cleanup();
  });

  it("rendert Kurskarte als article mit Kurs-Kontext im Namen", () => {
    renderCourseCard();

    const article = screen.getByRole("article", { name: /kurs:\s*yoga basic/i });
    expect(article).toHaveClass("course-card");
    const heading = screen.getByRole("heading", { name: /kurs:\s*yoga basic/i, level: 3 });
    expect(heading).toHaveTextContent("Yoga Basic");
    expect(article).toHaveAttribute("aria-labelledby", heading.id);
    expect(article).toHaveAttribute("aria-describedby");
    const scheduleDescId = article.getAttribute("aria-describedby");
    const schedule = document.getElementById(scheduleDescId!);
    expect(schedule).toHaveTextContent(/monday · 10:00/i);
    expect(schedule).toHaveAttribute("aria-label", "Montag · 10:00");
  });

  it("verknüpft Terminauswahl mit kursbezogenem Label", () => {
    renderCourseCard();

    const select = screen.getByRole("combobox", { name: /termin für yoga basic/i });
    expect(screen.getByLabelText("Termin für Yoga Basic")).toBe(select);
  });

  it("markiert eigene kurzfristige Absage mit chip-self und short-notice", () => {
    const overrideSn: CourseDateOverride = {
      ...baseOverride,
      participants: ["alice"],
      shortNoticeCancellations: ["alice"],
    };

    const { container } = renderCourseCard({ overrides: [overrideSn] });

    const selfSn = container.querySelector(".chip.chip-self.short-notice");
    expect(selfSn).toHaveTextContent("alice");
    expect(selfSn?.getAttribute("title")).toMatch(/Du — kurzfristig abgesagt/i);
  });

  it("zeigt getauschte und kurzfristig abgesagte andere Teilnehmer dezenter als den eigenen Chip", () => {
    const overrideMixed: CourseDateOverride = {
      ...baseOverride,
      participants: ["alice", "bob", "carol"],
      swapped: ["bob"],
      shortNoticeCancellations: ["carol"],
    };

    const { container } = renderCourseCard({ overrides: [overrideMixed] });

    expect(container.querySelector(".chip.chip-self")).toHaveTextContent("alice");
    expect(screen.getByText("bob").closest(".chip")).toHaveClass("swapped");
    expect(screen.getByText("bob").closest(".chip")).not.toHaveClass("chip-self");
    expect(screen.getByText("carol").closest(".chip")).toHaveClass("short-notice");
    expect(screen.getByText("carol").closest(".chip")).not.toHaveClass("chip-self");
  });

  it("hebt den eigenen Chip in Teilnehmer- und Warteliste grün hervor", () => {
    const overrideWithWaitlist: CourseDateOverride = {
      ...baseOverride,
      participants: ["alice", "bob"],
      waitlist: ["alice"],
    };

    const { container } = renderCourseCard({ overrides: [overrideWithWaitlist] });

    const selfChips = container.querySelectorAll(".chip.chip-self");
    expect(selfChips).toHaveLength(2);
    expect(selfChips[0]).toHaveTextContent("alice");
    expect(selfChips[0]).toHaveAttribute("title", "Du");
    expect(container.querySelector(".chip.wait.chip-self")).toHaveAttribute("title", "Du (Warteliste)");
    expect(screen.getByText("bob").closest(".chip")).not.toHaveClass("chip-self");
  });

  it("zeigt Badge und Hinweis bei gesperrter Teilnehmer-Ansicht für inaktiven Kurs", () => {
    const inactiveCourse: Course = {
      ...baseCourse,
      status: "inactive",
      seriesEndDate: "2099-01-01",
      dates: [],
    };

    renderCourseCard({
      course: inactiveCourse,
      dates: [],
      overrides: [],
      participantActionsLocked: true,
    });

    expect(screen.getByText("Automatisch inaktiv")).toBeInTheDocument();
    expect(screen.getByText(/automatisch beendet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Termin absagen/i })).not.toBeInTheDocument();
  });

  it("kennzeichnet vom Studio abgesagte Termine in der Wochenansicht", () => {
    const weekCourse: Course = {
      ...baseCourse,
      dates: ["2099-06-16", "2099-06-18"],
      excludedDates: ["2099-06-16"],
    };

    renderCourseCard({
      course: weekCourse,
      dates: [new Date("2099-06-16T10:00:00Z"), new Date("2099-06-18T10:00:00Z")],
      includePastTermsInSelect: true,
      initialSelectedDate: new Date("2099-06-16T10:00:00Z"),
    });

    expect(screen.getByTitle(/Termin entfällt/i)).toBeInTheDocument();
    expect(screen.getByText(/vom Studio abgesagt/i)).toBeInTheDocument();
    expect(screen.getByText("entfällt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Termin absagen/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /6\/16\/2099 \(entfällt\)/i })).toBeInTheDocument();
  });

  it("deaktiviert Datumsauswahl, wenn keine zukünftigen Termine vorhanden sind", () => {
    const courseWithoutFutureDates: Course = {
      ...baseCourse,
      dates: ["2000-01-01"],
    };

    renderCourseCard({
      course: courseWithoutFutureDates,
      dates: [],
      overrides: [],
    });

    const select = screen.getByRole("combobox", { name: /termin für yoga basic/i });
    expect(select).toBeDisabled();
    const hintId = select.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)).toHaveTextContent(
      /keine anstehenden termine für yoga basic/i,
    );
  });

  it("benennt Kernaktionen mit Kurskontext für Screenreader", () => {
    renderCourseCard();

    expect(
      screen.getByRole("button", { name: /termin absagen für yoga basic/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tauschen anfragen für yoga basic/i }),
    ).toBeInTheDocument();
  });

  it("ruft onToggleAbsence auf, wenn 'Termin absagen' geklickt wird", () => {
    const onToggleAbsence = vi.fn();

    const { props } = renderCourseCard({ onToggleAbsence });

    const button = screen.getByRole("button", { name: /termin absagen für yoga basic/i });
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

    const button = screen.getByRole("button", { name: /tauschanfragen abbrechen für yoga basic/i });
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

  it("zeigt im Swap-Modal den Titel „Anderen Termin wählen“ nach eigener Absage", () => {
    const cancelledOverride: CourseDateOverride = {
      courseId: 1,
      date: "2099-06-16",
      participants: [],
      swapped: [],
      waitlist: [],
    };
    const alternativeCourse: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Abend",
      dates: ["2099-06-20"],
      participants: [],
    };

    renderCourseCard({
      allCourses: [baseCourse, alternativeCourse],
      overrides: [cancelledOverride],
    });

    fireEvent.click(screen.getByRole("button", { name: /anderen termin wählen für yoga basic/i }));
    expect(screen.getByRole("heading", { name: /Anderen Termin wählen/i })).toBeInTheDocument();
    expect(screen.queryByText(/folgt/i)).not.toBeInTheDocument();
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
    const [swapButton] = screen.getAllByRole("button", { name: /tauschen anfragen für yoga basic/i });
    fireEvent.click(swapButton);

    expect(screen.getByText(/Tauschanfrage starten/i)).toBeInTheDocument();

    // Es gibt mindestens einen freien Ersatztermin
    expect(screen.getByText(/Es stehen 1 freie Termin\(e\) zur Auswahl\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hilfe: Warteliste im Tauschdialog/i })).toBeInTheDocument();

    const freeSlotsHint = screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i });
    fireEvent.click(freeSlotsHint);
    expect(screen.getByRole("note")).toHaveTextContent(/gleichzeitig von deinem aktuellen Termin ab/i);

    // Button ist deaktiviert und bleibt es auch, da keine Auswahl möglich ist
    const confirmButton = screen.getByRole("button", { name: /Bestätigen/i });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(confirmButton);
    expect(confirmSwap).not.toHaveBeenCalled();
    expect(requestSwap).not.toHaveBeenCalled();
  });

  it("blendet bereits angefragte Zielkurse in der Auswahl aus", () => {
    const confirmSwap = vi.fn();
    const requestSwap = vi.fn();
    const existingPendingToCourse2: Swap = {
      user: "alice",
      fromCourseId: 1,
      fromDate: "2099-06-16",
      toCourseId: 2,
      toDate: "2099-06-20",
      status: "pending",
    };
    const course2: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Abend",
      participants: [],
      dates: ["2099-06-20"],
      status: "active",
    };
    const course3: Course = {
      ...baseCourse,
      id: 3,
      name: "Yoga Morgen",
      participants: [],
      dates: ["2099-06-21"],
      status: "active",
    };

    renderCourseCard({
      confirmSwap,
      requestSwap,
      swaps: [existingPendingToCourse2],
      allCourses: [baseCourse, course2, course3],
      overrides: [baseOverride],
    });

    const swapButtons = screen.getAllByRole("button", {
      name: /weitere tauschanfrage \(1 offene anfragen\) für yoga basic/i,
    });
    fireEvent.click(swapButtons[swapButtons.length - 1]);

    expect(screen.getByText(/Tauschanfrage starten/i)).toBeInTheDocument();
    expect(document.querySelector('option[value^="2099-06-21T"]')).toBeInTheDocument();
    expect(document.querySelector('option[value^="2099-06-20T"]')).not.toBeInTheDocument();
  });
});

