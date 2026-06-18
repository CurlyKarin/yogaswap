type GuestSeatControlsProps = {
  guestCount: number;
  canAddGuest: boolean;
  canRemoveGuest: boolean;
  disabled?: boolean;
  saving?: boolean;
  onAddGuest: () => void;
  onRemoveGuest: () => void;
};

export default function GuestSeatControls({
  guestCount,
  canAddGuest,
  canRemoveGuest,
  disabled = false,
  saving = false,
  onAddGuest,
  onRemoveGuest,
}: GuestSeatControlsProps) {
  const controlsDisabled = disabled || saving;

  return (
    <div className="guest-seat-controls" role="group" aria-label="Gastplätze verwalten">
      <button
        type="button"
        className="guest-seat-control-btn"
        aria-label="Gastplatz entfernen"
        disabled={controlsDisabled || !canRemoveGuest}
        onClick={onRemoveGuest}
      >
        −
      </button>
      <span className="guest-seat-control-count" aria-live="polite">
        {guestCount}
      </span>
      <button
        type="button"
        className="guest-seat-control-btn"
        aria-label="Gastplatz hinzufügen"
        disabled={controlsDisabled || !canAddGuest}
        onClick={onAddGuest}
      >
        +
      </button>
    </div>
  );
}
