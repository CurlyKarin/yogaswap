import CourseCard from "./CourseCard";
import CourseDatesDialog from "./CourseDatesDialog";
import CourseCreateDialog from "./CourseCreateDialog";
import CourseEditDialog from "./CourseEditDialog";
import CourseDeleteDialog from "./CourseDeleteDialog";
import CourseMembersDialog from "./CourseMembersDialog";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState, useMemo, useCallback, useRef, type KeyboardEvent, type RefObject } from "react";
import { Plus, Pencil, Trash2, Users, CalendarDays } from "lucide-react";
import {
  Course,
  CourseDateOverride,
  CoursePlanningMode,
  CourseStatus,
  Swap,
  User,
  Tenant,
  UserTenantMembership,
  DEFAULT_TENANT_ID,
} from "shared/types";
import { getSwaps } from "../api/swaps";
import { getSwapsByStatus } from "../api/swaps";
import { getOverrides } from "../api/overrides";
import { getCourseDates } from "../lib/dates";
import {
  createCourse,
  deleteCourse,
  getCourses,
  updateCourse,
} from "../api/courses";
import { canSeeCourse, canShowParticipantCourseCard } from "shared/permissions";
import {
  looksLikeAutomaticallyInactive,
  wouldAutoDeactivateBoundedSeries,
} from "shared/courseStatus";
import { courseApiPathKey } from "../lib/courseUid";

type Props = {
  currentUser: User;
  tenant?: Tenant;
  membership?: UserTenantMembership;
  forceParticipantView?: boolean;
};

type CourseEditorState = {
  id: number;
  name: string;
  weekday: string;
  time: string;
  capacity: string;
  status: CourseStatus;
  planningMode: CoursePlanningMode;
};

type CourseCreateState = {
  name: string;
  weekday: string;
  time: string;
  capacity: string;
  status: CourseStatus;
  planningMode: CoursePlanningMode;
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

const PLANNING_MODE_OPTIONS: Array<{ value: CoursePlanningMode; label: string }> = [
  { value: "bounded_series", label: "Kursblock (fixes Fenster)" },
  { value: "rolling_continuous", label: "Durchlaufend (rollende Sicht)" },
];

function planningModeHint(mode: CoursePlanningMode): string {
  if (mode === "rolling_continuous") {
    return "Durchlaufend: Termine sind rollend sichtbar (z. B. 8 Wochen in die Zukunft).";
  }
  return "Kursblock: z. B. Quartal oder Kursreihe mit Start- und Enddatum.";
}

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildSchedulingFromMode(mode: CoursePlanningMode) {
  if (mode === "rolling_continuous") {
    return {
      planningMode: "rolling_continuous" as const,
      visibilityMode: "rolling_horizon" as const,
      visibilityHorizonWeeks: 8,
    };
  }

  const today = new Date();
  const start = toIsoDateOnly(today);
  const end = toIsoDateOnly(addDays(today, 90));
  return {
    planningMode: "bounded_series" as const,
    visibilityMode: "fixed_window" as const,
    seriesStartDate: start,
    seriesEndDate: end,
    visibleFrom: start,
    visibleUntil: end,
  };
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

function getFocusableElements(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function focusFirstElement(node: HTMLElement): void {
  const focusables = getFocusableElements(node);
  if (focusables.length > 0) {
    focusables[0].focus();
    return;
  }
  node.focus();
}

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
    planningMode: course.planningMode ?? "bounded_series",
  };
}

function dedupeSwaps(values: Swap[]): Swap[] {
  const seen = new Set<string>();
  const result: Swap[] = [];
  for (const swap of values) {
    const key = `${swap.user}#${swap.fromCourseId}#${swap.fromDate}#${swap.toCourseId}#${swap.toDate}#${swap.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(swap);
  }
  return result;
}

export default function CourseList({
  currentUser,
  tenant,
  membership,
  forceParticipantView = false,
}: Props) {
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
    planningMode: "bounded_series",
  });
  const [editState, setEditState] = useState<CourseEditorState | null>(null);
  const [editInitialState, setEditInitialState] = useState<CourseEditorState | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [membersTargetId, setMembersTargetId] = useState<number | null>(null);
  const [datesTargetId, setDatesTargetId] = useState<number | null>(null);
  const createModalRef = useRef<HTMLDivElement | null>(null);
  const editModalRef = useRef<HTMLDivElement | null>(null);
  const deleteModalRef = useRef<HTMLDivElement | null>(null);
  const membersModalRef = useRef<HTMLDivElement | null>(null);

  const effectiveMembership = useMemo<UserTenantMembership | undefined>(() => {
    if (!membership) return undefined;
    if (!forceParticipantView) return membership;
    return {
      ...membership,
      role: "participant",
      userId: currentUser.nickname,
    };
  }, [membership, forceParticipantView, currentUser.nickname]);

  /** Ohne Dynamo-Membership (häufig bei Teilnehmer:innen): Rolle aus Cognito + Tenant für Kachel-Sichtbarkeit. */
  const membershipForPermissions = useMemo<UserTenantMembership>(() => {
    if (effectiveMembership) return effectiveMembership;
    return {
      userId: currentUser.nickname,
      tenantId: tenant?.tenantId ?? DEFAULT_TENANT_ID,
      role: currentUser.role,
    };
  }, [effectiveMembership, tenant?.tenantId, currentUser.nickname, currentUser.role]);

  const resolvedRole = effectiveMembership?.role ?? currentUser.role;
  const isAdmin = resolvedRole === "admin";
  const isInstructor = resolvedRole === "instructor";
  const canSeeCourseManagement = isAdmin || isInstructor;
  const canManageCourses = isAdmin;

  const fetchData = useCallback(async () => {
    try {
      console.log("Fetching courses, overrides, and swaps...", {
        user: currentUser.nickname,
      });
      setLoading(true);
      const swapsPromise = canSeeCourseManagement
        ? Promise.all([getSwapsByStatus("pending"), getSwapsByStatus("active")]).then(([pending, active]) =>
            dedupeSwaps([...pending, ...active]),
          )
        : getSwaps(currentUser.nickname);

      const [courseData, overrideData, swapsData] = await Promise.all([
        getCourses(),
        getOverrides(),
        swapsPromise,
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
  }, [canSeeCourseManagement, currentUser.nickname]);

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
    return courses.filter((course) =>
      canSeeCourse(membershipForPermissions, tenant?.settings, course, {
        isTaughtByUser: (course.instructors ?? []).some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
        isBookedByUser: course.participants.some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
      }),
    );
  }, [courses, membershipForPermissions, tenant?.settings, currentUser.nickname]);

  const participantCoursesToRender = useMemo(() => {
    const hasVisibleCourseDates = (c: Course) => getCourseDates(c).length > 0;
    const seeCtx = (course: Course) => ({
      isTaughtByUser: (course.instructors ?? []).some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
      isBookedByUser: course.participants.some((p) => p.toLowerCase() === currentUser.nickname.toLowerCase()),
    });
    return visibleCourses.filter((c) =>
      canShowParticipantCourseCard(membershipForPermissions, tenant?.settings, c, {
        ...seeCtx(c),
        hasVisibleCourseDates: hasVisibleCourseDates(c),
      }),
    );
  }, [visibleCourses, membershipForPermissions, tenant?.settings, currentUser.nickname]);
  const coursesToRender = canSeeCourseManagement ? visibleCourses : participantCoursesToRender;
  const deleteTargetCourse = deleteTargetId
    ? visibleCourses.find((course) => course.id === deleteTargetId)
    : undefined;
  const membersTargetCourse = membersTargetId
    ? visibleCourses.find((course) => course.id === membersTargetId)
    : undefined;
  const datesTargetCourse = datesTargetId
    ? visibleCourses.find((course) => course.id === datesTargetId)
    : undefined;

  const resetFormError = () => setFormError(null);

  const openCreateModal = () => {
    setCreateState({
      name: "",
      weekday: "Mon",
      time: "18:00",
      capacity: "10",
      status: "draft",
      planningMode: "bounded_series",
    });
    resetFormError();
    setCreateOpen(true);
  };

  const openEditModal = (course: Course) => {
    const next = toEditorState(course);
    setEditState(next);
    setEditInitialState(next);
    resetFormError();
    setEditOpen(true);
  };

  const openDeleteModal = (courseId: number) => {
    setDeleteTargetId(courseId);
    resetFormError();
    setDeleteOpen(true);
  };

  const openMembersModal = (courseId: number) => {
    setMembersTargetId(courseId);
    resetFormError();
  };

  const openDatesModal = (courseId: number) => {
    setDatesTargetId(courseId);
    resetFormError();
  };

  const parseCapacity = (capacityText: string): number | null => {
    const parsed = Number.parseInt(capacityText, 10);
    if (!Number.isInteger(parsed) || parsed < 0) return null;
    return parsed;
  };

  const closeCreateModal = () => {
    if (saving) return;
    setCreateOpen(false);
  };

  const closeEditModal = () => {
    if (saving) return;
    setEditOpen(false);
    setEditState(null);
    setEditInitialState(null);
  };

  const closeDeleteModal = () => {
    if (saving) return;
    setDeleteOpen(false);
    setDeleteTargetId(null);
  };

  const closeMembersModal = () => {
    if (saving) return;
    setMembersTargetId(null);
  };

  const closeDatesModal = () => {
    if (saving) return;
    setDatesTargetId(null);
  };

  const handleFocusTrap = (event: KeyboardEvent<HTMLDivElement>, modalRef: RefObject<HTMLDivElement | null>) => {
    if (event.key !== "Tab") return;
    const modalNode = modalRef.current;
    if (!modalNode) return;
    event.preventDefault();

    const focusables = getFocusableElements(modalNode);
    if (focusables.length === 0) {
      modalNode.focus();
      return;
    }

    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? focusables.indexOf(active) : -1;

    if (currentIndex === -1) {
      focusables[0].focus();
      return;
    }

    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusables.length) % focusables.length
      : (currentIndex + 1) % focusables.length;
    focusables[nextIndex].focus();
  };

  const createNameValid = createState.name.trim().length > 0;
  const createCapacityValid = parseCapacity(createState.capacity) != null;
  const canSubmitCreate = canManageCourses && !saving && createNameValid && createCapacityValid;

  const editNameValid = (editState?.name.trim().length ?? 0) > 0;
  const editCapacityValid = editState ? parseCapacity(editState.capacity) != null : false;
  const editChanged =
    !!editState &&
    !!editInitialState &&
    (editState.name !== editInitialState.name ||
      editState.weekday !== editInitialState.weekday ||
      editState.time !== editInitialState.time ||
      editState.capacity !== editInitialState.capacity ||
      editState.status !== editInitialState.status ||
      editState.planningMode !== editInitialState.planningMode);
  const canSubmitEdit = canManageCourses && !saving && !!editState && editNameValid && editCapacityValid && editChanged;

  const handleCreateDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    handleFocusTrap(event, createModalRef);
    if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      saveCreateCourse();
    }
  };

  const handleEditDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    handleFocusTrap(event, editModalRef);
    if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      saveEditCourse();
    }
  };

  const handleDeleteDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    handleFocusTrap(event, deleteModalRef);
    if (event.key === "Enter") {
      event.preventDefault();
      confirmDeleteCourse();
    }
  };

  useEffect(() => {
    const activeModal = createOpen
      ? createModalRef.current
      : editOpen
      ? editModalRef.current
      : deleteOpen
      ? deleteModalRef.current
      : null;
    if (!activeModal) return;

    focusFirstElement(activeModal);
  }, [createOpen, editOpen, deleteOpen]);

  useEffect(() => {
    if (!createOpen && !editOpen && !deleteOpen && !membersTargetId && !datesTargetId) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (saving) return;
      event.preventDefault();
      if (datesTargetId) {
        setDatesTargetId(null);
      } else if (membersTargetId) {
        setMembersTargetId(null);
      } else if (deleteOpen) {
        setDeleteOpen(false);
        setDeleteTargetId(null);
      } else if (editOpen) {
        setEditOpen(false);
        setEditState(null);
        setEditInitialState(null);
      } else if (createOpen) {
        setCreateOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, editOpen, deleteOpen, membersTargetId, datesTargetId, saving]);

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
        ...buildSchedulingFromMode(createState.planningMode),
      });
      closeCreateModal();
      await fetchData();
    } catch (err) {
      console.error("Failed to create course", err);
      setFormError("Kurs konnte nicht angelegt werden.");
    } finally {
      setSaving(false);
    }
  };

  const saveEditCourse = async () => {
    if (!canManageCourses || !editState || !editChanged) return;
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
      const courseForEdit = visibleCourses.find((c) => c.id === editState.id);
      if (!courseForEdit) {
        setFormError("Kurs nicht gefunden.");
        return;
      }
      const previousPlanningMode = courseForEdit.planningMode ?? "bounded_series";
      const planningModeChanged = editState.planningMode !== previousPlanningMode;
      await updateCourse(courseApiPathKey(courseForEdit), {
        name: trimmedName,
        weekday: editState.weekday,
        time: editState.time,
        capacity,
        status: editState.status,
        ...(planningModeChanged ? buildSchedulingFromMode(editState.planningMode) : {}),
      });
      closeEditModal();
      await fetchData();
    } catch (err) {
      console.error("Failed to update course", err);
      setFormError(err instanceof Error ? err.message : "Kurs konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCourse = async () => {
    if (!canManageCourses || !deleteTargetCourse) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteCourse(courseApiPathKey(deleteTargetCourse));
      closeDeleteModal();
      await fetchData();
    } catch (err) {
      console.error("Failed to delete course", err);
      setFormError(err instanceof Error ? err.message : "Kurs konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  };

  const saveCourseMembers = async (courseId: number, participants: string[]) => {
    if (!canManageCourses) return;
    const targetCourse = visibleCourses.find((c) => c.id === courseId);
    if (!targetCourse) {
      setFormError("Kurs nicht gefunden.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await updateCourse(courseApiPathKey(targetCourse), { participants });
      closeMembersModal();
      await fetchData();
    } catch (err) {
      console.error("Failed to update course members", err);
      setFormError(err instanceof Error ? err.message : "Mitglieder konnten nicht gespeichert werden.");
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

  if (visibleCourses.length === 0 || (!canSeeCourseManagement && participantCoursesToRender.length === 0)) {
    return (
      <div className="muted" style={{ textAlign: "center", padding: "2rem" }} role="status" aria-live="polite">
        {canSeeCourseManagement
          ? "Aktuell sind noch keine Kurse angelegt."
          : "Aktuell keine Kurse in dieser Ansicht — z. B. keine anstehenden Termine, Kurse in Planung, Sichtbarkeit nach Buchung/Lehrkraft oder abgelaufener Nachlauf bei inaktiven Kursen."}
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
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
        </div>
      )}

      <div className="grid">
        {coursesToRender.map((course) => {
          const dates = getCourseDates(course);
          const hasUpcomingDates = dates.length > 0;
          const statusLabel =
            STATUS_OPTIONS.find((entry) => entry.value === (course.status ?? "active"))?.label ?? "Aktiv";
          const statusHint = looksLikeAutomaticallyInactive(course, hasUpcomingDates)
            ? " · automatisch inaktiv"
            : wouldAutoDeactivateBoundedSeries(course, hasUpcomingDates)
              ? " · wird beim Speichern inaktiv"
              : "";
          return (
            <div key={course.id}>
              {canSeeCourseManagement && (
                <div className="course-card-actions-row">
                  <span className="course-card-actions-status">
                    Status:{" "}
                    <strong>
                      {statusLabel}
                      {statusHint}
                    </strong>
                  </span>
                  <div className="course-card-actions-buttons">
                    <button
                      type="button"
                      title={canManageCourses ? "Mitglieder bearbeiten" : "Nur Admin kann Mitglieder bearbeiten"}
                      aria-label={`Mitglieder bearbeiten ${course.name}`}
                      disabled={!canManageCourses || saving}
                      onClick={() => openMembersModal(course.id)}
                    >
                      <Users size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title={canManageCourses ? "Termine bearbeiten" : "Nur Admin kann Termine bearbeiten"}
                      aria-label={`Termine bearbeiten ${course.name}`}
                      disabled={!canManageCourses || saving}
                      onClick={() => openDatesModal(course.id)}
                    >
                      <CalendarDays size={14} aria-hidden="true" />
                    </button>
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
                participantActionsLocked={
                  !canSeeCourseManagement && (course.status ?? "active") === "inactive"
                }
                tenantSettings={tenant?.settings}
                onToggleAbsence={onToggleAbsence}
                confirmSwap={confirmSwap}
                requestSwap={requestSwap}
                cancelSwap={cancelSwap}
              />
            </div>
          );
        })}
      </div>

      <CourseCreateDialog
        open={createOpen}
        saving={saving}
        formError={formError}
        state={createState}
        canSubmit={canSubmitCreate}
        modalRef={createModalRef}
        weekdayOptions={WEEKDAY_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        planningModeOptions={PLANNING_MODE_OPTIONS}
        planningModeHint={planningModeHint}
        onKeyDown={handleCreateDialogKeyDown}
        onClose={closeCreateModal}
        onSave={saveCreateCourse}
        onChange={setCreateState}
      />

      <CourseEditDialog
        open={editOpen}
        saving={saving}
        formError={formError}
        state={editState}
        canSubmit={canSubmitEdit}
        modalRef={editModalRef}
        weekdayOptions={WEEKDAY_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        planningModeOptions={PLANNING_MODE_OPTIONS}
        planningModeHint={planningModeHint}
        onKeyDown={handleEditDialogKeyDown}
        onClose={closeEditModal}
        onSave={saveEditCourse}
        onChange={(next) => setEditState(next)}
      />

      <CourseMembersDialog
        open={!!membersTargetCourse}
        saving={saving}
        courseId={membersTargetCourse?.id}
        courseName={membersTargetCourse?.name}
        capacity={membersTargetCourse?.capacity ?? 0}
        initialParticipants={membersTargetCourse?.participants ?? []}
        formError={formError}
        modalRef={membersModalRef}
        onKeyDown={(event) => {
          handleFocusTrap(event, membersModalRef);
        }}
        onClose={closeMembersModal}
        onSaveParticipants={saveCourseMembers}
      />

      <CourseDatesDialog
        course={datesTargetCourse ?? null}
        overrides={filteredOverrides}
        swaps={swaps}
        canManageCourses={canManageCourses}
        onClose={closeDatesModal}
        onSaved={fetchData}
      />

      <CourseDeleteDialog
        open={deleteOpen}
        saving={saving}
        formError={formError}
        courseName={deleteTargetCourse?.name}
        modalRef={deleteModalRef}
        onKeyDown={handleDeleteDialogKeyDown}
        onClose={closeDeleteModal}
        onConfirmDelete={confirmDeleteCourse}
      />
    </>
  );
}
