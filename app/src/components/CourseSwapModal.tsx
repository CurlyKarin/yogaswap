import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatCourseIsoDateDe } from "shared/courseStatus";
import type { Course } from "shared/types";
import { parseSwapOptionKey, swapOptionKey, toDateKey } from "../lib/dates";
import { DIRECT_SWAP_WARNINGS, SWAP_REQUEST_WARNINGS } from "../lib/swapRequestWarnings";
import { focusWithVisibleRing } from "../lib/focusWithVisibleRing";
import type { SwapSettings } from "../types";
import CourseModalFrame from "./CourseModalFrame";
import TermDateSelect from "./TermDateSelect";

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

export type SwapTargetOption = {
  course: Course;
  date: Date;
};

type CourseSwapModalProps = {
  title: string;
  courseName: string;
  originTermIso: string;
  originTermDisplay: string;
  swapWindow: SwapSettings;
  originIsBoundedSeries?: boolean;
  availableSwapDates: SwapTargetOption[];
  waitlistDates: SwapTargetOption[];
  onConfirmFree: (targetCourseId: number, targetDateIso: string) => void;
  onConfirmWaitlist: (targetCourseId: number, targetDateIso: string) => void;
  onClose: () => void;
};

function SwapModalHint({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: ReactNode;
}) {
  const descriptionId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      setLiveMessage(next ? description : "");
      return next;
    });
  };

  return (
    <span className="swap-modal-hint-wrap">
      <span id={descriptionId} className="visually-hidden">
        {description}
      </span>
      <span role="status" aria-live="polite" aria-atomic="true" className="visually-hidden">
        {liveMessage}
      </span>
      <button
        type="button"
        className="studio-field-hint"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-describedby={descriptionId}
        aria-label={`Hilfe: ${label}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }}
      >
        ?
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label={label}
          className="studio-field-hint-popover swap-modal-hint-popover"
        >
          {children}
        </div>
      )}
    </span>
  );
}

const swapOptionLabel = (date: Date) =>
  new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

export default function CourseSwapModal({
  title,
  courseName,
  originTermIso,
  originTermDisplay,
  swapWindow,
  originIsBoundedSeries = false,
  availableSwapDates,
  waitlistDates,
  onConfirmFree,
  onConfirmWaitlist,
  onClose,
}: CourseSwapModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [swapDateIso, setSwapDateIso] = useState<string | null>(null);
  const [swapDateIsoWaitlist, setSwapDateIsoWaitlist] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
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
        focusWithVisibleRing(modalNode);
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const currentIndex = active ? focusables.indexOf(active) : -1;
      if (currentIndex === -1) {
        focusWithVisibleRing(focusables[0]);
        return;
      }

      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + focusables.length) % focusables.length
        : (currentIndex + 1) % focusables.length;
      focusWithVisibleRing(focusables[nextIndex]);
    },
    [onClose],
  );

  const resolveTarget = (optionKey: string, options: SwapTargetOption[]) => {
    const parsed = parseSwapOptionKey(optionKey);
    if (!parsed) return null;
    return (
      options.find(
        (opt) =>
          opt.course.id === parsed.courseId && swapOptionKey(opt.course.id, opt.date) === optionKey,
      ) ?? null
    );
  };

  const selectedWarnings = swapDateIsoWaitlist
    ? SWAP_REQUEST_WARNINGS
    : swapDateIso
      ? DIRECT_SWAP_WARNINGS
      : null;

  const handleConfirm = () => {
    if (swapDateIso) {
      const target = resolveTarget(swapDateIso, availableSwapDates);
      if (target) {
        onConfirmFree(target.course.id, toDateKey(target.date));
      }
    } else if (swapDateIsoWaitlist) {
      const target = resolveTarget(swapDateIsoWaitlist, waitlistDates);
      if (target) {
        onConfirmWaitlist(target.course.id, toDateKey(target.date));
      }
    }
    onClose();
  };

  return (
    <CourseModalFrame
      ariaLabel={`${title}, ${courseName}, ${formatCourseIsoDateDe(originTermIso)}`}
      title={title}
      modalRef={modalRef}
      onKeyDown={handleKeyDown}
    >
      <p>
        Ausgewählter Termin: <strong>{originTermDisplay}</strong> · {courseName}
      </p>

      {availableSwapDates.length > 0 || waitlistDates.length > 0 ? (
        <>
          <div className="swap-modal-section-head">
            <span className="swap-modal-section-title">Freie Termine</span>
            <SwapModalHint
              label="Freie Tauschtermine"
              description={
                originIsBoundedSeries
                  ? "Termine mit freien Plätzen in diesem Kursblock bis zum Endedatum (nur in der Zukunft). Mit der Bestätigung eines Zieltermins meldest du dich gleichzeitig von deinem aktuellen Termin ab."
                  : `Termine mit freien Plätzen zwischen ${swapWindow.minOffsetDays} und ${swapWindow.maxOffsetDays} Tagen nach deinem Kurstermin (nur in der Zukunft). Mit der Bestätigung eines Zieltermins meldest du dich gleichzeitig von deinem aktuellen Termin ab.`
              }
            >
              <p>
                {originIsBoundedSeries ? (
                  <>
                    Termine mit freien Plätzen in diesem Kursblock{" "}
                    <strong>bis zum Endedatum</strong> (nur in der Zukunft). Mit der Bestätigung eines
                    Zieltermins meldest du dich gleichzeitig von deinem aktuellen Termin ab.
                  </>
                ) : (
                  <>
                    Termine mit freien Plätzen zwischen{" "}
                    <strong>
                      {swapWindow.minOffsetDays} und {swapWindow.maxOffsetDays} Tagen
                    </strong>{" "}
                    nach deinem Kurstermin (nur in der Zukunft). Mit der Bestätigung eines Zieltermins meldest
                    du dich gleichzeitig von deinem aktuellen Termin ab.
                  </>
                )}
              </p>
            </SwapModalHint>
          </div>
          {availableSwapDates.length > 0 ? (
            <>
              <p className="muted">
                Es stehen {availableSwapDates.length} freie Termin(e) zur Auswahl.
              </p>
              <TermDateSelect
                aria-label="Freien Termin auswählen"
                value={swapDateIso ?? ""}
                options={[
                  { value: "", label: "Bitte freien Termin auswählen…", disabled: true },
                  ...availableSwapDates.map((swapDate) => ({
                    value: swapOptionKey(swapDate.course.id, swapDate.date),
                    label: `${swapOptionLabel(swapDate.date)}${
                      availableSwapDates.some(
                        (other) =>
                          other !== swapDate &&
                          other.date.getTime() === swapDate.date.getTime(),
                      )
                        ? ` · ${swapDate.course.name}`
                        : ""
                    }`,
                  })),
                ]}
                onChange={(nextValue) => {
                  setSwapDateIso(nextValue || null);
                  setSwapDateIsoWaitlist(null);
                }}
              />
            </>
          ) : (
            <p className="muted">Derzeit keine freien Termine im Tauschfenster.</p>
          )}

          <div className="swap-modal-section-head">
            <span className="swap-modal-section-title">Warteliste</span>
            <SwapModalHint
              label="Warteliste im Tauschdialog"
              description={
                originIsBoundedSeries
                  ? "Ausgebuchte Termine im selben Kursblock bis zum Endedatum. Die Anfrage landet auf der Warteliste — noch ohne feste Buchung."
                  : `Ausgebuchte Termine im gleichen Zeitfenster (${swapWindow.minOffsetDays} bis ${swapWindow.maxOffsetDays} Tage nach deinem Kurstermin). Die Anfrage landet auf der Warteliste — noch ohne feste Buchung.`
              }
            >
              <p>
                {originIsBoundedSeries ? (
                  <>
                    Ausgebuchte Termine im selben Kursblock <strong>bis zum Endedatum</strong>. Die Anfrage
                    landet auf der Warteliste — noch ohne feste Buchung.
                  </>
                ) : (
                  <>
                    Ausgebuchte Termine im gleichen Zeitfenster (
                    <strong>
                      {swapWindow.minOffsetDays} bis {swapWindow.maxOffsetDays} Tage
                    </strong>{" "}
                    nach deinem Kurstermin). Die Anfrage landet auf der Warteliste — noch ohne feste Buchung.
                  </>
                )}
              </p>
            </SwapModalHint>
          </div>
          {waitlistDates.length > 0 ? (
            <>
              <p className="muted">
                {waitlistDates.length} belegte Termin(e) mit Wartelisten-Option:
              </p>
              <TermDateSelect
                aria-label="Belegten Termin für Warteliste wählen"
                value={swapDateIsoWaitlist ?? ""}
                options={[
                  { value: "", label: "Bitte belegten Termin wählen…", disabled: true },
                  ...waitlistDates.map((waitlistDate) => ({
                    value: swapOptionKey(waitlistDate.course.id, waitlistDate.date),
                    label: `${swapOptionLabel(waitlistDate.date)}${
                      waitlistDates.some(
                        (other) =>
                          other !== waitlistDate &&
                          other.date.getTime() === waitlistDate.date.getTime(),
                      )
                        ? ` · ${waitlistDate.course.name}`
                        : ""
                    }`,
                  })),
                ]}
                onChange={(nextValue) => {
                  setSwapDateIsoWaitlist(nextValue || null);
                  setSwapDateIso(null);
                }}
              />
            </>
          ) : (
            <p className="muted">Derzeit keine belegten Termine mit Wartelisten-Option.</p>
          )}
        </>
      ) : (
        <p className="muted">Keine passenden Ersatztermine verfügbar</p>
      )}

      {selectedWarnings && (
        <div className="swap-modal-notice" role="note" aria-label="Hinweise vor dem Tausch">
          <p className="swap-modal-notice-title">Bitte beachten:</p>
          <ul>
            {selectedWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Schließen
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleConfirm}
          disabled={!swapDateIso && !swapDateIsoWaitlist}
        >
          Bestätigen
        </button>
      </div>
    </CourseModalFrame>
  );
}
