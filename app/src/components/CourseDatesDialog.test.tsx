import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Course } from "shared/types";
import CourseDatesDialog from "./CourseDatesDialog";
import { updateCourse } from "../api/courses";

vi.mock("../api/courses", () => ({
  updateCourse: vi.fn(),
}));

const mockedUpdateCourse = updateCourse as unknown as ReturnType<typeof vi.fn>;

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
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
    ...overrides,
  };
}

function formatDateForDisplay(isoDate: string): string {
  return new Intl.DateTimeFormat(navigator.language, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate}T12:00:00.000Z`),
  );
}

describe("CourseDatesDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rendert nichts ohne Kurs", () => {
    render(
      <CourseDatesDialog
        course={null}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("Kurstermine bearbeiten")).not.toBeInTheDocument();
  });

  it("schließt mit Escape", async () => {
    const onClose = vi.fn();
    render(
      <CourseDatesDialog
        course={makeCourse()}
        canManageCourses
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("setzt Zeitraum über Kalender und speichert Payload", async () => {
    mockedUpdateCourse.mockResolvedValue({});
    const onClose = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseDatesDialog
        course={makeCourse()}
        canManageCourses
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    const rangeCalendarButtons = dialogQueries.getAllByRole("button", { name: /kalender für zeitraum öffnen/i });
    await user.click(rangeCalendarButtons[rangeCalendarButtons.length - 1]);
    await user.click(dialogQueries.getByRole("button", { name: /datum 2026-01-26/i }));
    await user.click(dialogQueries.getByRole("button", { name: /datum 2026-01-05/i }));

    await waitFor(() => {
      const startValues = screen.getAllByLabelText("Startdatum Wert");
      const endValues = screen.getAllByLabelText("Enddatum Wert");
      expect(startValues[startValues.length - 1]).toHaveTextContent(formatDateForDisplay("2026-01-05"));
      expect(endValues[endValues.length - 1]).toHaveTextContent(formatDateForDisplay("2026-01-26"));
    });

    await user.click(dialogQueries.getByRole("button", { name: /termine übernehmen/i }));

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          planningMode: "bounded_series",
          visibilityMode: "fixed_window",
          seriesStartDate: "2026-01-05",
          seriesEndDate: "2026-01-26",
          excludedDates: [],
        }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("erlaubt excludedDates nur für Serientermine", async () => {
    mockedUpdateCourse.mockResolvedValue({});
    render(
      <CourseDatesDialog
        course={makeCourse()}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    const excludedCalendarButtons = dialogQueries.getAllByRole("button", { name: /kalender für ausnahmetermin öffnen/i });
    await user.click(excludedCalendarButtons[excludedCalendarButtons.length - 1]);

    // Montag bei weekday=Tue darf nicht auswählbar sein.
    expect(dialogQueries.getByRole("button", { name: /ausnahme datum 2026-01-12/i })).toBeDisabled();

    const tuesdayCell = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-01-13/i });
    expect(tuesdayCell).not.toBeDisabled();
    await user.click(tuesdayCell);

    expect(screen.getByText(formatDateForDisplay("2026-01-13"))).toBeInTheDocument();
  });

  it("speichert durchlaufende Kurse mit rolling horizon", async () => {
    mockedUpdateCourse.mockResolvedValue({});
    const onClose = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseDatesDialog
        course={makeCourse({
          planningMode: "rolling_continuous",
          visibilityHorizonWeeks: 10,
        })}
        canManageCourses
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    expect(dialogQueries.getByText(/durchlaufend \(rollend\)/i)).toBeInTheDocument();

    const horizonInput = dialogQueries.getByLabelText(/sichtfenster wochen/i);
    fireEvent.change(horizonInput, { target: { value: "12" } });

    await user.click(dialogQueries.getByRole("button", { name: /termine übernehmen/i }));

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          planningMode: "rolling_continuous",
          visibilityMode: "rolling_horizon",
          visibilityHorizonWeeks: 12,
          excludedDates: [],
          includedDates: [],
        }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("ist bei aktivem Kurs read-only mit Kalenderansicht", async () => {
    mockedUpdateCourse.mockResolvedValue({});
    const onClose = vi.fn();
    render(
      <CourseDatesDialog
        course={makeCourse({ status: "active" })}
        canManageCourses
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);

    expect(dialogQueries.getByText(/kurs ist aktiv\. terminplanung ist gesperrt/i)).toBeInTheDocument();
    expect(dialogQueries.queryByRole("button", { name: /termine übernehmen/i })).not.toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /^schließen$/i })).toBeInTheDocument();

    await user.click(dialogQueries.getByRole("button", { name: /kalender für zeitraum öffnen/i }));
    const rangeDateButton = dialogQueries.getByRole("button", { name: /datum 2026-01-06/i });
    expect(rangeDateButton).toBeDisabled();

    await user.click(dialogQueries.getByRole("button", { name: /kalender für ausnahmetermin öffnen/i }));
    const excludedDateButton = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-01-13/i });
    expect(excludedDateButton).toBeDisabled();

    await user.click(dialogQueries.getByRole("button", { name: /^schließen$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockedUpdateCourse).not.toHaveBeenCalled();
  });
});
