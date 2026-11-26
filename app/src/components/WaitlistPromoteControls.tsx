import { useId, useState } from "react";

type WaitlistPromoteControlsProps = {
  waitlist: string[];
  displayNameFor: (ref: string) => string;
  disabled?: boolean;
  saving?: boolean;
  onPromote: (participantId: string) => void | Promise<void>;
};

export default function WaitlistPromoteControls({
  waitlist,
  displayNameFor,
  disabled = false,
  saving = false,
  onPromote,
}: WaitlistPromoteControlsProps) {
  const selectId = useId();
  const [selected, setSelected] = useState("");
  const controlsDisabled = disabled || saving || waitlist.length === 0;
  const options = waitlist.filter((entry) => entry.trim());

  const handlePromote = async () => {
    if (!selected || controlsDisabled) return;
    await onPromote(selected);
    setSelected("");
  };

  return (
    <div className="waitlist-promote-controls" role="group" aria-label="Warteliste übernehmen">
      <label className="visually-hidden" htmlFor={selectId}>
        Person von der Warteliste wählen
      </label>
      <select
        id={selectId}
        className="waitlist-promote-select"
        value={selected}
        disabled={controlsDisabled}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Person wählen…</option>
        {options.map((ref) => (
          <option key={ref} value={ref}>
            {displayNameFor(ref)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="waitlist-promote-btn"
        disabled={controlsDisabled || !selected}
        onClick={() => {
          void handlePromote();
        }}
      >
        Übernehmen
      </button>
    </div>
  );
}
