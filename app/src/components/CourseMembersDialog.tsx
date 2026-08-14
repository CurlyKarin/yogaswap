import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CourseModalFrame from "./CourseModalFrame";
import type { ParticipantWithStatus } from "../api/participants";
import { getParticipants } from "../api/participants";
import { filterParticipantsBySearch, getStatusPresentation } from "../lib/participants";
import {
  classifyMembersForDialog,
  findOpenEnrollmentForUser,
  formatMembersDialogHeadline,
  isEnrollmentOpen,
  stemOnDate,
  type EnrollmentChange,
} from "shared/courseEnrollment";
import type { CourseEnrollment, CourseStatus } from "shared/types";
import { formatIsoDateForDisplay } from "./courseDatesDialogUtils";
import {
  diffEnrollmentChanges,
  membersDialogReferenceIso,
  nextCourseTermIso,
  openRosterUserIds,
  syntheticOpenEnrollments,
  termOptionsForSelect,
  toIsoDateOnlyLocal,
} from "../lib/courseMembersDialogModel";

type CourseMembersDialogProps = {
  open: boolean;
  saving: boolean;
  courseName?: string;
  courseId?: number;
  courseStatus?: CourseStatus;
  courseDates?: string[];
  courseTime?: string;
  enrollments?: CourseEnrollment[];
  maxCapacity: number;
  initialParticipants: string[];
  formError?: string | null;
  modalRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onClose: () => void;
  onSaveParticipants: (
    courseId: number,
    participants: string[],
    enrollmentChanges?: EnrollmentChange[],
  ) => Promise<void> | void;
};

const EMPTY_DATES: string[] = [];
const EMPTY_ENROLLMENTS: CourseEnrollment[] = [];

export default function CourseMembersDialog({
  open,
  saving,
  courseName,
  courseId,
  courseStatus = "draft",
  courseDates = EMPTY_DATES,
  courseTime = "00:00",
  enrollments = EMPTY_ENROLLMENTS,
  maxCapacity,
  initialParticipants,
  formError,
  modalRef,
  onKeyDown,
  onClose,
  onSaveParticipants,
}: CourseMembersDialogProps) {
  const isDraft = courseStatus === "draft";
  const isInactive = courseStatus === "inactive";
  const isIntervalUi = !isDraft;

  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);
  const [participants, setParticipants] = useState<ParticipantWithStatus[]>([]);
  const [search, setSearch] = useState("");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [workingEnrollments, setWorkingEnrollments] = useState<CourseEnrollment[]>([]);
  const [lowerListOpen, setLowerListOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeListIndex, setActiveListIndex] = useState(0);
  const [listHasFocus, setListHasFocus] = useState(false);
  const listBoxRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pointerPrimedSelectionRef = useRef(false);
  const listItemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const refIso = useMemo(
    () => membersDialogReferenceIso({ status: courseStatus, dates: courseDates }),
    [courseStatus, courseDates],
  );
  const defaultAddFrom = useMemo(
    () => nextCourseTermIso(courseDates, courseTime),
    [courseDates, courseTime],
  );
  const defaultRemoveUntil = toIsoDateOnlyLocal();

  useEffect(() => {
    if (!open) return;
    setSelectedParticipants(Array.from(new Set(initialParticipants)).sort((a, b) => a.localeCompare(b)));
    const forCourse = (enrollments ?? []).filter((entry) => entry.courseId === courseId);
    if (forCourse.length > 0) {
      setWorkingEnrollments(forCourse);
    } else {
      setWorkingEnrollments(syntheticOpenEnrollments(courseId ?? 0, initialParticipants));
    }
    setSearch("");
    setLocalError(null);
    setParticipantsLoaded(false);
    setLowerListOpen(false);
    setActiveListIndex(0);
  }, [open, initialParticipants, enrollments, courseId]);

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

  const groups = useMemo(
    () => classifyMembersForDialog(workingEnrollments, refIso),
    [workingEnrollments, refIso],
  );
  const rosterIds = useMemo(
    () => new Set(openRosterUserIds(workingEnrollments, refIso).map((id) => id.toLowerCase())),
    [workingEnrollments, refIso],
  );

  const filteredParticipants = useMemo(() => {
    const searched = filterParticipantsBySearch(availableParticipants, search);
    if (!isIntervalUi) return searched;
    return searched.filter((entry) => !rosterIds.has(entry.userId.toLowerCase()));
  }, [availableParticipants, search, isIntervalUi, rosterIds]);

  const profileById = useMemo(
    () => new Map(availableParticipants.map((entry) => [entry.userId.toLowerCase(), entry])),
    [availableParticipants],
  );

  const headline = isIntervalUi
    ? formatMembersDialogHeadline({
        dabeiCount: groups.dabei.length,
        capacity: maxCapacity,
        endingCount: groups.dabei.filter((row) => row.ending).length,
        incomingCount: groups.kommt.length,
        showIncoming: !isInactive,
      })
    : `Zugeordnet: ${selectedParticipants.length} / ${maxCapacity}`;

  const toggleDraftParticipant = (userId: string) => {
    if (saving) return;
    const alreadySelected = selectedParticipants.some((entry) => entry.toLowerCase() === userId.toLowerCase());
    if (!alreadySelected && selectedParticipants.length >= maxCapacity) {
      setLocalError(`Maximal ${maxCapacity} Teilnehmer können zugeordnet werden.`);
      return;
    }
    setSelectedParticipants((prev) => {
      const exists = prev.some((entry) => entry.toLowerCase() === userId.toLowerCase());
      if (exists) return prev.filter((entry) => entry.toLowerCase() !== userId.toLowerCase());
      return [...prev, userId].sort((a, b) => a.localeCompare(b));
    });
    setLocalError(null);
  };

  const addIntervalMember = (userId: string, validFrom = defaultAddFrom) => {
    if (saving || isInactive) return;
    if (rosterIds.has(userId.toLowerCase())) return;
    const occupancyDate = validFrom <= refIso ? refIso : validFrom;
    const occupancy = stemOnDate(
      [...workingEnrollments, { courseId: courseId ?? 0, userId, validFrom }],
      occupancyDate,
    ).length;
    if (occupancy > maxCapacity) {
      setLocalError(`Maximal ${maxCapacity} Teilnehmer können zugeordnet werden.`);
      return;
    }
    setWorkingEnrollments((prev) => {
      if (findOpenEnrollmentForUser(prev, userId)) return prev;
      return [...prev, { courseId: courseId ?? 0, userId, validFrom }];
    });
    setLocalError(null);
  };

  const removeIntervalMember = (userId: string, validUntil = defaultRemoveUntil) => {
    if (saving) return;
    setWorkingEnrollments((prev) =>
      prev.map((entry) => {
        if (entry.userId.toLowerCase() !== userId.toLowerCase()) return entry;
        if (!isEnrollmentOpen(entry)) return entry;
        return { ...entry, validUntil };
      }),
    );
    setLocalError(null);
  };

  const undoIntervalRemove = (userId: string) => {
    if (saving || isInactive) return;
    setWorkingEnrollments((prev) =>
      prev.map((entry) => {
        if (entry.userId.toLowerCase() !== userId.toLowerCase()) return entry;
        if (!entry.validUntil) return entry;
        const reopened = { ...entry };
        delete reopened.validUntil;
        return reopened;
      }),
    );
  };

  const dropUpcomingMember = (userId: string) => {
    if (saving) return;
    setWorkingEnrollments((prev) => {
      const open = findOpenEnrollmentForUser(prev, userId);
      if (open && open.validFrom > refIso) {
        return prev.filter(
          (entry) =>
            !(
              entry.userId.toLowerCase() === userId.toLowerCase() &&
              entry.validFrom === open.validFrom &&
              isEnrollmentOpen(entry)
            ),
        );
      }
      return prev.map((entry) =>
        entry.userId.toLowerCase() === userId.toLowerCase() && isEnrollmentOpen(entry)
          ? { ...entry, validUntil: defaultRemoveUntil }
          : entry,
      );
    });
  };

  const updateMemberDate = (userId: string, field: "validFrom" | "validUntil", dateIso: string) => {
    if (saving || isInactive) return;
    setWorkingEnrollments((prev) =>
      prev.map((entry) => {
        if (entry.userId.toLowerCase() !== userId.toLowerCase()) return entry;
        if (field === "validFrom" && isEnrollmentOpen(entry)) {
          return { ...entry, validFrom: dateIso };
        }
        if (field === "validUntil" && (isEnrollmentOpen(entry) || entry.validUntil)) {
          return { ...entry, validUntil: dateIso };
        }
        return entry;
      }),
    );
  };

  const handleSave = async () => {
    if (!courseId) return;
    if (isDraft) {
      if (selectedParticipants.length > maxCapacity) {
        setLocalError(`Maximal ${maxCapacity} Teilnehmer können zugeordnet werden.`);
        return;
      }
      await onSaveParticipants(courseId, selectedParticipants);
      return;
    }
    const participantsToSave = openRosterUserIds(workingEnrollments, refIso);
    if (groups.dabei.length > maxCapacity) {
      setLocalError(`Maximal ${maxCapacity} Teilnehmer können zugeordnet werden.`);
      return;
    }
    const original =
      enrollments.filter((entry) => entry.courseId === courseId).length > 0
        ? enrollments.filter((entry) => entry.courseId === courseId)
        : syntheticOpenEnrollments(courseId, initialParticipants);
    const changes = diffEnrollmentChanges(original, workingEnrollments, refIso);
    await onSaveParticipants(courseId, participantsToSave, changes);
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
      if (!active) return;
      if (isDraft) toggleDraftParticipant(active.userId);
      else addIntervalMember(active.userId);
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
    if (isDraft) toggleDraftParticipant(userId);
    else addIntervalMember(userId);
  };

  if (!open || !courseName) return null;

  const dateOptions = termOptionsForSelect(courseDates, [defaultAddFrom, defaultRemoveUntil, refIso]);

  const renderUpperRow = (
    row: { userId: string; validFrom: string; validUntil?: string; ending: boolean },
    kind: "dabei" | "kommt",
  ) => {
    const profile = profileById.get(row.userId.toLowerCase());
    const status = getStatusPresentation(profile?.status);
    return (
      <div
        key={`${kind}-${row.userId}`}
        className={`course-members-row${kind === "kommt" ? " is-incoming" : ""}${row.ending ? " is-ending" : ""}`}
      >
        <button
          type="button"
          className="course-members-row-main"
          disabled={saving || isInactive}
          onClick={() => {
            if (isInactive) return;
            if (kind === "kommt") dropUpcomingMember(row.userId);
            else if (row.ending) undoIntervalRemove(row.userId);
            else removeIntervalMember(row.userId);
          }}
          aria-label={
            kind === "kommt"
              ? `${row.userId} wieder entfernen`
              : row.ending
                ? `${row.userId}: Ende zurücknehmen`
                : `${row.userId} bis ${defaultRemoveUntil} beenden`
          }
        >
          <span className="course-members-status-dot" style={{ background: status.color }} aria-hidden="true" />
          <strong>{row.userId}</strong>
          {profile ? ` — ${status.label}` : " — nicht mehr vorhanden"}
        </button>
        {kind === "kommt" ? (
          <label className="course-members-date">
            ab
            <select
              value={row.validFrom}
              disabled={saving || isInactive}
              aria-label={`${row.userId} gültig ab`}
              onChange={(event) => updateMemberDate(row.userId, "validFrom", event.target.value)}
            >
              {termOptionsForSelect(dateOptions, [row.validFrom]).map((iso) => (
                <option key={iso} value={iso}>
                  {formatIsoDateForDisplay(iso)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="course-members-date">
            bis
            <select
              value={row.validUntil ?? ""}
              disabled={saving || isInactive}
              aria-label={`${row.userId} gültig bis`}
              onChange={(event) => {
                const next = event.target.value;
                if (!next) undoIntervalRemove(row.userId);
                else if (row.ending) updateMemberDate(row.userId, "validUntil", next);
                else removeIntervalMember(row.userId, next);
              }}
            >
              <option value="">offen</option>
              {termOptionsForSelect(dateOptions, [row.validUntil]).map((iso) => (
                <option key={iso} value={iso}>
                  {formatIsoDateForDisplay(iso)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  };

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
          {headline}
        </p>

        {isIntervalUi && (
          <div className="course-members-upper">
            {groups.dabei.length === 0 && groups.kommt.length === 0 ? (
              <p className="course-editor-note">Noch keine Teilnehmer zugeordnet.</p>
            ) : (
              <>
                {groups.dabei.map((row) => renderUpperRow(row, "dabei"))}
                {!isInactive && groups.kommt.map((row) => renderUpperRow(row, "kommt"))}
              </>
            )}
          </div>
        )}

        {isIntervalUi && (
          <button
            type="button"
            className="course-members-lower-toggle"
            aria-expanded={lowerListOpen}
            onClick={() => setLowerListOpen((openLower) => !openLower)}
          >
            {lowerListOpen ? "Weitere Mitglieder einklappen" : "Weitere Mitglieder (nicht dabei / ehemals)"}
          </button>
        )}

        {(!isIntervalUi || lowerListOpen) && (
          <div className="dialog-search-block">
            <input
              ref={searchInputRef}
              type="search"
              aria-label="Mitglieder suchen"
              placeholder="Mitglieder suchen (Nickname oder E-Mail)"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={saving}
              className="dialog-field dialog-search-field"
            />
            <p id="course-members-list-hint" className="course-editor-note dialog-search-hint dialog-search-hint-mobile-a11y">
              Tastatur: Tab zur Liste, Pfeile hoch/runter, Leertaste oder Enter zum Zuordnen.
            </p>
          </div>
        )}

        {isDraft && (
          <>
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
                aria-describedby="course-members-list-hint"
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
                  const checked = selectedParticipants.some(
                    (value) => value.toLowerCase() === entry.userId.toLowerCase(),
                  );
                  const atCapacity = selectedParticipants.length >= maxCapacity;
                  const isActive = index === activeListIndex;
                  const status = getStatusPresentation(entry.status);
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
                        padding: "6px 8px",
                        cursor: "pointer",
                        borderRadius: 4,
                        background: checked ? "#ecfdf5" : isActive ? "#eff6ff" : "transparent",
                        border: checked ? "1px solid #86efac" : "1px solid transparent",
                        opacity: !checked && atCapacity ? 0.6 : 1,
                      }}
                      onMouseEnter={() => setActiveListIndex(index)}
                      onMouseDownCapture={() => {
                        pointerPrimedSelectionRef.current = document.activeElement !== listBoxRef.current;
                      }}
                      onClick={() => handleParticipantOptionClick(index, entry.userId)}
                      title={entry.email ? `${entry.userId} (${entry.email})` : entry.userId}
                    >
                      <div
                        ref={(element) => {
                          listItemRefs.current[index] = element;
                        }}
                        aria-hidden="true"
                        className="course-members-status-dot"
                        style={{ background: status.color }}
                      />
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <strong>{entry.userId}</strong>
                        {checked && (
                          <span style={{ fontSize: 12, color: "#166534", fontWeight: 600 }} aria-label="zugeordnet">
                            ✓ zugeordnet
                          </span>
                        )}
                        {` - ${status.label}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {isIntervalUi && lowerListOpen && (
          <>
            {loadingParticipants ? (
              <p className="course-editor-note">Mitglieder laden...</p>
            ) : filteredParticipants.length === 0 && groups.ehemalig.length === 0 ? (
              <p className="course-editor-note">Keine weiteren Mitglieder.</p>
            ) : (
              <div
                ref={listBoxRef}
                style={{ maxHeight: 240, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}
                role="listbox"
                aria-label="Weitere Mitglieder"
                aria-describedby="course-members-list-hint"
                tabIndex={0}
                onKeyDown={handleParticipantListKeyDown}
                onFocus={() => setListHasFocus(true)}
                onBlur={() => setListHasFocus(false)}
                className={listHasFocus ? "course-members-listbox is-focused" : "course-members-listbox"}
              >
                {groups.ehemalig.map((row) => {
                  const profile = profileById.get(row.userId.toLowerCase());
                  return (
                    <div key={`ex-${row.userId}`} className="course-members-row course-members-row-former">
                      <span>
                        <strong>{row.userId}</strong>
                        {row.validUntil ? ` — ehemals bis ${formatIsoDateForDisplay(row.validUntil)}` : ""}
                        {profile ? "" : " (nicht mehr vorhanden)"}
                      </span>
                      {!isInactive && (
                        <button
                          type="button"
                          className="modal-action-btn"
                          disabled={saving}
                          onClick={() => addIntervalMember(row.userId)}
                        >
                          Wieder aufnehmen
                        </button>
                      )}
                    </div>
                  );
                })}
                {filteredParticipants.map((entry, index) => {
                  const status = getStatusPresentation(entry.status);
                  const isActive = index === activeListIndex;
                  return (
                    <div
                      key={entry.userId}
                      id={`participant-option-${entry.userId.toLowerCase()}`}
                      role="option"
                      aria-selected={isActive}
                      className="course-members-row"
                      style={{
                        cursor: isInactive ? "default" : "pointer",
                        background: isActive ? "#eff6ff" : "transparent",
                      }}
                      onMouseEnter={() => setActiveListIndex(index)}
                      onMouseDownCapture={() => {
                        pointerPrimedSelectionRef.current = document.activeElement !== listBoxRef.current;
                      }}
                      onClick={() => {
                        if (isInactive) return;
                        handleParticipantOptionClick(index, entry.userId);
                      }}
                    >
                      <span className="course-members-status-dot" style={{ background: status.color }} aria-hidden="true" />
                      <span>
                        <strong>{entry.userId}</strong>
                        {` - ${status.label}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {isDraft && selectedParticipants.length >= maxCapacity && (
          <p className="course-editor-note">Kapazität erreicht. Für weitere Auswahl zuerst abwählen.</p>
        )}
        {isIntervalUi && groups.dabei.length >= maxCapacity && (
          <p className="course-editor-note">Kapazität am Referenzdatum erreicht.</p>
        )}
        {participantsLoaded && isDraft && (
          <StaleNote
            selected={selectedParticipants}
            availableIds={new Set(availableParticipants.map((entry) => entry.userId.toLowerCase()))}
          />
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
          disabled={
            saving ||
            loadingParticipants ||
            !courseId ||
            (isDraft && selectedParticipants.length > maxCapacity) ||
            (!isDraft && groups.dabei.length > maxCapacity)
          }
        >
          {saving ? "Speichere..." : "Mitglieder speichern"}
        </button>
      </div>
    </CourseModalFrame>
  );
}

function StaleNote({ selected, availableIds }: { selected: string[]; availableIds: Set<string> }) {
  const stale = selected.filter((entry) => !availableIds.has(entry.toLowerCase()));
  if (stale.length === 0) return null;
  return (
    <p className="course-editor-note">
      Nicht mehr vorhandene Zuordnungen: {stale.join(", ")}
    </p>
  );
}
