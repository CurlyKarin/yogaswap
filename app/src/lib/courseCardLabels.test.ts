import { describe, it, expect } from "vitest";
import {
  formatAbsenceAnnouncement,
  participantChipAriaLabel,
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

  it("formatiert Absage-Live-Ansagen", () => {
    expect(formatAbsenceAnnouncement("Yoga Basic", "2099-06-16", "cancelled")).toBe(
      "Termin abgesagt für Yoga Basic, 16.06.2099. Absage kann zurückgenommen werden.",
    );
  });
});
