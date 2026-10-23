import type { UserRole } from "shared/types";

export type InstructorCandidate = {
  userId: string;
  displayName?: string;
  role?: UserRole;
};

type CourseInstructorsFieldProps = {
  selected: string[];
  candidates: InstructorCandidate[];
  disabled?: boolean;
  loading?: boolean;
  onChange: (next: string[]) => void;
};

function roleLabel(role?: UserRole): string {
  if (role === "admin") return "Admin";
  if (role === "instructor") return "Kursleitung";
  return "";
}

function equalsIgnoreCase(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Multi-select for course.instructors (Admin + Kursleitung). */
export default function CourseInstructorsField({
  selected,
  candidates,
  disabled = false,
  loading = false,
  onChange,
}: CourseInstructorsFieldProps) {
  const selectedKeys = new Set(selected.map((entry) => entry.trim().toLowerCase()));

  const toggle = (userId: string) => {
    const trimmed = userId.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (selectedKeys.has(key)) {
      onChange(selected.filter((entry) => !equalsIgnoreCase(entry, trimmed)));
      return;
    }
    onChange([...selected, trimmed]);
  };

  // Keep assigned people visible even if role later changed.
  const orphanSelected = selected.filter(
    (entry) => !candidates.some((candidate) => equalsIgnoreCase(candidate.userId, entry)),
  );

  return (
    <fieldset className="course-instructors-field" disabled={disabled || loading}>
      <legend className="course-instructors-legend">Kursleitung</legend>
      <p className="course-editor-inline-hint" style={{ marginTop: 0 }}>
        Optional. Sichtbar auf der Kurskachel; steuert u. a. den Filter „meine Kurse“.
      </p>
      {loading ? (
        <p className="muted small" style={{ margin: 0 }}>
          Lade Mitglieder…
        </p>
      ) : candidates.length === 0 && orphanSelected.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Keine Admin- oder Kursleitungs-Mitglieder im Studio.
        </p>
      ) : (
        <ul className="course-instructors-list">
          {candidates.map((candidate) => {
            const checked = selectedKeys.has(candidate.userId.trim().toLowerCase());
            const label = candidate.displayName?.trim() || candidate.userId;
            const role = roleLabel(candidate.role);
            return (
              <li key={candidate.userId}>
                <label className="course-instructors-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled || loading}
                    onChange={() => toggle(candidate.userId)}
                    aria-label={
                      role
                        ? `Kursleitung ${label}, Rolle ${role}`
                        : `Kursleitung ${label}`
                    }
                  />
                  <span className="course-instructors-option-text">
                    <span>{label}</span>
                    {role ? <span className="muted small"> · {role}</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
          {orphanSelected.map((userId) => (
            <li key={`orphan-${userId}`}>
              <label className="course-instructors-option">
                <input
                  type="checkbox"
                  checked
                  disabled={disabled || loading}
                  onChange={() => toggle(userId)}
                  aria-label={`Kursleitung ${userId} (nicht mehr Admin/Kursleitung)`}
                />
                <span className="course-instructors-option-text">
                  <span>{userId}</span>
                  <span className="muted small"> · nicht mehr Admin/Kursleitung</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
