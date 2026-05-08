import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Course } from "shared/types";
import CourseDatesDialog from "./CourseDatesDialog";
import { cancelCourseDate, updateCourse } from "../api/courses";

vi.mock("../api/courses", () => ({
  updateCourse: vi.fn(),
  cancelCourseDate: vi.fn(),
}));

const mockedUpdateCourse = updateCourse as unknown as ReturnType<typeof vi.fn>;
const mockedCancelCourseDate = cancelCourseDate as unknown as ReturnType<typeof vi.fn>;

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
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rendert nichts ohne Kurs", () => {
    render(
      <CourseDatesDialog
        course={null}
        overrides={[]}
        swaps={[]}
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
        overrides={[]}
        swaps={[]}
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
        overrides={[]}
        swaps={[]}
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
        overrides={[]}
        swaps={[]}
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
        overrides={[]}
        swaps={[]}
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

  it("sperrt excludedDates im rolling Schutzfenster", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({
          planningMode: "rolling_continuous",
          visibilityHorizonWeeks: 10,
        })}
        overrides={[]}
        swaps={[]}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    fireEvent.click(dialogQueries.getByRole("button", { name: /kalender für ausnahmetermin öffnen/i }));

    const lockedCell = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-01-06/i });
    expect(lockedCell).toBeDisabled();
    expect(lockedCell).toHaveAttribute("title", expect.stringMatching(/nur absage möglich/i));

    fireEvent.click(dialogQueries.getByRole("button", { name: /nächster monat/i }));
    const allowedCell = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-02-10/i });
    expect(allowedCell).not.toBeDisabled();
  });

  it("erlaubt rolling excludedDates auch außerhalb des Sichtfensters", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({
          planningMode: "rolling_continuous",
          visibilityHorizonWeeks: 2,
        })}
        overrides={[]}
        swaps={[]}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    fireEvent.click(dialogQueries.getByRole("button", { name: /kalender für ausnahmetermin öffnen/i }));
    fireEvent.click(dialogQueries.getByRole("button", { name: /nächster monat/i }));
    fireEvent.click(dialogQueries.getByRole("button", { name: /nächster monat/i }));

    // Liegt deutlich außerhalb des 2-Wochen-Sichtfensters, muss aber auswählbar bleiben.
    const farFutureCell = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-03-03/i });
    expect(farFutureCell).not.toBeDisabled();
  });

  it("zeigt bei aktivem Kursblock nur den Absage-Flow", async () => {
    mockedCancelCourseDate.mockResolvedValue({ success: true, courseId: 1, date: "2026-01-06" });
    const onClose = vi.fn();
    render(
      <CourseDatesDialog
        course={makeCourse({ status: "active", participants: ["luna", "maya"] })}
        overrides={[
          {
            courseId: 1,
            date: "2026-01-06",
            participants: ["luna"],
            swapped: ["nora"],
            waitlist: ["maya"],
          },
        ]}
        swaps={[
          {
            user: "maya",
            fromCourseId: 1,
            fromDate: "2026-01-06",
            toCourseId: 2,
            toDate: "2026-01-09",
            status: "pending",
          },
        ]}
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
    expect(dialogQueries.queryByRole("button", { name: /kalender für ausnahmetermin öffnen/i })).not.toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /absage überprüfen/i })).toBeDisabled();
    expect(dialogQueries.getByRole("button", { name: /^abbrechen$/i })).toBeInTheDocument();
    expect(dialogQueries.getByText(/ausgewählter termin:/i)).toBeInTheDocument();
    expect(dialogQueries.getByText(/keiner ausgewählt/i)).toBeInTheDocument();

    expect(dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i })).toBeInTheDocument();
    await user.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));
    expect(dialogQueries.queryByRole("button", { name: /absage datum 2026-01-06/i })).not.toBeInTheDocument();
    await user.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));
    await user.click(dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i }));
    expect(dialogQueries.queryByRole("button", { name: /absage datum 2026-01-06/i })).not.toBeInTheDocument();
    expect(dialogQueries.getByText(formatDateForDisplay("2026-01-06"))).toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /absage überprüfen/i })).toBeEnabled();
    await user.click(dialogQueries.getByRole("button", { name: /absage überprüfen/i }));
    expect(dialogQueries.getByRole("group", { name: /auswirkungsprüfung terminabsage/i })).toBeInTheDocument();
    await user.click(dialogQueries.getByRole("button", { name: /termin jetzt absagen/i }));

    await waitFor(() => {
      expect(mockedCancelCourseDate).toHaveBeenCalledWith(
        1,
        "2026-01-06",
        expect.objectContaining({
          rollbackSuccessfulSwapsFromCancelledParticipants: false,
          rollbackPendingWaitlistSwapsFromOriginDate: true,
        }),
      );
    });

    await user.click(dialogQueries.getByRole("button", { name: /^abbrechen$/i }));
    expect(onClose).toHaveBeenCalled();
    expect(mockedUpdateCourse).not.toHaveBeenCalled();
  });

  it("erlaubt bei aktivem rolling Kurs weiterhin ExcludedDates außerhalb Schutzfenster", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({
          status: "active",
          planningMode: "rolling_continuous",
          visibilityHorizonWeeks: 10,
        })}
        overrides={[]}
        swaps={[]}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);

    // Save action remains available for rolling active courses.
    expect(dialogQueries.getByRole("button", { name: /termine übernehmen/i })).toBeInTheDocument();
    expect(dialogQueries.queryByRole("button", { name: /^schließen$/i })).not.toBeInTheDocument();

    fireEvent.click(dialogQueries.getByRole("button", { name: /kalender für ausnahmetermin öffnen/i }));
    fireEvent.click(dialogQueries.getByRole("button", { name: /nächster monat/i }));
    const allowedCell = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-02-10/i });
    expect(allowedCell).not.toBeDisabled();
  });

  it("zeigt Hinweis statt Fehler bei teilweisem Erfolg mit operationWarnings", async () => {
    mockedCancelCourseDate.mockResolvedValue({
      success: true,
      courseId: 1,
      date: "2026-01-06",
      operationWarnings: ["participant_lookup_failed"],
    });
    const onClose = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseDatesDialog
        course={makeCourse({ status: "active", participants: ["luna"] })}
        overrides={[
          {
            courseId: 1,
            date: "2026-01-06",
            participants: ["luna"],
            swapped: [],
            waitlist: [],
          },
        ]}
        swaps={[]}
        canManageCourses
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    await user.click(dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i }));
    await user.click(dialogQueries.getByRole("button", { name: /absage überprüfen/i }));
    await user.click(dialogQueries.getByRole("button", { name: /termin jetzt absagen/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(
        screen.getByText(/termin wurde abgesagt, aber es gab hinweise bei nebenoperationen/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /einzelne teilnehmerprofile konnten fuer den mailversand nicht geladen werden|some participant profiles could not be loaded for mail delivery/i,
        ),
      ).toBeInTheDocument();
    });
  });
});
