type CourseCapacityFieldsProps = {
  capacity: string;
  overbookLimit: string;
  saving?: boolean;
  capacityDisabled?: boolean;
  showCapacityInput?: boolean;
  onCapacityChange?: (value: string) => void;
  onOverbookLimitChange: (value: string) => void;
};

function parseNonNegativeInt(text: string): number {
  const parsed = Number.parseInt(text, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function formatCapacityCardPreview(participantCount: number, capacity: number, overbookLimit: number): string {
  const base = `${participantCount}/${capacity}`;
  return overbookLimit > 0 ? `${base} (+${overbookLimit})` : base;
}

export default function CourseCapacityFields({
  capacity,
  overbookLimit,
  saving = false,
  capacityDisabled = false,
  showCapacityInput = true,
  onCapacityChange,
  onOverbookLimitChange,
}: CourseCapacityFieldsProps) {
  const regularCapacity = parseNonNegativeInt(capacity);
  const overbook = parseNonNegativeInt(overbookLimit);
  const maxCapacity = regularCapacity + overbook;
  const preview = formatCapacityCardPreview(0, regularCapacity, overbook);

  return (
    <>
      {showCapacityInput && (
        <label className="course-editor-field-label">
          Reguläre Kapazität
          <input
            type="number"
            aria-label="Reguläre Kapazität"
            min={0}
            value={capacity}
            onChange={(event) => onCapacityChange?.(event.target.value)}
            disabled={saving || capacityDisabled}
            className="dialog-field"
          />
        </label>
      )}
      {!showCapacityInput && (
        <p className="course-editor-inline-hint">
          Reguläre Kapazität: <strong>{regularCapacity}</strong> (nur Admin änderbar)
        </p>
      )}
      <label className="course-editor-field-label">
        Überplanung (zusätzliche Plätze)
        <input
          type="number"
          aria-label="Überplanung"
          min={0}
          value={overbookLimit}
          onChange={(event) => onOverbookLimitChange(event.target.value)}
          disabled={saving}
          className="dialog-field"
        />
      </label>
      <div className="course-capacity-breakdown" role="note">
        <p className="course-capacity-breakdown-title">Kapazität — Kurz erklärt</p>
        <p className="course-editor-inline-hint" style={{ marginTop: 0 }}>
          Anzeige in der Kurskarte (Beispiel): <strong>{preview}</strong>
        </p>
        <ul className="course-capacity-breakdown-list">
          <li>
            <strong>Erste Zahl</strong> (links): Teilnehmer im gewählten Termin — kann die reguläre Kapazität
            überschreiten.
          </li>
          <li>
            <strong>Zweite Zahl</strong> (rechts): reguläre Kapazität; die Warteliste rückt nur nach, wenn weniger
            Teilnehmer eingetragen sind als diese Zahl.
          </li>
          {overbook > 0 && (
            <li>
              <strong>(+{overbook})</strong>: zusätzliche Überplanungsplätze (nur für Admin/Trainerin in der Karte
              sichtbar).
            </li>
          )}
          <li>
            <strong>Maximal im Raum:</strong> {maxCapacity} Plätze ({regularCapacity}
            {overbook > 0 ? ` + ${overbook} Überplanung` : ""}).
          </li>
        </ul>
      </div>
    </>
  );
}
