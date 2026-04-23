import type { KeyboardEvent, RefObject } from "react";
import CourseModalFrame from "./CourseModalFrame";

type CourseMembersDialogProps = {
  open: boolean;
  saving: boolean;
  courseName?: string;
  modalRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
};

export default function CourseMembersDialog({
  open,
  saving,
  courseName,
  modalRef,
  onKeyDown,
  onClose,
}: CourseMembersDialogProps) {
  if (!open || !courseName) return null;

  return (
    <CourseModalFrame
      ariaLabel="Kursmitglieder bearbeiten"
      title="Mitglieder verwalten"
      modalRef={modalRef}
      onKeyDown={onKeyDown}
    >
      <p className="course-editor-note">
        Kurs: <strong>{courseName}</strong>
      </p>
      <p className="course-editor-note">
        Hier folgt als Nächstes die Zuordnung von Teilnehmern zu diesem Kurs (inkl. Kapazitätsprüfung).
      </p>
      <div className="modal-actions">
        <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
          Schließen
        </button>
      </div>
    </CourseModalFrame>
  );
}
