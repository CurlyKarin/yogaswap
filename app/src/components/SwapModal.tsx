// components/SwapModal.tsx
import { useState } from "react";
import type { Course } from "@shared/types";

type Props = {
  options: { course: Course; date: Date }[];
  onSelect: (course: Course, date: Date) => void;
  onCancel: () => void;
};

export default function SwapModal({ options, onSelect, onCancel }: Props) {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="modal">
      <h3>Wähle einen Ersatztermin</h3>
      {options.length === 0 ? (
        <p>Keine passenden Termine verfügbar.</p>
      ) : (
        <ul>
          {options.map((opt, idx) => (
            <li key={idx}>
              <label>
                <input
                  type="radio"
                  checked={selected === idx}
                  onChange={() => setSelected(idx)}
                />
                {opt.course.name} – {opt.date.toLocaleDateString()}{" "}
                {opt.date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="modal-actions">
        <button onClick={onCancel}>Abbrechen</button>
        <button
          onClick={() => {
            if (selected != null) {
              const opt = options[selected];
              onSelect(opt.course, opt.date);
            }
          }}
          disabled={selected == null}
        >
          Bestätigen
        </button>
      </div>
    </div>
  );
}
