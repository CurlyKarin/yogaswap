import { useLayoutEffect } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { focusModalOnOpen } from "../lib/focusWithVisibleRing";

type CourseModalFrameProps = {
  ariaLabel: string;
  title: string;
  modalRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
  /** Desktop: erstes Eingabefeld fokussieren (Touch: immer nur Modal-Container). */
  preferInputFocus?: boolean;
};

export default function CourseModalFrame({
  ariaLabel,
  title,
  modalRef,
  onKeyDown,
  children,
  preferInputFocus = false,
}: CourseModalFrameProps) {
  useLayoutEffect(() => {
    const modalNode = modalRef.current;
    if (!modalNode) return;
    const active = document.activeElement as Node | null;
    if (active && modalNode.contains(active)) return;
    focusModalOnOpen(modalNode, { preferInput: preferInputFocus });
  }, [modalRef, preferInputFocus]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onKeyDownCapture={onKeyDown}
    >
      <div className="modal modal-compact" ref={modalRef} tabIndex={-1}>
        <div className="modal-header">
          <h4>{title}</h4>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
