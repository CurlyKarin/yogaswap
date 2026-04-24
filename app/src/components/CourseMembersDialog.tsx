import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const [activeListIndex, setActiveListIndex] = useState(0);
  const [listHasFocus, setListHasFocus] = useState(false);
  const listBoxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pointerPrimedSelectionRef = useRef(false);
  const listItemRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    setSelectedParticipants(Array.from(new Set(initialParticipants)).sort((a, b) => a.localeCompare(b)));
    setSearch("");
    setLocalError(null);
    setParticipantsLoaded(false);
    setArmedRemovalUserId(null);
    setArmedStaleRemovalUserId(null);
    setActiveListIndex(0);
  }, [open, initialParticipants]);

  useLayoutEffect(() => {
    if (!open || !courseName) return;
    searchInputRef.current?.focus();
  }, [open, courseName]);

  useEffect(() => {
    if (!open) return;
    if (!modalRef.current) return;
    const guardId = window.setTimeout(() => {
      if (!modalRef.current) return;
      const active = document.activeElement as Node | null;
      if (active && modalRef.current.contains(active)) return;
      searchInputRef.current?.focus();
      if (document.activeElement !== searchInputRef.current) {
        modalRef.current.focus();
      }
    }, 0);
    return () => window.clearTimeout(guardId);
  }, [open, loadingParticipants, modalRef]);

  useEffect(() => {
    if (!open) return;

    const clearArmed = () => {
      setArmedRemovalUserId(null);
      setArmedStaleRemovalUserId(null);
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const chip = target?.closest("[data-removal-chip='true']") as HTMLElement | null;
      if (chip) {
        const chipUserId = chip.dataset.removalUserId?.toLowerCase();
        const chipKind = chip.dataset.removalKind;
        const selectedArmed = armedRemovalUserId?.toLowerCase();
        const staleArmed = armedStaleRemovalUserId?.toLowerCase();
        const keepSelected = chipKind === "selected" && !!chipUserId && chipUserId === selectedArmed;
        const keepStale = chipKind === "stale" && !!chipUserId && chipUserId === staleArmed;
        if (keepSelected || keepStale) return;
      } else {
        clearArmed();
        return;
      }
      clearArmed();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const chip = target?.closest("[data-removal-chip='true']") as HTMLElement | null;
      if (chip) {
        const chipUserId = chip.dataset.removalUserId?.toLowerCase();
        const chipKind = chip.dataset.removalKind;
        const selectedArmed = armedRemovalUserId?.toLowerCase();
        const staleArmed = armedStaleRemovalUserId?.toLowerCase();
        const keepSelected = chipKind === "selected" && !!chipUserId && chipUserId === selectedArmed;
        const keepStale = chipKind === "stale" && !!chipUserId && chipUserId === staleArmed;
        if (keepSelected || keepStale) return;
      } else {
        clearArmed();
        return;
      }
      clearArmed();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open, armedRemovalUserId, armedStaleRemovalUserId]);

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

  useEffect(() => {
    if (!open) return;
    if (filteredParticipants.length === 0) {
      setActiveListIndex(0);
      return;
    }
    setActiveListIndex((prev) => Math.max(0, Math.min(prev, filteredParticipants.length - 1)));
  }, [open, filteredParticipants.length]);

  useEffect(() => {
    const activeInput = listItemRefs.current[activeListIndex];
    if (activeInput && typeof activeInput.scrollIntoView === "function") {
      activeInput.scrollIntoView({ block: "nearest" });
    }
  }, [activeListIndex]);

  const handleParticipantListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (filteredParticipants.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveListIndex((prev) => Math.min(prev + 1, filteredParticipants.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveListIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const active = filteredParticipants[activeListIndex];
      if (active) toggleParticipant(active.userId);
    }
  };

  const handleParticipantOptionClick = (index: number, userId: string) => {
    if (pointerPrimedSelectionRef.current) {
      pointerPrimedSelectionRef.current = false;
      listBoxRef.current?.focus();
      setActiveListIndex(index);
      return;
    }

    const listHasCurrentFocus = document.activeElement === listBoxRef.current;
    if (!listHasCurrentFocus) {
      listBoxRef.current?.focus();
      setActiveListIndex(index);
      return;
    }
    if (activeListIndex !== index) {
      setActiveListIndex(index);
      return;
    }
    toggleParticipant(userId);
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
                  data-removal-chip="true"
                  data-removal-kind="selected"
                  data-removal-user-id={entry.userId.toLowerCase()}
                  className="course-editor-inline-action"
                  tabIndex={-1}
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
                    padding: "1px 6px",
                    background:
                      armedRemovalUserId?.toLowerCase() === entry.userId.toLowerCase() ? "#fee2e2" : "#f9fafb",
                    color: "#111827",
                    fontSize: 13,
                    lineHeight: 1.1,
                    width: "auto",
                    minWidth: 0,
                    flex: "0 0 auto",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span>
                    {entry.userId}
                    {entry.exists ? "" : " (nicht mehr vorhanden)"}
                  </span>
                  {armedRemovalUserId?.toLowerCase() === entry.userId.toLowerCase() && (
                    <span
                      style={{
                        color: "#b91c1c",
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1,
                        width: 14,
                        textAlign: "center",
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={searchInputRef}
          type="text"
          aria-label="Mitglieder suchen"
          placeholder="Mitglieder suchen (Nickname oder E-Mail)"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={saving}
          className="dialog-field"
        />
        <p className="course-editor-note" style={{ marginTop: -4 }}>
          Tastatur: Tab zur Liste, Pfeile hoch/runter, Leertaste oder Enter zum Zuordnen.
        </p>
        {loadingParticipants ? (
          <p className="course-editor-note">Mitglieder laden...</p>
        ) : filteredParticipants.length === 0 ? (
          <p className="course-editor-note">Keine passenden Mitglieder gefunden.</p>
        ) : (
          <div
            ref={listBoxRef}
            style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}
            role="listbox"
            aria-label="Teilnehmerliste"
            aria-activedescendant={
              filteredParticipants[activeListIndex]
                ? `participant-option-${filteredParticipants[activeListIndex].userId.toLowerCase()}`
                : undefined
            }
            tabIndex={0}
            onKeyDown={handleParticipantListKeyDown}
            onFocus={() => {
              setListHasFocus(true);
              if (filteredParticipants.length > 0) {
                setActiveListIndex((prev) => Math.max(0, Math.min(prev, filteredParticipants.length - 1)));
              }
            }}
            onBlur={() => setListHasFocus(false)}
            className={listHasFocus ? "course-members-listbox is-focused" : "course-members-listbox"}
          >
            {filteredParticipants.map((entry, index) => {
              const checked = selectedParticipants.some((value) => value.toLowerCase() === entry.userId.toLowerCase());
              const atCapacity = selectedParticipants.length >= capacity;
              const isActive = index === activeListIndex;
              return (
                <div
                  key={entry.userId}
                  id={`participant-option-${entry.userId.toLowerCase()}`}
                  role="option"
                  aria-selected={isActive}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 0",
                    cursor: "pointer",
                    borderRadius: 4,
                    background: isActive ? "#eff6ff" : "transparent",
                    opacity: !checked && atCapacity ? 0.6 : 1,
                  }}
                  onMouseEnter={() => setActiveListIndex(index)}
                  onMouseDownCapture={() => {
                    pointerPrimedSelectionRef.current = document.activeElement !== listBoxRef.current;
                  }}
                  onClick={() => handleParticipantOptionClick(index, entry.userId)}
                >
                  <div
                    ref={(element) => {
                      listItemRefs.current[index] = element;
                    }}
                    aria-hidden="true"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: "1px solid #9ca3af",
                      background: checked ? "#2563eb" : "#fff",
                      boxShadow: checked ? "inset 0 0 0 2px #fff" : "none",
                      flex: "0 0 16px",
                    }}
                  />
                  <span>
                    <strong>{entry.userId}</strong>
                    {entry.email ? ` (${entry.email})` : ""}
                    {` - ${entry.status}`}
                  </span>
                </div>
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
                  data-removal-chip="true"
                  data-removal-kind="stale"
                  data-removal-user-id={entry.toLowerCase()}
                  className="course-editor-inline-action"
                  tabIndex={-1}
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
                    padding: "1px 6px",
                    background: "#fff1f2",
                    color: "#881337",
                    fontSize: 13,
                    lineHeight: 1.1,
                    width: "auto",
                    minWidth: 0,
                    flex: "0 0 auto",
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span>{entry}</span>
                  {armedStaleRemovalUserId?.toLowerCase() === entry.toLowerCase() && (
                    <span
                      style={{
                        color: "#b91c1c",
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1,
                        width: 14,
                        textAlign: "center",
                      }}
                    >
                      ×
                    </span>
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
