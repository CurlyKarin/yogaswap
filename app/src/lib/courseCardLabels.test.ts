import { describe, it, expect } from "vitest";
import {
  formatAbsenceAnnouncement,
  guestChipAriaLabel,
  participantChipAriaLabel,
  resolveCourseScheduleDisplay,
  resolveInactiveParticipantNotice,
  resolvePastTermNotice,
  waitlistChipAriaLabel,
} from "./courseCardLabels";

describe("courseCardLabels", () => {
  it("formatiert Chip-Labels für Teilnehmerstatus", () => {
    expect(participantChipAriaLabel("bob", { isSelf: false, isSn: false, isSwapped: false })).toBe(
      "bob, regulär eingetragen",
    );
    expect(participantChipAriaLabel("alice", { isSelf: true, isSn: false, isSwapped: false })).toBe(
      "alice, du",
    );
  });

  it("formatiert Wartelisten-Chip-Labels", () => {
    expect(waitlistChipAriaLabel("bob", false)).toBe("bob, auf der Warteliste");
    expect(waitlistChipAriaLabel("alice", true)).toBe("alice, du auf der Warteliste");
  });

  it("formatiert Gast-Chip-Labels", () => {
    expect(guestChipAriaLabel(1, 1)).toBe("Gastplatz belegt");
    expect(guestChipAriaLabel(2, 3)).toBe("Gastplatz 2 von 3");
  });

  it("formatiert Absage-Live-Ansagen", () => {
    expect(formatAbsenceAnnouncement("Yoga Basic", "2099-06-16", "cancelled")).toBe(
      "Termin abgesagt für Yoga Basic, 16.06.2099. Absage kann zurückgenommen werden.",
    );
  });

  it("formatiert Kursrhythmus für Anzeige und ARIA", () => {
    expect(resolveCourseScheduleDisplay("Monday", "10:00")).toEqual({
      weekdayLabel: "Montag",
      time: "10:00",
      ariaLabel: "Montag · 10:00",
    });
    expect(resolveCourseScheduleDisplay("Mon", "18:30", "Studio 1")).toEqual({
      weekdayLabel: "Montag",
      time: "18:30",
      roomLabel: "Studio 1",
      ariaLabel: "Montag · 18:30 · Studio 1",
    });
  });

  it("formuliert Kurs-Hinweis ohne Blockende-Datum", () => {
    expect(resolveInactiveParticipantNotice({ isAutomaticallyInactive: true })).toBe(
      "Dieser Kurs wurde automatisch beendet. Du kannst nur noch bestehende Tausche verwalten.",
    );
    expect(resolveInactiveParticipantNotice({ isAutomaticallyInactive: false })).toBe(
      "Dieser Kurs ist inaktiv. Du kannst nur noch bestehende Tausche verwalten.",
    );
  });

  it("formuliert Footer-Hinweise für vergangene Termine", () => {
    expect(resolvePastTermNotice({ showPastGraceMarker: false, hasCancelled: false })).toBe(
      "Vergangener Termin — keine Änderungen mehr möglich.",
    );
    expect(resolvePastTermNotice({ showPastGraceMarker: true, hasCancelled: false })).toBe(
      "Vergangener Termin im Nachlauf — Tausch nur nach rechtzeitiger Absage.",
    );
    expect(resolvePastTermNotice({ showPastGraceMarker: true, hasCancelled: true })).toBe(
      "Für diesen Termin ist der Nachlauf vorbei — kein Tausch mehr möglich.",
    );
  });
});
