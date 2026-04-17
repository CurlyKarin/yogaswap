import CourseCard from "./CourseCard";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  Course,
  CourseDateOverride,
  CourseStatus,
  Swap,
  User,
  Tenant,
  UserTenantMembership,
} from "shared/types";
import { getSwaps } from "../api/swaps";
import { getOverrides } from "../api/overrides";
import { getCourseDates } from "../lib/dates";
import {
  createCourse,
  deleteCourse,
  getCourses,
  updateCourse,
} from "../api/courses";
import { canSeeCourse } from "shared/permissions";

type Props = {
  currentUser: User;
  tenant?: Tenant;
  membership?: UserTenantMembership;
};

type CourseEditorState = {
  id: number;
  name: string;
  weekday: string;
  time: string;
  capacity: string;
  status: CourseStatus;
};

type CourseCreateState = {
  name: string;
  weekday: string;
  time: string;
  capacity: string;
  status: CourseStatus;
};

const WEEKDAY_ORDER: Record<string, number> = {
  Mon: 1,
  Monday: 1,
  Tue: 2,
  Tuesday: 2,
  Wed: 3,
  Wednesday: 3,
  Thu: 4,
  Thursday: 4,
  Fri: 5,
  Friday: 5,
  Sat: 6,
  Saturday: 6,
  Sun: 7,
  Sunday: 7,
};

const WEEKDAY_OPTIONS = [
  { value: "Mon", label: "Montag" },
  { value: "Tue", label: "Dienstag" },
  { value: "Wed", label: "Mittwoch" },
  { value: "Thu", label: "Donnerstag" },
  { value: "Fri", label: "Freitag" },
  { value: "Sat", label: "Samstag" },
  { value: "Sun", label: "Sonntag" },
] as const;

const STATUS_OPTIONS: Array<{ value: CourseStatus; label: string }> = [
  { value: "inactive", label: "Inaktiv" },
  { value: "draft", label: "In Planung" },
  { value: "active", label: "Aktiv" },
];

function sortCoursesForDisplay(a: Course, b: Course): number {
  const weekdayA = WEEKDAY_ORDER[a.weekday] ?? 99;
  const weekdayB = WEEKDAY_ORDER[b.weekday] ?? 99;
  if (weekdayA !== weekdayB) return weekdayA - weekdayB;
  if (a.time !== b.time) return a.time.localeCompare(b.time);
  return a.id - b.id;
}

function toEditorState(course: Course): CourseEditorState {
  return {
    id: course.id,
    name: course.name,
    weekday: course.weekday,
    time: course.time,
    capacity: String(course.capacity),
    status: course.status ?? "active",
  };
}

export default function CourseList({ currentUser, tenant, membership }: Props) {
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [overrides, setOverrides] = useState<CourseDateOverride[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CourseCreateState>({
    name: "",
    weekday: "Mon",
    time: "18:00",
    capacity: "10",
    status: "draft",
  });
  const [editState, setEditState] = useState<CourseEditorState | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

  const isAdmin = membership?.role === "admin";
  const isInstructor = membership?.role === "instructor";
  const canSeeCourseManagement = isAdmin || isInstructor;
  const canManageCourses = isAdmin;

  const fetchData = useCallback(async () => {
    try {
      console.log("Fetching courses, overrides, and swaps...", {
        user: currentUser.nickname,
      });
      setLoading(true);
      const [courseData, overrideData, swapsData] = await Promise.all([
        getCourses(),
        getOverrides(),
        getSwaps(currentUser.nickname),
      ]);

      console.log("Data fetched:", {
        courseData,
        overrideData,
        swapsData,
      });
      setCourses(courseData.sort(sortCoursesForDisplay));
      setOverrides(Array.isArray(overrideData) ? overrideData : []);
      setSwaps(swapsData);
      setError(null);
    } catch (err) {
      console.error("Error in fetchData:", err);
      setError("Failed to load data");
      setSwaps([]);
    } finally {
      setLoading(false);
    }
  }, [currentUser.nickname]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const {
    confirmSwap,
    requestSwap,
    cancelSwap,
    onToggleAbsence,
    overrides: filteredOverrides,
  } = useCourseSwaps(
    courses,
    overrides,
    setOverrides,
    swaps,
    setSwaps,
    currentUser,
    fetchData,
  );

  // 👉 Debug-Ausgabe bei jedem Swaps-Update
  useEffect(() => {
    console.log('🔄 Overrides updated:', overrides);
    console.log('🔄 Filtered Overrides:', filteredOverrides);
    console.log('🔄 Swaps updated:', swaps);
  }, [overrides, filteredOverrides, swaps]);

  useEffect(() => {
    console.log('useEffect ausgelöst für nickname:', currentUser?.nickname);
  }, [currentUser?.nickname]);

  const visibleCourses = useMemo(() => {
    if (!tenant?.settings || !membership) {
      return courses;
    }
    return courses.filter((course) =>
      canSeeCourse(membership, tenant.settings, course, {
        isTaughtByUser: (course.instructors ?? []).some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
        isBookedByUser: course.participants.some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
      }),
    );
  }, [courses, tenant?.settings, membership, currentUser.nickname]);

  const coursesWithUpcoming = visibleCourses.filter((c) => getCourseDates(c).length > 0);
  const coursesToRender = canSeeCourseManagement ? visibleCourses : coursesWithUpcoming;
  const deleteTargetCourse = deleteTargetId
    ? visibleCourses.find((course) => course.id === deleteTargetId)
    : undefined;

  const resetFormError = () => setFormError(null);

  const openCreateModal = () => {
    setCreateState({
      name: "",
      weekday: "Mon",
      time: "18:00",
      capacity: "10",
      status: "draft",
    });
    resetFormError();
    setCreateOpen(true);
  };

  const openEditModal = (course: Course) => {
    setEditState(toEditorState(course));
    resetFormError();
    setEditOpen(true);
  };

  const openDeleteModal = (courseId: number) => {
    setDeleteTargetId(courseId);
    resetFormError();
    setDeleteOpen(true);
  };

  const parseCapacity = (capacityText: string): number | null => {
    const parsed = Number.parseInt(capacityText, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
  };

  const saveCreateCourse = async () => {
    if (!canManageCourses) return;
    const trimmedName = createState.name.trim();
    if (!trimmedName) {
      setFormError("Bitte einen Kursnamen eingeben.");
      return;
    }
    const capacity = parseCapacity(createState.capacity);
    if (capacity == null) {
      setFormError("Kapazität muss eine nicht-negative ganze Zahl sein.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await createCourse({
        name: trimmedName,
        weekday: createState.weekday,
        time: createState.time,
        capacity,
        status: createState.status,
      });
      setCreateOpen(false);
      await fetchData();
    } catch (err) {
      console.error("Failed to create course", err);
      setFormError("Kurs konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  };

  const saveEditCourse = async () => {
    if (!canManageCourses || !editState) return;
    const trimmedName = editState.name.trim();
    if (!trimmedName) {
      setFormError("Bitte einen Kursnamen eingeben.");
      return;
    }
    const capacity = parseCapacity(editState.capacity);
    if (capacity == null) {
      setFormError("Kapazität muss eine nicht-negative ganze Zahl sein.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await updateCourse(editState.id, {
        name: trimmedName,
        weekday: editState.weekday,
        time: editState.time,
        capacity,
        status: editState.status,
      });
      setEditOpen(false);
      setEditState(null);
      await fetchData();
    } catch (err) {
      console.error("Failed to update course", err);
      setFormError(err instanceof Error ? err.message : "Kurs konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!canManageCourses || !deleteTargetId) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteCourse(deleteTargetId);
      setDeleteOpen(false);
      setDeleteTargetId(null);
      await fetchData();
    } catch (err) {
      console.error("Failed to delete course", err);
      setFormError(err instanceof Error ? err.message : "Kurs konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div role="status" aria-live="polite">
        Loading...
      </div>
    );
  }
  if (error) {
    return <div role="alert">{error}</div>;
  }

  if (visibleCourses.length === 0 || (!canSeeCourseManagement && coursesWithUpcoming.length === 0)) {
    return (
      <div className="muted" style={{ textAlign: "center", padding: "2rem" }} role="status" aria-live="polite">
        {canSeeCourseManagement
          ? "Aktuell sind noch keine Kurse angelegt."
          : "Aktuell keine Termine zum Anzeigen. Es gibt nur vergangene Termine oder noch keine Kurse."}
      </div>
    );
  }

  return (
    <>
      {canSeeCourseManagement && (
        <div className="course-management-toolbar">
          <div className="course-management-title-group">
            <h3 className="course-management-title">Kurse verwalten</h3>
            {!canManageCourses && (
              <span className="muted" style={{ fontSize: 12 }}>
                Nur Admin kann Kurse anlegen, bearbeiten oder löschen.
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={!canManageCourses || saving}
            title={canManageCourses ? "Neuen Kurs anlegen" : "Nur Admin kann Kurse anlegen"}
            aria-label="Kurs anlegen"
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Plus size={16} aria-hidden="true" />
              Kurs
            </span>
          </button>
        </div>
      )}

      <div className="grid">
        {coursesToRender.map((course) => {
          const dates = getCourseDates(course);
          return (
            <div key={course.id}>
              {canSeeCourseManagement && (
                <div className="course-card-actions-row">
                  <span className="course-card-actions-status">
                    Status:{" "}
                    <strong>
                      {STATUS_OPTIONS.find((entry) => entry.value === (course.status ?? "active"))?.label ??
                        "Aktiv"}
                    </strong>
                  </span>
                  <div className="course-card-actions-buttons">
                    <button
                      type="button"
                      title={canManageCourses ? "Kurs bearbeiten" : "Nur Admin kann Kurse bearbeiten"}
                      aria-label={`Kurs bearbeiten ${course.name}`}
                      disabled={!canManageCourses || saving}
                      onClick={() => openEditModal(course)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={canManageCourses ? "Kurs löschen" : "Nur Admin kann Kurse löschen"}
                      aria-label={`Kurs löschen ${course.name}`}
                      disabled={!canManageCourses || saving}
                      onClick={() => openDeleteModal(course.id)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
              <CourseCard
                course={course}
                allCourses={courses}
                currentUser={currentUser}
                dates={dates}
                overrides={filteredOverrides}
                swaps={swaps}
                onToggleAbsence={onToggleAbsence}
                confirmSwap={confirmSwap}
                requestSwap={requestSwap}
                cancelSwap={cancelSwap}
              />
            </div>
          );
        })}
      </div>

      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Kurs anlegen">
          <div className="modal modal-compact">
            <h4>Kurs anlegen</h4>
            <div className="dialog-stack">
              <input
                type="text"
                aria-label="Kursname"
                placeholder="Kursname"
                value={createState.name}
                onChange={(event) =>
                  setCreateState((prev) => ({ ...prev, name: event.target.value }))
                }
                disabled={saving}
                className="dialog-field"
              />
              <select
                aria-label="Wochentag"
                value={createState.weekday}
                onChange={(event) =>
                  setCreateState((prev) => ({ ...prev, weekday: event.target.value }))
                }
                disabled={saving}
                className="dialog-field"
              >
                {WEEKDAY_OPTIONS.map((weekday) => (
                  <option key={weekday.value} value={weekday.value}>
                    {weekday.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                aria-label="Uhrzeit"
                value={createState.time}
                onChange={(event) =>
                  setCreateState((prev) => ({ ...prev, time: event.target.value }))
                }
                disabled={saving}
                className="dialog-field"
              />
              <input
                type="number"
                aria-label="Kapazität"
                min={0}
                value={createState.capacity}
                onChange={(event) =>
                  setCreateState((prev) => ({ ...prev, capacity: event.target.value }))
                }
                disabled={saving}
                className="dialog-field"
              />
              <select
                aria-label="Status"
                value={createState.status}
                onChange={(event) =>
                  setCreateState((prev) => ({ ...prev, status: event.target.value as CourseStatus }))
                }
                disabled={saving}
                className="dialog-field"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
            </div>
            <div className="modal-actions dialog-actions">
              <button type="button" className="modal-action-btn" onClick={() => setCreateOpen(false)} disabled={saving}>
                Abbrechen
              </button>
              <button type="button" className="btn-primary modal-action-btn" onClick={saveCreateCourse} disabled={saving}>
                {saving ? "Speichere..." : "Anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editState && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Kurs bearbeiten">
          <div className="modal modal-compact">
            <h4>Kurs bearbeiten</h4>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Kurs-ID: <strong>{editState.id}</strong>
            </p>
            <div className="dialog-stack">
              <input
                type="text"
                aria-label="Kursname bearbeiten"
                value={editState.name}
                onChange={(event) =>
                  setEditState((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                }
                disabled={saving}
                className="dialog-field"
              />
              <select
                aria-label="Wochentag bearbeiten"
                value={editState.weekday}
                onChange={(event) =>
                  setEditState((prev) => (prev ? { ...prev, weekday: event.target.value } : prev))
                }
                disabled={saving}
                className="dialog-field"
              >
                {WEEKDAY_OPTIONS.map((weekday) => (
                  <option key={weekday.value} value={weekday.value}>
                    {weekday.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                aria-label="Uhrzeit bearbeiten"
                value={editState.time}
                onChange={(event) =>
                  setEditState((prev) => (prev ? { ...prev, time: event.target.value } : prev))
                }
                disabled={saving}
                className="dialog-field"
              />
              <input
                type="number"
                aria-label="Kapazität bearbeiten"
                min={0}
                value={editState.capacity}
                onChange={(event) =>
                  setEditState((prev) => (prev ? { ...prev, capacity: event.target.value } : prev))
                }
                disabled={saving}
                className="dialog-field"
              />
              <select
                aria-label="Status bearbeiten"
                value={editState.status}
                onChange={(event) =>
                  setEditState((prev) =>
                    prev ? { ...prev, status: event.target.value as CourseStatus } : prev,
                  )
                }
                disabled={saving}
                className="dialog-field"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
            </div>
            <div className="modal-actions dialog-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => {
                  setEditOpen(false);
                  setEditState(null);
                }}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button type="button" className="btn-primary modal-action-btn" onClick={saveEditCourse} disabled={saving}>
                {saving ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && deleteTargetCourse && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Kurs löschen">
          <div className="modal modal-compact">
            <h4>Kurs löschen</h4>
            <p style={{ marginTop: 0, color: "#4b5563" }}>
              Kurs <strong>{deleteTargetCourse.name}</strong> wirklich löschen?
            </p>
            <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
              Löschen ist nur möglich, wenn der Kurs inaktiv ist und keine offenen Termin-/Tauschbezüge
              mehr bestehen.
            </p>
            {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteTargetId(null);
                }}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={confirmDeleteCourse}
                disabled={saving}
              >
                {saving ? "Lösche..." : "Löschen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
