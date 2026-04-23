import type { KeyboardEvent, RefObject } from "react";
import CourseModalFrame from "./CourseModalFrame";

type CourseDeleteDialogProps = {
  open: boolean;
  saving: boolean;
  formError: string | null;
  courseName?: string;
  modalRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onConfirmDelete: () => void;
};

export default function CourseDeleteDialog({
  open,
  saving,
  formError,
  courseName,
  modalRef,
  onKeyDown,
  onClose,
  onConfirmDelete,
}: CourseDeleteDialogProps) {
  if (!open || !courseName) return null;

  return (
    <CourseModalFrame ariaLabel="Kurs löschen" title="Kurs löschen" modalRef={modalRef} onKeyDown={onKeyDown}>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Kurs <strong>{courseName}</strong> wirklich löschen?
        </p>
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
          Löschen ist nur möglich, wenn der Kurs inaktiv ist und keine offenen Termin-/Tauschbezüge
          mehr bestehen.
        </p>
        {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary modal-action-btn" onClick={onConfirmDelete} disabled={saving}>
            {saving ? "Lösche..." : "Löschen"}
          </button>
        </div>
    </CourseModalFrame>
  );
}
