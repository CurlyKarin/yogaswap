import { useId, useState, type ReactNode } from "react";

/** Label + „?“ help toggle — shared by Studio- and User-Settings. */
export default function FieldLabelWithTooltip({
  children,
  tooltip,
}: {
  children: ReactNode;
  tooltip: string;
}) {
  const hintId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="studio-field-label-block">
      <span className="dialog-field-label studio-field-label">
        {children}
        <button
          type="button"
          className="studio-field-hint"
          title={tooltip}
          aria-expanded={open}
          aria-controls={hintId}
          aria-label={`Hilfe: ${tooltip}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((prev) => !prev);
          }}
        >
          ?
        </button>
      </span>
      {open && (
        <span id={hintId} role="note" className="studio-field-hint-popover">
          {tooltip}
        </span>
      )}
    </span>
  );
}
