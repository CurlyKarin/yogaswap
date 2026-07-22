import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

export type TermDateSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type TermDateSelectProps = {
  id?: string;
  value: string;
  options: TermDateSelectOption[];
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  onChange: (value: string) => void;
};

function isPlaceholderOption(option: TermDateSelectOption): boolean {
  return !!option.disabled && option.value === "";
}

const TermDateSelect = forwardRef<HTMLButtonElement, TermDateSelectProps>(function TermDateSelect(
  {
    id,
    value,
    options,
    disabled = false,
    className,
    "aria-describedby": ariaDescribedBy,
    "aria-label": ariaLabel,
    onChange,
  },
  forwardedRef,
) {
  const autoId = useId();
  const listboxId = `${autoId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label ?? options.find((option) => option.value === "")?.label ?? "—";
  const listOptions = options.filter((option) => !isPlaceholderOption(option));
  const enabledOptions = listOptions.filter((option) => !option.disabled);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const enabled = options.filter((option) => !option.disabled && !isPlaceholderOption(option));
    const selectedEnabledIndex = enabled.findIndex((option) => option.value === value);
    setActiveIndex(selectedEnabledIndex >= 0 ? selectedEnabledIndex : 0);
  }, [open, options, value]);

  const close = () => setOpen(false);

  const selectValue = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(enabledOptions.length, 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + Math.max(enabledOptions.length, 1)) % Math.max(enabledOptions.length, 1),
      );
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = enabledOptions[activeIndex];
      if (option) selectValue(option.value);
    }
  };

  const wrapClassName = ["term-date-select-wrap", className].filter(Boolean).join(" ");

  return (
    <div className={wrapClassName} ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={forwardedRef}
        className="term-date-select"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
        onKeyDown={onTriggerKeyDown}
      >
        {displayLabel}
      </button>
      {open && !disabled && (
        <ul
          id={listboxId}
          className="term-date-select-list"
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={
            enabledOptions[activeIndex]
              ? `${listboxId}-option-${enabledOptions[activeIndex].value}`
              : undefined
          }
          onKeyDown={onListKeyDown}
          ref={(node) => node?.focus()}
        >
          {listOptions.map((option) => {
            const isSelected = option.value === value;
            const enabledIndex = enabledOptions.indexOf(option);
            const isActive = !option.disabled && enabledIndex === activeIndex;
            return (
              <li
                key={`${option.value}-${option.label}`}
                id={option.disabled ? undefined : `${listboxId}-option-${option.value}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                className={[
                  "term-date-select-option",
                  option.disabled ? "is-disabled" : "",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  if (option.disabled) return;
                  selectValue(option.value);
                }}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default TermDateSelect;
