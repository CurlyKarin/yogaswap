import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ParticipantWithStatus } from "../api/participants";
import CourseModalFrame from "./CourseModalFrame";
import { getStatusPresentation } from "../lib/participants";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

type DelegationPickerDialogProps = {
  open: boolean;
  search: string;
  candidates: ParticipantWithStatus[];
  onSearchChange: (next: string) => void;
  onSelectUser: (userId: string) => void;
  onClose: () => void;
};

export default function DelegationPickerDialog({
  open,
  search,
  candidates,
  onSearchChange,
  onSelectUser,
  onClose,
}: DelegationPickerDialogProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const listBoxRef = useRef<HTMLDivElement | null>(null);
  const listItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [activeListIndex, setActiveListIndex] = useState(0);
  const [listHasFocus, setListHasFocus] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (candidates.length === 0) {
      setActiveListIndex(0);
      return;
    }
    setActiveListIndex((prev) => Math.max(0, Math.min(prev, candidates.length - 1)));
  }, [open, candidates.length]);

  useEffect(() => {
    const activeItem = listItemRefs.current[activeListIndex];
    if (activeItem && typeof activeItem.scrollIntoView === "function") {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeListIndex]);

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (candidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveListIndex((prev) => Math.min(prev + 1, candidates.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveListIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const active = candidates[activeListIndex];
      if (active) onSelectUser(active.userId);
    }
  };

  const handleListOptionClick = (index: number, userId: string) => {
    listBoxRef.current?.focus();
    setActiveListIndex(index);
    onSelectUser(userId);
  };

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const modalNode = modalRef.current;
    if (!modalNode) return;
    event.preventDefault();

    const focusables = getFocusableElements(modalNode);
    if (focusables.length === 0) {
      modalNode.focus();
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? focusables.indexOf(active) : -1;
    if (currentIndex === -1) {
      focusables[0].focus();
      return;
    }

    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusables.length) % focusables.length
      : (currentIndex + 1) % focusables.length;
    focusables[nextIndex].focus();
  };

  return (
    <CourseModalFrame
      ariaLabel="Vertretung auswählen"
      title="Vertretung auswählen"
      modalRef={modalRef}
      onKeyDown={onKeyDown}
    >
      <p className="course-editor-note">Wähle ein Mitglied aus.</p>
      <div className="dialog-stack">
        <div className="dialog-search-block">
          <input
            id="delegation-search"
            className="dialog-field dialog-search-field"
            type="search"
            aria-label="Vertretung suchen"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Teilnehmer suchen (Nickname oder E-Mail)"
            autoFocus
          />
          <p id="delegation-list-hint" className="course-editor-note dialog-search-hint dialog-search-hint-mobile-a11y">
            Tastatur: Tab zur Liste, Pfeile hoch/runter, Leertaste oder Enter zum Auswählen.
          </p>
        </div>
        {candidates.length === 0 ? (
          <p className="course-editor-note" style={{ marginBottom: 0 }}>
            Keine passenden Teilnehmer gefunden.
          </p>
        ) : (
          <div
            ref={listBoxRef}
            style={{ maxHeight: 220, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}
            role="listbox"
            aria-label="Vertretungsteilnehmerliste"
            aria-describedby="delegation-list-hint"
            aria-activedescendant={
              candidates[activeListIndex] ? `delegation-option-${candidates[activeListIndex].userId.toLowerCase()}` : undefined
            }
            tabIndex={0}
            onKeyDown={handleListKeyDown}
            onFocus={() => {
              setListHasFocus(true);
              if (candidates.length > 0) {
                setActiveListIndex((prev) => Math.max(0, Math.min(prev, candidates.length - 1)));
              }
            }}
            onBlur={() => setListHasFocus(false)}
            className={listHasFocus ? "course-members-listbox is-focused" : "course-members-listbox"}
          >
            {candidates.map((entry, index) => {
              const status = getStatusPresentation(entry.status);
              const isActive = index === activeListIndex;
              return (
                <div
                  key={entry.userId}
                  id={`delegation-option-${entry.userId.toLowerCase()}`}
                  role="option"
                  aria-selected={isActive}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "6px 8px",
                    cursor: "pointer",
                    borderRadius: 4,
                    background: isActive ? "#eff6ff" : "transparent",
                  }}
                  onMouseEnter={() => setActiveListIndex(index)}
                  onClick={() => handleListOptionClick(index, entry.userId)}
                  title={entry.email ? `${entry.userId} (${entry.email})` : entry.userId}
                >
                  <div
                    ref={(element) => {
                      listItemRefs.current[index] = element;
                    }}
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: status.color,
                      flex: "0 0 8px",
                    }}
                  />
                  <span>
                    <strong>{entry.userId}</strong>
                    {` - ${status.label}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-action-btn" onClick={onClose}>
          Schließen
        </button>
      </div>
    </CourseModalFrame>
  );
}
