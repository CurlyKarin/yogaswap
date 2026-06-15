import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach } from "vitest";
import CourseCard from "./CourseCard";
import type { Course, CourseDateOverride, Swap, User } from "shared/types";
import { swapOptionKey } from "../lib/dates";

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

const selectedTermActionName = (action: string) =>
  new RegExp(`${action}, yoga basic, 16\\.06\\.2099`, "i");

function openSwapModal() {
  const [swapButton] = screen.getAllByRole("button", {
    name: selectedTermActionName("Tauschen anfragen"),
  });
  fireEvent.click(swapButton);
}

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
    onToggleAbsence: vi.fn().mockResolvedValue(true),
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
    const visibleLabel = screen.getByText("Termine");
    expect(visibleLabel.tagName).toBe("LABEL");
    expect(visibleLabel).toHaveAttribute("for", select.id);
    expect(visibleLabel).toHaveAttribute("aria-label", "Termin für Yoga Basic");
  });

  it("verknüpft Teilnehmer-Chips mit beschrifteter Liste", () => {
    renderCourseCard({
      overrides: [
        {
          ...baseOverride,
          participants: ["alice", "bob"],
        },
      ],
    });

    expect(screen.getByRole("list", { name: /Teilnehmer/i })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /Warteliste/i })).toBeInTheDocument();
    expect(screen.getByText("bob")).toHaveAttribute("aria-label", "bob, regulär eingetragen");
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
    expect(selfSn).toHaveAttribute(
      "aria-label",
      "alice, du, kurzfristig abgesagt, Platz bleibt belegt",
    );
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
    expect(screen.getByText("bob").closest(".chip")).toHaveAttribute("aria-label", "bob, getauscht");
    expect(screen.getByText("carol").closest(".chip")).toHaveAttribute(
      "aria-label",
      "carol, kurzfristig abgesagt, Platz bleibt belegt",
    );
    expect(container.querySelector(".chip.chip-self")).toHaveAttribute("aria-label", "alice, du");
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
    expect(container.querySelector(".chip.wait.chip-self")).toHaveAttribute(
      "aria-label",
      "alice, du auf der Warteliste",
    );
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
    expect(screen.getByLabelText("Kursstatus: Automatisch inaktiv")).toBeInTheDocument();
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

    expect(screen.getByRole("img", { name: /Termin entfällt \(vom Studio abgesagt\)/i })).toBeInTheDocument();
    expect(screen.getByText(/vom Studio abgesagt/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Kapazität entfällt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Termin absagen/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /6\/16\/2099 \(entfällt\)/i })).toBeInTheDocument();
  });

  it("zeigt keinen Phantom-Termin bei leerem dates trotz seriesEndDate", () => {
    const phantomCourse: Course = {
      ...baseCourse,
      weekday: "Tue",
      seriesStartDate: "2026-06-07",
      seriesEndDate: "2026-06-07",
      dates: [],
      status: "active",
      planningMode: "bounded_series",
    };

    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
    renderCourseCard({
      course: phantomCourse,
      dates: [],
      overrides: [],
    });

    const select = screen.getByRole("combobox", { name: /termin für yoga basic/i });
    expect(select).toBeDisabled();
    expect(screen.queryByText(/letzter termin/i)).not.toBeInTheDocument();
    const hintId = select.getAttribute("aria-describedby");
    expect(document.getElementById(hintId!)).toHaveTextContent(
      /kein termin im kurszeitraum für yoga basic/i,
    );
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

  it("benennt Kernaktionen mit Termin- und Kurskontext für Screenreader", () => {
    renderCourseCard();

    expect(
      screen.getByRole("button", { name: selectedTermActionName("Termin absagen") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: selectedTermActionName("Tauschen anfragen") }),
    ).toBeInTheDocument();
  });

  it("enthält Tausch-Status im aria-label der Aktion", () => {
    const targetCourse: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Advanced",
    };

    renderCourseCard({
      swaps: [baseSwap],
      allCourses: [baseCourse, targetCourse],
    });

    const cancelButton = screen.getByRole("button", {
      name: selectedTermActionName("Tauschanfragen abbrechen"),
    });
    expect(cancelButton.getAttribute("aria-label")).toMatch(
      /Tauschanfrage für 17\.06\.2099 · Yoga Advanced/i,
    );
  });

  it("ruft onToggleAbsence auf, wenn 'Termin absagen' geklickt wird", async () => {
    const onToggleAbsence = vi.fn().mockResolvedValue(true);

    const { props } = renderCourseCard({ onToggleAbsence });

    const button = screen.getByRole("button", { name: selectedTermActionName("Termin absagen") });
    fireEvent.click(button);

    await waitFor(() => {
      expect(onToggleAbsence).toHaveBeenCalledTimes(1);
    });
    const [courseArg, dateIsoArg, userNameArg] = onToggleAbsence.mock.calls[0];
    expect(courseArg).toEqual(props.course);
    expect(userNameArg).toBe("alice");
    expect(typeof dateIsoArg).toBe("string");
  });

  it("meldet erfolgreiche Terminabsage über aria-live", async () => {
    const onToggleAbsence = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 0)),
    );

    renderCourseCard({ onToggleAbsence });

    fireEvent.click(screen.getByRole("button", { name: selectedTermActionName("Termin absagen") }));

    expect(screen.getByText(/speichere absage/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/termin abgesagt für yoga basic, 16\.06\.2099/i)).toBeInTheDocument();
    });
  });

  it("meldet Absage-Rücknahme über aria-live", async () => {
    const cancelledOverride: CourseDateOverride = {
      ...baseOverride,
      participants: [],
    };

    renderCourseCard({
      overrides: [cancelledOverride],
    });

    fireEvent.click(
      screen.getByRole("button", { name: selectedTermActionName("Absage zurücknehmen") }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/absage zurückgenommen für yoga basic, 16\.06\.2099/i),
      ).toBeInTheDocument();
    });
  });

  it("blendet Tausch abbrechen aus, wenn Ursprung und Ziel vergangen sind", () => {
    const pastOrigin = "2020-01-06";
    const pastTarget = "2020-01-13";
    const course: Course = {
      ...baseCourse,
      dates: [pastOrigin],
      participants: ["alice"],
    };
    const targetCourse: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Advanced",
      dates: [pastTarget],
    };
    const swaps: Swap[] = [
      {
        ...baseSwap,
        fromDate: pastOrigin,
        toDate: pastTarget,
        toCourseId: 2,
        status: "active",
      },
    ];

    vi.setSystemTime(new Date(2026, 0, 1, 12, 0));
    renderCourseCard({
      course,
      allCourses: [course, targetCourse],
      dates: [new Date(`${pastOrigin}T12:00:00.000Z`)],
      overrides: [
        {
          courseId: 1,
          date: pastOrigin,
          participants: [],
          swapped: ["alice"],
        },
      ],
      swaps,
      includePastTermsInSelect: true,
    });

    expect(screen.queryByRole("button", { name: /Tausch abbrechen/i })).not.toBeInTheDocument();
  });

  it("ruft cancelSwap auf, wenn 'Tauschanfragen abbrechen' geklickt wird", () => {
    const cancelSwap = vi.fn();
    const swaps: Swap[] = [baseSwap];

    renderCourseCard({ swaps, cancelSwap });

    const button = screen.getByRole("button", {
      name: selectedTermActionName("Tauschanfragen abbrechen"),
    });
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

    fireEvent.click(screen.getByRole("button", { name: selectedTermActionName("Anderen Termin wählen") }));
    expect(screen.getByRole("heading", { name: /Anderen Termin wählen/i })).toBeInTheDocument();
    expect(screen.queryByText(/folgt/i)).not.toBeInTheDocument();
  });

  it("öffnet das Swap-Modal aus der Kurskarte", () => {
    const alternativeCourse: Course = {
      ...baseCourse,
      id: 2,
      name: "Yoga Abend",
      dates: ["2099-06-20"],
      participants: [],
    };

    renderCourseCard({
      allCourses: [baseCourse, alternativeCourse],
    });

    openSwapModal();

    expect(
      screen.getByRole("dialog", { name: /Tauschanfrage starten, Yoga Basic, 16\.06\.2099/i }),
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
    const [swapButton] = screen.getAllByRole("button", {
      name: selectedTermActionName("Tauschen anfragen"),
    });
    fireEvent.click(swapButton);

    expect(screen.getByRole("dialog", { name: /Tauschanfrage starten, Yoga Basic, 16\.06\.2099/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tauschanfrage starten/i })).toBeInTheDocument();

    // Es gibt mindestens einen freien Ersatztermin
    expect(screen.getByText(/Es stehen 1 freie Termin\(e\) zur Auswahl\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hilfe: Warteliste im Tauschdialog/i })).toBeInTheDocument();

    const freeSlotsHint = screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i });
    fireEvent.click(freeSlotsHint);
    expect(screen.getByRole("region", { name: /Freie Tauschtermine/i })).toHaveTextContent(
      /gleichzeitig von deinem aktuellen Termin ab/i,
    );

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
      name: selectedTermActionName("Weitere Tauschanfrage"),
    });
    fireEvent.click(swapButtons[swapButtons.length - 1]);

    expect(screen.getByRole("dialog", { name: /Tauschanfrage starten, Yoga Basic, 16\.06\.2099/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tauschanfrage starten/i })).toBeInTheDocument();
    expect(document.querySelector(`option[value="${swapOptionKey(3, new Date(2099, 5, 21, 10, 0, 0))}"]`)).toBeInTheDocument();
    expect(document.querySelector(`option[value="${swapOptionKey(2, new Date(2099, 5, 20, 10, 0, 0))}"]`)).not.toBeInTheDocument();
  });
});

