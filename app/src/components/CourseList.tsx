import CourseCard from "./CourseCard";
import { useCourseSwaps } from "./useCourseSwaps";
import { useEffect, useState, useMemo, useCallback, useRef, type KeyboardEvent, type RefObject } from "react";
import { Plus, Pencil, Trash2, Users, CalendarDays, Calendar } from "lucide-react";
import {
  Course,
  CourseDateOverride,
  CoursePlanningMode,
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

type CourseDatesEditorState = {
  courseId: number;
  weekday: string;
  planningMode: CoursePlanningMode;
  seriesStartDate: string;
  seriesEndDate: string;
  excludedDates: string[];
  pendingExcludedDate: string;
  calendarMonth: string;
  excludedDatePickerOpen: boolean;
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
  { value: "bounded_series", label: "Serienplanung (fixes Fenster)" },
  { value: "rolling_continuous", label: "Durchlaufend (rollende Sicht)" },
];

function planningModeLabel(mode: CoursePlanningMode | undefined): string {
  if (mode === "rolling_continuous") return "Durchlaufend (rollend)";
  return "Serienplanung (fixes Fenster)";
}

function planningModeHint(mode: CoursePlanningMode): string {
  if (mode === "rolling_continuous") {
    return "Durchlaufend: Termine sind rollend sichtbar (z. B. 8 Wochen in die Zukunft).";
  }
  return "Serienplanung: z. B. Quartal oder Kursblock mit Start- und Enddatum.";
}

function toIsoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
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

function normalizeIsoDate(value: string): string {
  return value.trim();
}

function isValidIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

function dedupeAndSortDates(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeIsoDate).filter(isValidIsoDateOnly))).sort(compareIsoDate);
}

function buildDefaultSeriesWindow(): { start: string; end: string } {
  const today = new Date();
  return {
    start: toIsoDateOnly(today),
    end: toIsoDateOnly(addDays(today, 84)),
  };
}

function parseIsoDateOnlyUtc(value: string): Date | null {
  if (!isValidIsoDateOnly(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDateOnly(parsed) === value ? parsed : null;
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromIsoDate(value: string): string | null {
  const parsed = parseIsoDateOnlyUtc(value);
  if (!parsed) return null;
  return toMonthKey(parsed);
}

function parseMonthKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}-01T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function shiftMonthKey(value: string, monthDelta: number): string {
  const parsed = parseMonthKey(value);
  if (!parsed) {
    return value;
  }
  parsed.setUTCMonth(parsed.getUTCMonth() + monthDelta);
  return toMonthKey(parsed);
}

function formatMonthLabel(monthKey: string): string {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return monthKey;
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
}

type CalendarCell = {
  isoDate: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  inSeriesRange: boolean;
  isSeriesDate: boolean;
  isExcluded: boolean;
  isSelected: boolean;
};

function buildSeriesCalendarCells(
  monthKey: string,
  weekday: string,
  rangeStartIso: string,
  rangeEndIso: string,
  excludedDates: string[],
  selectedDate: string,
): CalendarCell[] {
  const monthStart = parseMonthKey(monthKey);
  const rangeStart = parseIsoDateOnlyUtc(rangeStartIso);
  const rangeEnd = parseIsoDateOnlyUtc(rangeEndIso);
  if (!monthStart || !rangeStart || !rangeEnd) return [];
  const normalizedRangeStart = toIsoDateOnly(rangeStart);
  const normalizedRangeEnd = toIsoDateOnly(rangeEnd);
  if (compareIsoDate(normalizedRangeStart, normalizedRangeEnd) > 0) return [];

  const weekdayIndex = WEEKDAY_ORDER[weekday];
  if (!weekdayIndex || weekdayIndex < 1 || weekdayIndex > 7) return [];
  const jsWeekday = weekdayIndex % 7;

  monthStart.setUTCDate(1);
  const offsetToMonday = (monthStart.getUTCDay() + 6) % 7;
  const gridStart = addDaysUtc(monthStart, -offsetToMonday);
  const currentMonth = toMonthKey(monthStart);
  const excludedSet = new Set(dedupeAndSortDates(excludedDates));

  const cells: CalendarCell[] = [];
  for (let index = 0; index < 42; index += 1) {
    const current = addDaysUtc(gridStart, index);
    const isoDate = toIsoDateOnly(current);
    const inSeriesRange =
      compareIsoDate(isoDate, normalizedRangeStart) >= 0 && compareIsoDate(isoDate, normalizedRangeEnd) <= 0;
    const isSeriesDate = inSeriesRange && current.getUTCDay() === jsWeekday;
    cells.push({
      isoDate,
      dayOfMonth: current.getUTCDate(),
      inCurrentMonth: toMonthKey(current) === currentMonth,
      inSeriesRange,
      isSeriesDate,
      isExcluded: excludedSet.has(isoDate),
      isSelected: isoDate === selectedDate,
    });
  }
  return cells;
}

function generateSeriesPreviewDates(weekday: string, startDate: string, endDate: string, excludedDates: string[]): string[] {
  if (!isValidIsoDateOnly(startDate) || !isValidIsoDateOnly(endDate) || compareIsoDate(startDate, endDate) > 0) {
    return [];
  }
  const weekdayIndex = WEEKDAY_ORDER[weekday];
  if (!weekdayIndex || weekdayIndex < 1 || weekdayIndex > 7) return [];
  const jsWeekday = weekdayIndex % 7;
  const excluded = new Set(dedupeAndSortDates(excludedDates));

  const start = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  const preview: string[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (cursor.getUTCDay() !== jsWeekday) continue;
    const iso = toIsoDateOnly(cursor);
    if (!excluded.has(iso)) {
      preview.push(iso);
    }
  }
  return preview;
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
    planningMode: "bounded_series",
  });
  const [editState, setEditState] = useState<CourseEditorState | null>(null);
  const [editInitialState, setEditInitialState] = useState<CourseEditorState | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [membersTargetId, setMembersTargetId] = useState<number | null>(null);
  const [datesTargetId, setDatesTargetId] = useState<number | null>(null);
  const [datesState, setDatesState] = useState<CourseDatesEditorState | null>(null);
  const createModalRef = useRef<HTMLDivElement | null>(null);
  const editModalRef = useRef<HTMLDivElement | null>(null);
  const deleteModalRef = useRef<HTMLDivElement | null>(null);
  const membersModalRef = useRef<HTMLDivElement | null>(null);
  const datesModalRef = useRef<HTMLDivElement | null>(null);

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

  const openDatesModal = (course: Course) => {
    const defaults = buildDefaultSeriesWindow();
    const initialStart = course.seriesStartDate ?? defaults.start;
    setDatesTargetId(course.id);
    setDatesState({
      courseId: course.id,
      weekday: course.weekday,
      planningMode: course.planningMode ?? "bounded_series",
      seriesStartDate: initialStart,
      seriesEndDate: course.seriesEndDate ?? defaults.end,
      excludedDates: dedupeAndSortDates(course.excludedDates ?? []),
      pendingExcludedDate: "",
      calendarMonth: monthKeyFromIsoDate(initialStart) ?? toMonthKey(new Date()),
      excludedDatePickerOpen: false,
    });
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
    setDatesState(null);
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
  const datesSeriesRangeValid =
    !!datesState &&
    isValidIsoDateOnly(datesState.seriesStartDate) &&
    isValidIsoDateOnly(datesState.seriesEndDate) &&
    compareIsoDate(datesState.seriesStartDate, datesState.seriesEndDate) <= 0;
  const canSaveDatesConfig =
    canManageCourses &&
    !saving &&
    !!datesState &&
    datesState.planningMode === "bounded_series" &&
    datesSeriesRangeValid;
  const datesPreview = useMemo(() => {
    if (!datesState) return [];
    return generateSeriesPreviewDates(
      datesState.weekday,
      datesState.seriesStartDate,
      datesState.seriesEndDate,
      datesState.excludedDates,
    );
  }, [datesState]);
  const datesCalendarCells = useMemo(() => {
    if (!datesState) return [];
    return buildSeriesCalendarCells(
      datesState.calendarMonth,
      datesState.weekday,
      datesState.seriesStartDate,
      datesState.seriesEndDate,
      datesState.excludedDates,
      datesState.pendingExcludedDate,
    );
  }, [datesState]);
  const datesCalendarMonthLabel = useMemo(() => {
    if (!datesState) return "";
    return formatMonthLabel(datesState.calendarMonth);
  }, [datesState]);

  useEffect(() => {
    const activeModal = createOpen
      ? createModalRef.current
      : editOpen
      ? editModalRef.current
      : deleteOpen
      ? deleteModalRef.current
      : membersTargetId
      ? membersModalRef.current
      : datesTargetId
      ? datesModalRef.current
      : null;
    if (!activeModal) return;

    focusFirstElement(activeModal);
  }, [createOpen, editOpen, deleteOpen, membersTargetId, datesTargetId]);

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
      await updateCourse(editState.id, {
        name: trimmedName,
        weekday: editState.weekday,
        time: editState.time,
        capacity,
        status: editState.status,
        ...buildSchedulingFromMode(editState.planningMode),
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
    if (!canManageCourses || !deleteTargetId) return;
    setSaving(true);
    setFormError(null);
    try {
      await deleteCourse(deleteTargetId);
      closeDeleteModal();
      await fetchData();
    } catch (err) {
      console.error("Failed to delete course", err);
      setFormError(err instanceof Error ? err.message : "Kurs konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  };

  const addExcludedDate = () => {
    if (!datesState) return;
    const nextDate = normalizeIsoDate(datesState.pendingExcludedDate);
    if (!isValidIsoDateOnly(nextDate)) {
      setFormError("Bitte ein gültiges Ausnahmedatum auswählen.");
      return;
    }
    setFormError(null);
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            excludedDates: dedupeAndSortDates([...prev.excludedDates, nextDate]),
            pendingExcludedDate: "",
          }
        : prev,
    );
  };

  const toggleExcludedDatePicker = () => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            excludedDatePickerOpen: !prev.excludedDatePickerOpen,
          }
        : prev,
    );
  };

  const shiftExcludedCalendarMonth = (monthDelta: number) => {
    if (saving) return;
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            calendarMonth: shiftMonthKey(prev.calendarMonth, monthDelta),
          }
        : prev,
    );
  };

  const selectExcludedDateFromCalendar = (isoDate: string) => {
    if (saving) return;
    setDatesState((prev) => {
      if (!prev) return prev;
      const inSeriesRange =
        compareIsoDate(isoDate, prev.seriesStartDate) >= 0 && compareIsoDate(isoDate, prev.seriesEndDate) <= 0;
      const weekdayIndex = WEEKDAY_ORDER[prev.weekday];
      const date = parseIsoDateOnlyUtc(isoDate);
      const isSeriesWeekday =
        !!date && !!weekdayIndex && weekdayIndex >= 1 && weekdayIndex <= 7 && date.getUTCDay() === weekdayIndex % 7;
      if (!inSeriesRange || !isSeriesWeekday) {
        return prev;
      }
      return {
        ...prev,
        pendingExcludedDate: isoDate,
      };
    });
    setFormError(null);
  };

  const removeExcludedDate = (date: string) => {
    setDatesState((prev) =>
      prev
        ? {
            ...prev,
            excludedDates: prev.excludedDates.filter((entry) => entry !== date),
          }
        : prev,
    );
  };

  const saveDatesConfig = async () => {
    if (!datesState || !canManageCourses) return;
    if (datesState.planningMode !== "bounded_series") {
      setFormError("Terminverwaltung v1 unterstützt aktuell nur Serienplanung.");
      return;
    }
    if (!datesSeriesRangeValid) {
      setFormError("Bitte einen gültigen Zeitraum mit Start- und Enddatum wählen.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await updateCourse(datesState.courseId, {
        planningMode: "bounded_series",
        visibilityMode: "fixed_window",
        seriesStartDate: datesState.seriesStartDate,
        seriesEndDate: datesState.seriesEndDate,
        visibleFrom: datesState.seriesStartDate,
        visibleUntil: datesState.seriesEndDate,
        excludedDates: datesState.excludedDates,
        includedDates: [],
      });
      closeDatesModal();
      await fetchData();
    } catch (err) {
      console.error("Failed to update course dates configuration", err);
      setFormError(err instanceof Error ? err.message : "Terminkonfiguration konnte nicht gespeichert werden.");
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
                      onClick={() => openDatesModal(course)}
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
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Kurs anlegen"
          onKeyDown={(event) => {
            handleFocusTrap(event, createModalRef);
            if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
              event.preventDefault();
              saveCreateCourse();
            }
          }}
        >
          <div className="modal modal-compact" ref={createModalRef} tabIndex={-1}>
            <h4>Kurs anlegen</h4>
            <p className="course-editor-note">
              Stammdaten jetzt anlegen. Mitglieder-Zuordnung und Terminplanung folgen als eigene Schritte.
            </p>
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
              <select
                aria-label="Planungsmodus"
                value={createState.planningMode}
                onChange={(event) =>
                  setCreateState((prev) => ({
                    ...prev,
                    planningMode: event.target.value as CoursePlanningMode,
                  }))
                }
                disabled={saving}
                className="dialog-field"
              >
                {PLANNING_MODE_OPTIONS.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <p className="course-editor-inline-hint">{planningModeHint(createState.planningMode)}</p>
              {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
            </div>
            <div className="modal-actions dialog-actions">
              <button type="button" className="modal-action-btn" onClick={closeCreateModal} disabled={saving}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveCreateCourse}
                disabled={!canSubmitCreate}
              >
                {saving ? "Speichere..." : "Anlegen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && editState && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Kurs bearbeiten"
          onKeyDown={(event) => {
            handleFocusTrap(event, editModalRef);
            if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
              event.preventDefault();
              saveEditCourse();
            }
          }}
        >
          <div className="modal modal-compact" ref={editModalRef} tabIndex={-1}>
            <h4>Kurs bearbeiten</h4>
            <p className="course-editor-note" style={{ marginTop: 0 }}>
              Stammdaten bearbeiten. Mitglieder und Termine werden im nächsten Schritt hier ergänzt.
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
              <select
                aria-label="Planungsmodus bearbeiten"
                value={editState.planningMode}
                onChange={(event) =>
                  setEditState((prev) =>
                    prev ? { ...prev, planningMode: event.target.value as CoursePlanningMode } : prev,
                  )
                }
                disabled={saving}
                className="dialog-field"
              >
                {PLANNING_MODE_OPTIONS.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <p className="course-editor-inline-hint">{planningModeHint(editState.planningMode)}</p>
              {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
            </div>
            <div className="modal-actions dialog-actions">
              <button
                type="button"
                className="modal-action-btn"
                onClick={closeEditModal}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveEditCourse}
                disabled={!canSubmitEdit}
              >
                {saving ? "Speichere..." : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {membersTargetCourse && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Kursmitglieder bearbeiten"
          onKeyDown={(event) => {
            handleFocusTrap(event, membersModalRef);
          }}
        >
          <div className="modal modal-compact" ref={membersModalRef} tabIndex={-1}>
            <h4>Mitglieder verwalten</h4>
            <p className="course-editor-note">
              Kurs: <strong>{membersTargetCourse.name}</strong>
            </p>
            <p className="course-editor-note">
              Hier folgt als Nächstes die Zuordnung von Teilnehmern zu diesem Kurs (inkl. Kapazitätsprüfung).
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-action-btn" onClick={closeMembersModal} disabled={saving}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}

      {datesTargetCourse && datesState && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Kurstermine bearbeiten"
          onKeyDown={(event) => {
            handleFocusTrap(event, datesModalRef);
          }}
        >
          <div className="modal modal-compact" ref={datesModalRef} tabIndex={-1}>
            <h4>Termine verwalten</h4>
            <p className="course-editor-note">
              Kurs: <strong>{datesTargetCourse.name}</strong>
            </p>
            <p className="course-editor-note">
              Planungsmodus: <strong>{planningModeLabel(datesTargetCourse.planningMode)}</strong>
            </p>
            {datesState.planningMode !== "bounded_series" ? (
              <p className="course-editor-note">
                Terminverwaltung v1 unterstützt aktuell nur Serienplanung. Bitte den Planungsmodus in den
                Kurs-Einstellungen auf Serienplanung setzen.
              </p>
            ) : (
              <div className="dialog-stack">
                <label className="course-editor-field-label">
                  Startdatum
                  <input
                    type="date"
                    aria-label="Serienstart"
                    value={datesState.seriesStartDate}
                    onChange={(event) =>
                      setDatesState((prev) =>
                        prev ? { ...prev, seriesStartDate: normalizeIsoDate(event.target.value) } : prev,
                      )
                    }
                    disabled={saving}
                    className="dialog-field"
                  />
                </label>
                <label className="course-editor-field-label">
                  Enddatum
                  <input
                    type="date"
                    aria-label="Serienende"
                    value={datesState.seriesEndDate}
                    onChange={(event) =>
                      setDatesState((prev) =>
                        prev ? { ...prev, seriesEndDate: normalizeIsoDate(event.target.value) } : prev,
                      )
                    }
                    disabled={saving}
                    className="dialog-field"
                  />
                </label>

                <div className="course-editor-subsection">
                  <strong className="course-editor-list-title">Ausnahmetermine</strong>
                  <div className="course-editor-inline-row">
                    <button
                      type="button"
                      className="modal-action-btn course-editor-icon-btn"
                      onClick={toggleExcludedDatePicker}
                      disabled={saving}
                      title={datesState.excludedDatePickerOpen ? "Kalender ausblenden" : "Kalender öffnen"}
                      aria-label="Kalender für Ausnahmetermin öffnen"
                    >
                      <Calendar size={16} aria-hidden="true" />
                    </button>
                    {datesState.pendingExcludedDate ? (
                      <span className="course-editor-selected-date">
                        Gewählt: <strong>{datesState.pendingExcludedDate}</strong>
                      </span>
                    ) : (
                      <span className="course-editor-note">Noch kein Datum ausgewählt.</span>
                    )}
                  </div>
                  {datesState.excludedDatePickerOpen && (
                    <div className="course-editor-calendar-block" role="group" aria-label="Kalender Ausnahmetermine">
                      <div className="course-editor-calendar-nav">
                        <button
                          type="button"
                          className="modal-action-btn course-editor-inline-action"
                          onClick={() => shiftExcludedCalendarMonth(-1)}
                          disabled={saving}
                        >
                          Vorheriger Monat
                        </button>
                        <strong>{datesCalendarMonthLabel}</strong>
                        <button
                          type="button"
                          className="modal-action-btn course-editor-inline-action"
                          onClick={() => shiftExcludedCalendarMonth(1)}
                          disabled={saving}
                        >
                          Nächster Monat
                        </button>
                      </div>
                      <div className="course-editor-calendar-weekdays" aria-hidden="true">
                        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </div>
                      <div className="course-editor-calendar-grid">
                        {datesCalendarCells.map((cell) => {
                          const cellClassName = [
                            "course-editor-calendar-cell",
                            cell.inCurrentMonth ? "" : "is-outside-month",
                            cell.isSeriesDate ? "is-series-date" : "",
                            cell.isExcluded ? "is-excluded-date" : "",
                            cell.isSelected ? "is-selected-date" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          const canPick = cell.isSeriesDate;
                          return (
                            <button
                              key={cell.isoDate}
                              type="button"
                              className={cellClassName}
                              aria-label={`Datum ${cell.isoDate}`}
                              onClick={() => selectExcludedDateFromCalendar(cell.isoDate)}
                              disabled={!canPick || saving}
                              title={
                                canPick
                                  ? cell.isExcluded
                                    ? "Bereits ausgeschlossen"
                                    : "Als Ausnahmetermin auswählbar"
                                  : "Nur Serientermine im Zeitraum auswählbar"
                              }
                            >
                              {cell.dayOfMonth}
                            </button>
                          );
                        })}
                      </div>
                      <div className="course-editor-calendar-legend">
                        <span><em className="legend-dot series" /> Serientermin</span>
                        <span><em className="legend-dot excluded" /> ausgeschlossen</span>
                        <span><em className="legend-dot selected" /> ausgewählt</span>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    className="modal-action-btn course-editor-inline-action"
                    onClick={addExcludedDate}
                    disabled={saving || !datesState.pendingExcludedDate}
                  >
                    Hinzufügen
                  </button>
                </div>

                <div className="course-editor-subsection">
                  <strong className="course-editor-list-title">Ausgeschlossene Termine</strong>
                  {datesState.excludedDates.length === 0 ? (
                    <p className="course-editor-note">Keine ausgeschlossenen Termine.</p>
                  ) : (
                    <ul className="course-editor-list">
                      {datesState.excludedDates.map((entry) => (
                        <li key={entry} className="course-editor-list-item">
                          <span>{entry}</span>
                          <button
                            type="button"
                            className="modal-action-btn"
                            aria-label={`Ausnahmedatum entfernen ${entry}`}
                            onClick={() => removeExcludedDate(entry)}
                            disabled={saving}
                          >
                            Entfernen
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="course-editor-subsection">
                  <strong className="course-editor-list-title">Vorschau Termine ({datesPreview.length})</strong>
                  {datesPreview.length === 0 ? (
                    <p className="course-editor-note">Keine Termine im gewählten Zeitraum.</p>
                  ) : (
                    <ul className="course-editor-list">
                      {datesPreview.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {formError && <p style={{ color: "crimson", margin: 0 }}>{formError}</p>}
            <div className="modal-actions">
              <button type="button" className="modal-action-btn" onClick={closeDatesModal} disabled={saving}>
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary modal-action-btn"
                onClick={saveDatesConfig}
                disabled={!canSaveDatesConfig}
              >
                {saving ? "Speichere..." : "Termine übernehmen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && deleteTargetCourse && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Kurs löschen"
          onKeyDown={(event) => {
            handleFocusTrap(event, deleteModalRef);
            if (event.key === "Enter") {
              event.preventDefault();
              confirmDeleteCourse();
            }
          }}
        >
          <div className="modal modal-compact" ref={deleteModalRef} tabIndex={-1}>
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
                onClick={closeDeleteModal}
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
