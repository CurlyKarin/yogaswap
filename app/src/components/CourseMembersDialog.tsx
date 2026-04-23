import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import CourseModalFrame from "./CourseModalFrame";
import type { ParticipantWithStatus } from "../api/participants";
import { getParticipants } from "../api/participants";

type CourseMembersDialogProps = {
  open: boolean;
  saving: boolean;
  courseName?: string;
  courseId?: number;
  capacity: number;
  initialParticipants: string[];
  formError?: string | null;
  modalRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onSaveParticipants: (courseId: number, participants: string[]) => Promise<void> | void;
};

export default function CourseMembersDialog({
  open,
  saving,
  courseName,
  courseId,
  capacity,
  initialParticipants,
  formError,
  modalRef,
  onKeyDown,
  onClose,
  onSaveParticipants,
}: CourseMembersDialogProps) {
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [participants, setParticipants] = useState<ParticipantWithStatus[]>([]);
  const [search, setSearch] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [armedRemovalUserId, setArmedRemovalUserId] = useState<string | null>(null);
  const [armedStaleRemovalUserId, setArmedStaleRemovalUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedParticipants(Array.from(new Set(initialParticipants)).sort((a, b) => a.localeCompare(b)));
    setSearch("");
    setLocalError(null);
    setParticipantsLoaded(false);
    setArmedRemovalUserId(null);
    setArmedStaleRemovalUserId(null);
  }, [open, initialParticipants]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadParticipants = async () => {
      setLoadingParticipants(true);
      try {
        const items = await getParticipants({ includeOrphaned: false });
        if (cancelled) return;
        setParticipants(items);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load participants for course members dialog", error);
        setLocalError("Teilnehmer konnten nicht geladen werden.");
      } finally {
        if (!cancelled) {
          setLoadingParticipants(false);
          setParticipantsLoaded(true);
        }
      }
    };
    loadParticipants();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const availableParticipants = useMemo(
    () => participants.filter((entry) => (entry.role ?? "participant") === "participant"),
    [participants],
  );

  const filteredParticipants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return availableParticipants;
    return availableParticipants.filter((entry) => {
      const byUserId = entry.userId.toLowerCase().includes(needle);
      const byEmail = (entry.email ?? "").toLowerCase().includes(needle);
      return byUserId || byEmail;
    });
  }, [availableParticipants, search]);

  const selectedParticipantProfiles = useMemo(() => {
    const byId = new Map(availableParticipants.map((entry) => [entry.userId.toLowerCase(), entry]));
    return selectedParticipants.map((userId) => {
      const profile = byId.get(userId.toLowerCase());
      return {
        userId,
        email: profile?.email,
        status: profile?.status,
        exists: !!profile,
      };
    });
  }, [availableParticipants, selectedParticipants]);

  const availableUserIds = useMemo(
    () => new Set(availableParticipants.map((entry) => entry.userId.toLowerCase())),
    [availableParticipants],
  );

  const staleAssignments = useMemo(
    () =>
      participantsLoaded
        ? selectedParticipants.filter((entry) => !availableUserIds.has(entry.toLowerCase()))
        : [],
    [selectedParticipants, availableUserIds, participantsLoaded],
  );

  const toggleParticipant = (userId: string) => {
    if (saving) return;
    const alreadySelected = selectedParticipants.some((entry) => entry.toLowerCase() === userId.toLowerCase());
    if (!alreadySelected && selectedParticipants.length >= capacity) {
      setLocalError(`Maximal ${capacity} Teilnehmer können zugeordnet werden.`);
      return;
    }

    setSelectedParticipants((prev) => {
      const exists = prev.some((entry) => entry.toLowerCase() === userId.toLowerCase());
      if (exists) return prev.filter((entry) => entry.toLowerCase() !== userId.toLowerCase());
      return [...prev, userId].sort((a, b) => a.localeCompare(b));
    });
    setArmedRemovalUserId(null);
    setLocalError(null);
  };

  const removeStaleParticipant = (userId: string) => {
    if (saving) return;
    setSelectedParticipants((prev) => prev.filter((entry) => entry.toLowerCase() !== userId.toLowerCase()));
    setArmedStaleRemovalUserId(null);
  };

  const handleSelectedChipClick = (userId: string) => {
    const armed = armedRemovalUserId?.toLowerCase() === userId.toLowerCase();
    if (armed) {
      toggleParticipant(userId);
      return;
    }
    setArmedRemovalUserId(userId);
  };

  const handleStaleChipClick = (userId: string) => {
    const armed = armedStaleRemovalUserId?.toLowerCase() === userId.toLowerCase();
    if (armed) {
      removeStaleParticipant(userId);
      return;
    }
    setArmedStaleRemovalUserId(userId);
  };

  const handleSave = async () => {
    if (!courseId) return;
    if (selectedParticipants.length > capacity) {
      setLocalError(`Maximal ${capacity} Teilnehmer können zugeordnet werden.`);
      return;
    }
    await onSaveParticipants(courseId, selectedParticipants);
  };

  if (!open || !courseName) return null;

  return (
    <CourseModalFrame
      ariaLabel="Kursmitglieder bearbeiten"
      title="Mitglieder verwalten"
      modalRef={modalRef}
      onKeyDown={onKeyDown}
    >
      <p className="course-editor-note">
        Kurs: <strong>{courseName}</strong>
      </p>
      <div className="dialog-stack">
        <p className="course-editor-note" style={{ marginTop: 0 }}>
          Zugeordnet: <strong>{selectedParticipants.length}</strong> / {capacity}
        </p>
        <div>
          <p className="course-editor-note" style={{ marginBottom: 4 }}>
            Ausgewählte Teilnehmer:
          </p>
          {selectedParticipantProfiles.length === 0 ? (
            <p className="course-editor-note">Noch keine Teilnehmer ausgewählt.</p>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {selectedParticipantProfiles.map((entry) => (
                <button
                  key={entry.userId}
                  type="button"
                  className="course-editor-inline-action"
                  onClick={() => handleSelectedChipClick(entry.userId)}
                  onDoubleClick={() => toggleParticipant(entry.userId)}
                  disabled={saving}
                  aria-label={
                    armedRemovalUserId?.toLowerCase() === entry.userId.toLowerCase()
                      ? `Teilnehmer jetzt entfernen ${entry.userId}`
                      : `Teilnehmer zum Entfernen markieren ${entry.userId}`
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px solid #e5e7eb",
                    borderRadius: 999,
                    padding: "3px 8px",
                    background:
                      armedRemovalUserId?.toLowerCase() === entry.userId.toLowerCase() ? "#fee2e2" : "#f9fafb",
                    color: "#111827",
                    fontSize: 13,
                    lineHeight: 1.2,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span>
                    {entry.userId}
                    {entry.exists ? "" : " (nicht mehr vorhanden)"}
                  </span>
                  {armedRemovalUserId?.toLowerCase() === entry.userId.toLowerCase() && (
                    <span style={{ color: "#b91c1c", fontSize: 12 }}>nochmal klicken</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          type="text"
          aria-label="Mitglieder suchen"
          placeholder="Mitglieder suchen (Nickname oder E-Mail)"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={saving || loadingParticipants}
          className="dialog-field"
        />
        {loadingParticipants ? (
          <p className="course-editor-note">Mitglieder laden...</p>
        ) : filteredParticipants.length === 0 ? (
          <p className="course-editor-note">Keine passenden Mitglieder gefunden.</p>
        ) : (
          <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
            {filteredParticipants.map((entry) => {
              const checked = selectedParticipants.some((value) => value.toLowerCase() === entry.userId.toLowerCase());
              const atCapacity = selectedParticipants.length >= capacity;
              return (
                <label
                  key={entry.userId}
                  style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleParticipant(entry.userId)}
                    disabled={saving || (!checked && atCapacity)}
                  />
                  <span>
                    <strong>{entry.userId}</strong>
                    {entry.email ? ` (${entry.email})` : ""}
                    {` - ${entry.status}`}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {selectedParticipants.length >= capacity && (
          <p className="course-editor-note">Kapazität erreicht. Für weitere Auswahl zuerst abwählen.</p>
        )}
        {staleAssignments.length > 0 && (
          <div>
            <p className="course-editor-note" style={{ marginBottom: 4 }}>
              Nicht mehr vorhandene Zuordnungen:
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {staleAssignments.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className="course-editor-inline-action"
                  onClick={() => handleStaleChipClick(entry)}
                  onDoubleClick={() => removeStaleParticipant(entry)}
                  disabled={saving}
                  aria-label={
                    armedStaleRemovalUserId?.toLowerCase() === entry.toLowerCase()
                      ? `Veraltete Zuordnung jetzt entfernen ${entry}`
                      : `Veraltete Zuordnung zum Entfernen markieren ${entry}`
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    border: "1px solid #fca5a5",
                    borderRadius: 999,
                    padding: "3px 8px",
                    background: "#fff1f2",
                    color: "#881337",
                    fontSize: 13,
                    lineHeight: 1.2,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span>{entry}</span>
                  {armedStaleRemovalUserId?.toLowerCase() === entry.toLowerCase() && (
                    <span style={{ color: "#b91c1c", fontSize: 12 }}>nochmal klicken</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
        {(formError || localError) && <p style={{ color: "crimson", margin: 0 }}>{formError ?? localError}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-action-btn" onClick={onClose} disabled={saving}>
          Abbrechen
        </button>
        <button
          type="button"
          className="btn-primary modal-action-btn"
          onClick={handleSave}
          disabled={saving || loadingParticipants || !courseId || selectedParticipants.length > capacity}
        >
          {saving ? "Speichere..." : "Mitglieder speichern"}
        </button>
      </div>
    </CourseModalFrame>
  );
}
