import { ChevronDown, ChevronUp } from "lucide-react";

type NumberStepInputProps = {
  value: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  "aria-label"?: string;
  onChange: (next: string) => void;
};

function snapToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  return Math.min(max, Math.max(min, min + steps * step));
}

function stepFrom(current: string, direction: 1 | -1, min: number, max: number, step: number): string {
  const parsed = Number.parseInt(current, 10);
  const base = Number.isFinite(parsed) ? parsed : min;
  return String(snapToStep(base + direction * step, min, max, step));
}

export default function NumberStepInput({
  value,
  min,
  max,
  step = 1,
  disabled = false,
  "aria-label": ariaLabel,
  onChange,
}: NumberStepInputProps) {
  const parsed = Number.parseInt(value, 10);
  const numeric = Number.isFinite(parsed) ? parsed : min;
  const canDecrease = !disabled && numeric > min;
  const canIncrease = !disabled && numeric < max;

  return (
    <div className="studio-number-step">
      <input
        type="number"
        className="studio-number-step-input"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const next = Number.parseInt(value, 10);
          if (!Number.isFinite(next)) {
            onChange(String(min));
            return;
          }
          onChange(String(snapToStep(next, min, max, step)));
        }}
      />
      <div className="studio-number-step-buttons" aria-hidden={disabled || undefined}>
        <button
          type="button"
          className="studio-number-step-btn"
          aria-label={`Erhöhen um ${step}`}
          disabled={!canIncrease}
          onClick={() => onChange(stepFrom(value, 1, min, max, step))}
        >
          <ChevronUp size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="studio-number-step-btn"
          aria-label={`Verringern um ${step}`}
          disabled={!canDecrease}
          onClick={() => onChange(stepFrom(value, -1, min, max, step))}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
