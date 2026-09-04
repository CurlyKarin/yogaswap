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

const rollingTenant10 = { rollingPlanningHorizonWeeks: 10 };
const rollingTenant2 = { rollingPlanningHorizonWeeks: 2 };

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

  it("beschriftet das Endedatum als Saisonende für Teilnahme und Tausch", () => {
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

    expect(
      screen.getAllByText(/letzte Tag für Teilnahme und Tausch \(Saisonende\)/i).length,
    ).toBeGreaterThan(0);
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
        "1",
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

  it("speichert durchlaufende Kurse ohne kursbezogenes Sichtfenster", async () => {
    mockedUpdateCourse.mockResolvedValue({});
    const onClose = vi.fn();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <CourseDatesDialog
        course={makeCourse({ planningMode: "rolling_continuous" })}
        overrides={[]}
        swaps={[]}
        tenantSettings={rollingTenant10}
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
    expect(dialogQueries.getByText(/10 wochen \(studio-einstellungen\)/i)).toBeInTheDocument();
    expect(dialogQueries.queryByLabelText(/sichtfenster wochen/i)).not.toBeInTheDocument();

    await user.click(dialogQueries.getByRole("button", { name: /termine übernehmen/i }));

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          planningMode: "rolling_continuous",
          visibilityMode: "rolling_horizon",
          excludedDates: [],
          includedDates: [],
        }),
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSaved).toHaveBeenCalledTimes(1);
    });
  });

  it("erlaubt im Rollkurs-Entwurf Ausschluss auch innerhalb des Teilnehmer-Sichtfensters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({ planningMode: "rolling_continuous", status: "draft" })}
        overrides={[]}
        swaps={[]}
        tenantSettings={rollingTenant2}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialogQueries = within(dialogs[dialogs.length - 1]);
    fireEvent.click(dialogQueries.getByRole("button", { name: /kalender für ausnahmetermin öffnen/i }));

    const nearCell = dialogQueries.getByRole("button", { name: /ausnahme datum 2026-01-06/i });
    expect(nearCell).not.toBeDisabled();

    fireEvent.click(nearCell);
    expect(screen.getByText(formatDateForDisplay("2026-01-06"))).toBeInTheDocument();
  });

  it("zeigt für inaktive Rollkurse keinen Ausschluss-Kalender", () => {
    render(
      <CourseDatesDialog
        course={makeCourse({ planningMode: "rolling_continuous", status: "inactive" })}
        overrides={[]}
        swaps={[]}
        tenantSettings={rollingTenant10}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialogQueries = within(dialogs[dialogs.length - 1]);
    expect(dialogQueries.queryByRole("button", { name: /kalender für ausnahmetermin öffnen/i })).not.toBeInTheDocument();
  });

  it("zeigt bei aktivem Kursblock Zeitraum-Korrektur und eingeklappten Absage-Kalender", async () => {
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
            participantId: "maya",
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

    expect(dialogQueries.getByText(/zeitraum \(saisonstart und -ende\) kann noch angepasst werden/i)).toBeInTheDocument();
    expect(dialogQueries.getByLabelText("Startdatum Wert")).toBeInTheDocument();
    expect(dialogQueries.getByLabelText("Enddatum Wert")).toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /kalender für startdatum öffnen/i })).toBeDisabled();
    expect(dialogQueries.getByRole("button", { name: /kalender für endedatum öffnen/i })).toBeEnabled();
    expect(dialogQueries.getByRole("button", { name: /zeitraum übernehmen/i })).toBeDisabled();
    expect(dialogQueries.queryByRole("button", { name: /absage datum 2026-01-06/i })).not.toBeInTheDocument();
    expect(dialogQueries.queryByRole("button", { name: /termine übernehmen/i })).not.toBeInTheDocument();
    expect(dialogQueries.queryByRole("button", { name: /kalender für ausnahmetermin öffnen/i })).not.toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /absage überprüfen/i })).toBeDisabled();
    expect(dialogQueries.getByRole("button", { name: /^abbrechen$/i })).toBeInTheDocument();
    expect(dialogQueries.getByText(/ausgewählte aktion:/i)).toBeInTheDocument();
    expect(dialogQueries.getByText(/keine auswahl/i)).toBeInTheDocument();

    await user.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));
    expect(dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i })).toBeInTheDocument();
    await user.click(dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i }));
    expect(dialogQueries.getByText(new RegExp(`Absage\\s+·\\s+${formatDateForDisplay("2026-01-06")}`, "i"))).toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /absage überprüfen/i })).toBeEnabled();
    await user.click(dialogQueries.getByRole("button", { name: /absage überprüfen/i }));
    expect(dialogQueries.getByRole("group", { name: /auswirkungsprüfung terminabsage/i })).toBeInTheDocument();
    await user.click(dialogQueries.getByRole("button", { name: /termin jetzt absagen/i }));

    await waitFor(() => {
      expect(mockedCancelCourseDate).toHaveBeenCalledWith(
        "1",
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

  it("speichert korrigiertes Endedatum am aktiven Kursblock", async () => {
    mockedUpdateCourse.mockResolvedValue({});
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <CourseDatesDialog
        course={makeCourse({ status: "active", dates: ["2026-01-06"] })}
        overrides={[]}
        swaps={[]}
        canManageCourses
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialogQueries = within(dialogs[dialogs.length - 1]);
    await user.click(dialogQueries.getByRole("button", { name: /kalender für endedatum öffnen/i }));
    await user.click(dialogQueries.getByRole("button", { name: /endedatum 2026-01-20/i }));
    await user.click(dialogQueries.getByRole("button", { name: /zeitraum übernehmen/i }));

    await waitFor(() => {
      expect(mockedUpdateCourse).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({
          planningMode: "bounded_series",
          seriesStartDate: "2026-01-01",
          seriesEndDate: "2026-01-20",
          visibleUntil: "2026-01-20",
        }),
      );
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("zeigt bei aktivem rolling Kurs nur einen Kalender mit dynamischer Aktion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({
          status: "active",
          planningMode: "rolling_continuous",
        })}
        overrides={[]}
        swaps={[]}
        tenantSettings={rollingTenant10}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);

    expect(dialogQueries.queryByRole("button", { name: /termine übernehmen/i })).not.toBeInTheDocument();
    expect(dialogQueries.queryByRole("button", { name: /kalender für ausnahmetermin öffnen/i })).not.toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /absage überprüfen/i })).toBeDisabled();
  });

  it("erlaubt im rolling Lockfenster weiterhin Absage für nicht ausgeschlossene Termine", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({
          status: "active",
          planningMode: "rolling_continuous",
          excludedDates: ["2026-01-13"],
        })}
        overrides={[]}
        swaps={[]}
        tenantSettings={rollingTenant10}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    fireEvent.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));

    // Ausgeschlossener Termin ist weiterhin blockiert
    const excludedCell = dialogQueries.getByRole("button", { name: /absage datum 2026-01-13/i });
    expect(excludedCell).toBeDisabled();

    // Passender Termin im Lockfenster bleibt für Absage auswählbar
    const cancellableCell = dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i });
    expect(cancellableCell).toBeEnabled();
    expect(cancellableCell).toHaveAttribute("title", expect.stringMatching(/nur absage möglich|termin für absage auswählen/i));
    fireEvent.click(cancellableCell);
    expect(dialogQueries.getByText(new RegExp(`Absage\\s+·\\s+${formatDateForDisplay("2026-01-06")}`, "i"))).toBeInTheDocument();
    expect(dialogQueries.getByRole("button", { name: /absage überprüfen/i })).toBeEnabled();
  });

  it("lässt im aktiven rolling Kurs außerhalb des Teilnehmer-Sichtfensters Ausschluss zu", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:00:00.000Z"));
    render(
      <CourseDatesDialog
        course={makeCourse({
          status: "active",
          planningMode: "rolling_continuous",
        })}
        overrides={[]}
        swaps={[]}
        tenantSettings={rollingTenant2}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialogQueries = within(dialogs[dialogs.length - 1]);
    fireEvent.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));

    const nearLocked = dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i });
    expect(nearLocked).toBeEnabled();
    expect(nearLocked).toHaveAttribute("title", expect.stringMatching(/nur absage möglich/i));

    fireEvent.click(dialogQueries.getByRole("button", { name: /nächster monat/i }));
    const farAllowed = dialogQueries.getByRole("button", { name: /absage datum 2026-02-10/i });
    expect(farAllowed).toBeEnabled();
    expect(farAllowed).toHaveAttribute("title", expect.stringMatching(/termin ausschließen/i));
    fireEvent.click(farAllowed);
    expect(dialogQueries.getByText(/Ausschlüsse in Bearbeitung/i)).toBeInTheDocument();
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
    await user.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));
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

  it("berechnet Swap-Zähler case-insensitiv", async () => {
    mockedCancelCourseDate.mockResolvedValue({ success: true, courseId: 1, date: "2026-01-06" });
    render(
      <CourseDatesDialog
        course={makeCourse({ status: "active", participants: ["Luna"] })}
        overrides={[
          {
            courseId: 1,
            date: "2026-01-06",
            participants: [],
            cancelledParticipants: ["Luna"],
            swapped: [],
            waitlist: [],
          },
        ]}
        swaps={[
          {
            participantId: "luna",
            fromCourseId: 1,
            fromDate: "2026-01-06",
            toCourseId: 2,
            toDate: "2099-01-09",
            status: "active",
          },
          {
            participantId: "luna",
            fromCourseId: 1,
            fromDate: "2026-01-06",
            toCourseId: 3,
            toDate: "2099-01-10",
            status: "pending",
          },
        ]}
        canManageCourses
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const user = userEvent.setup();
    const dialogs = screen.getAllByRole("dialog", { name: /kurstermine bearbeiten/i });
    const dialog = dialogs[dialogs.length - 1];
    const dialogQueries = within(dialog);
    await user.click(dialogQueries.getByRole("button", { name: /kalender für terminabsage öffnen/i }));
    await user.click(dialogQueries.getByRole("button", { name: /absage datum 2026-01-06/i }));
    await user.click(dialogQueries.getByRole("button", { name: /absage überprüfen/i }));

    expect(
      dialogQueries.getByText(/erfolgreiche tauschs in andere termine zurückrollen\s*\(1\)/i),
    ).toBeInTheDocument();
    expect(
      dialogQueries.getByText(/tauschanfragen auf wartelisten in andere termine zurückrollen\s*\(1\)/i),
    ).toBeInTheDocument();
  });
});
