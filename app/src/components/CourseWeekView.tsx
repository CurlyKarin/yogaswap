import { weekAnchorForOccurrence } from "../lib/courseWeek";

type Props = {
  weekAnchor: Date;
  onWeekAnchorChange: (weekStart: Date) => void;
};

/**
 * Platzhalter für #164 — Termine pro Kalenderwoche, Absagen/Ausschlüsse, Swap-Kontext.
 */
export default function CourseWeekView({ weekAnchor, onWeekAnchorChange }: Props) {
  const handleStubOccurrenceClick = () => {
    const outsideWeek = new Date(weekAnchor);
    outsideWeek.setDate(outsideWeek.getDate() + 14);
    onWeekAnchorChange(weekAnchorForOccurrence(outsideWeek, weekAnchor));
  };

  return (
    <div className="course-week-view course-week-view--stub" role="region" aria-label="Wochenansicht">
      <p className="muted course-week-view-stub-note">
        Wochenansicht (#164) — hier erscheinen Termine aller sichtbaren Kurse für die gewählte
        Kalenderwoche (inkl. abgesagter und ausgeschlossener Termine).
      </p>
      <button type="button" className="modal-action-btn" onClick={handleStubOccurrenceClick}>
        Stub: +2 Wochen springen
      </button>
    </div>
  );
};
