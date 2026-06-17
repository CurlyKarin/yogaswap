import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import CourseSwapModal from "./CourseSwapModal";
import type { Course } from "shared/types";
import { swapOptionKey } from "../lib/dates";
import { DIRECT_SWAP_WARNINGS, SWAP_REQUEST_WARNINGS } from "../lib/swapRequestWarnings";

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

const alternativeCourse: Course = {
  ...baseCourse,
  id: 2,
  name: "Yoga Abend",
  dates: ["2099-06-20"],
  participants: [],
};

const swapWindow = { minOffsetDays: -7, maxOffsetDays: 7 };

const freeTargetDate = new Date("2099-06-20T10:00:00Z");

function renderSwapModal(
  overrides: Partial<React.ComponentProps<typeof CourseSwapModal>> = {},
) {
  const onConfirmFree = vi.fn();
  const onConfirmWaitlist = vi.fn();
  const onClose = vi.fn();

  render(
    <CourseSwapModal
      title="Tauschanfrage starten"
      courseName={baseCourse.name}
      originTermIso="2099-06-16"
      originTermDisplay="16.6.2099"
      swapWindow={swapWindow}
      availableSwapDates={[{ course: alternativeCourse, date: freeTargetDate }]}
      waitlistDates={[]}
      onConfirmFree={onConfirmFree}
      onConfirmWaitlist={onConfirmWaitlist}
      onClose={onClose}
      {...overrides}
    />,
  );

  return { onConfirmFree, onConfirmWaitlist, onClose };
}

describe("CourseSwapModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("rendert Dialog mit aria-label und Titel", () => {
    renderSwapModal();

    expect(
      screen.getByRole("dialog", { name: /Tauschanfrage starten, Yoga Basic, 16\.06\.2099/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Tauschanfrage starten/i })).toBeInTheDocument();
  });

  it("verknüpft Hilfe-Buttons mit beschreibendem Text für Screenreader", () => {
    renderSwapModal();

    const freeSlotsHint = screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i });
    const describedBy = freeSlotsHint.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /gleichzeitig von deinem aktuellen Termin ab/i,
    );
  });

  it("meldet Hilfetext beim Öffnen über aria-live", () => {
    renderSwapModal();

    fireEvent.click(screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i }));
    const liveAnnouncements = screen
      .getAllByRole("status")
      .filter((node) => node.textContent?.includes("gleichzeitig von deinem aktuellen Termin ab"));
    expect(liveAnnouncements.length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: /Freie Tauschtermine/i })).toBeVisible();
  });

  it("blendet Hilfe-Popover standardmäßig aus und schließt es wieder", () => {
    renderSwapModal();

    expect(screen.queryByRole("region", { name: /Freie Tauschtermine/i })).not.toBeInTheDocument();

    const freeSlotsHint = screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i });
    fireEvent.click(freeSlotsHint);
    expect(screen.getByRole("region", { name: /Freie Tauschtermine/i })).toBeVisible();
    expect(freeSlotsHint).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(freeSlotsHint);
    expect(screen.queryByRole("region", { name: /Freie Tauschtermine/i })).not.toBeInTheDocument();
    expect(freeSlotsHint).toHaveAttribute("aria-expanded", "false");
  });

  it("zeigt Hilfe-Hinweise und deaktiviert Bestätigen ohne Auswahl", () => {
    renderSwapModal();

    expect(screen.getByText(/Es stehen 1 freie Termin\(e\) zur Auswahl\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hilfe: Warteliste im Tauschdialog/i })).toBeInTheDocument();

    const freeSlotsHint = screen.getByRole("button", { name: /Hilfe: Freie Tauschtermine/i });
    fireEvent.click(freeSlotsHint);
    expect(screen.getByRole("region", { name: /Freie Tauschtermine/i })).toHaveTextContent(
      /gleichzeitig von deinem aktuellen Termin ab/i,
    );

    const confirmButton = screen.getByRole("button", { name: /Bestätigen/i });
    expect(confirmButton).toBeDisabled();
    fireEvent.click(confirmButton);
  });

  it("ruft onClose bei Escape und Schließen auf", () => {
    const { onClose } = renderSwapModal();

    fireEvent.keyDown(
      screen.getByRole("dialog", { name: /Tauschanfrage starten, Yoga Basic/i }),
      { key: "Escape" },
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /Schließen/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hält den Fokus im Dialog per Tab", () => {
    renderSwapModal();

    const dialog = screen.getByRole("dialog", { name: /Tauschanfrage starten, Yoga Basic/i });
    const closeButton = screen.getByRole("button", { name: /Schließen/i });
    closeButton.focus();

    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).not.toBe(closeButton);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("zeigt Hinweise vor Bestätigung eines freien Termins", () => {
    renderSwapModal();

    expect(screen.queryByRole("note", { name: /Hinweise vor dem Tausch/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: swapOptionKey(2, freeTargetDate) },
    });

    const notice = screen.getByRole("note", { name: /Hinweise vor dem Tausch/i });
    for (const warning of DIRECT_SWAP_WARNINGS) {
      expect(notice).toHaveTextContent(warning);
    }
  });

  it("zeigt Hinweise vor Bestätigung einer Wartelisten-Anfrage", () => {
    const waitlistDate = new Date("2099-06-20T10:00:00Z");
    renderSwapModal({
      availableSwapDates: [],
      waitlistDates: [{ course: alternativeCourse, date: waitlistDate }],
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: swapOptionKey(2, waitlistDate) },
    });

    const notice = screen.getByRole("note", { name: /Hinweise vor dem Tausch/i });
    for (const warning of SWAP_REQUEST_WARNINGS) {
      expect(notice).toHaveTextContent(warning);
    }
    expect(notice).toHaveTextContent(/automatisch ausgeführt/i);
    expect(notice).toHaveTextContent(/E-Mail-Benachrichtigung/i);
  });

  it("ruft onConfirmFree nach Terminauswahl auf", () => {
    const { onConfirmFree, onClose } = renderSwapModal();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: swapOptionKey(2, freeTargetDate) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Bestätigen/i }));

    expect(onConfirmFree).toHaveBeenCalledWith(2, "2099-06-20");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unterscheidet zwei Kurse am selben Zeitpunkt in der Warteliste", () => {
    const sharedDate = new Date(2099, 5, 20, 10, 0, 0);
    const secondCourse: Course = {
      ...alternativeCourse,
      id: 3,
      name: "Yoga Mittag",
      dates: ["2099-06-20"],
    };
    const { onConfirmWaitlist } = renderSwapModal({
      availableSwapDates: [],
      waitlistDates: [
        { course: alternativeCourse, date: sharedDate },
        { course: secondCourse, date: sharedDate },
      ],
    });

    const waitlistSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(waitlistSelect, {
      target: { value: swapOptionKey(3, sharedDate) },
    });
    fireEvent.click(screen.getByRole("button", { name: /Bestätigen/i }));

    expect(onConfirmWaitlist).toHaveBeenCalledWith(3, "2099-06-20");
  });
});
