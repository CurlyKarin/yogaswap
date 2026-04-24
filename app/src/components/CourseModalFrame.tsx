import { useLayoutEffect } from "react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

type CourseModalFrameProps = {
  ariaLabel: string;
  title: string;
  modalRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
};

export default function CourseModalFrame({
  ariaLabel,
  title,
  modalRef,
  onKeyDown,
  children,
}: CourseModalFrameProps) {
  useLayoutEffect(() => {
    const modalNode = modalRef.current;
    if (!modalNode) return;
    const active = document.activeElement as Node | null;
    if (active && modalNode.contains(active)) return;
    modalNode.focus();
  }, [modalRef]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onKeyDownCapture={onKeyDown}
    >
      <div className="modal modal-compact" ref={modalRef} tabIndex={-1}>
        <h4>{title}</h4>
        {children}
      </div>
    </div>
  );
}
