import axios from "axios";
import { Course, CoursePlanningMode, CourseStatus, CourseVisibilityMode } from "shared/types";

type ApiCourse = Omit<Course, "participants" | "dates"> & {
  participants?: string[];
  dates?: string[];
  visibleDates?: string[];
};

function mapApiCourseToCourse(item: ApiCourse): Course {
  const visibleDates = item.visibleDates ?? item.dates ?? [];
  return {
    id: item.id,
    ...(item.courseUid?.trim() ? { courseUid: item.courseUid.trim() } : {}),
    name: item.name,
    weekday: item.weekday,
    time: item.time,
    capacity: item.capacity,
    status: item.status ?? "active",
    planningMode: item.planningMode,
    visibilityMode: item.visibilityMode,
    seriesStartDate: item.seriesStartDate,
    seriesEndDate: item.seriesEndDate,
    plannedEndDate: item.plannedEndDate,
    visibleFrom: item.visibleFrom,
    visibleUntil: item.visibleUntil,
    visibilityHorizonWeeks: item.visibilityHorizonWeeks,
    excludedDates: item.excludedDates ?? [],
    includedDates: item.includedDates ?? [],
    visibleDates,
    participants: item.participants ?? [],
    dates: visibleDates,
    ...(item.tenantId ? { tenantId: item.tenantId } : {}),
    ...(item.instructors ? { instructors: item.instructors } : {}),
    ...(item.studioId ? { studioId: item.studioId } : {}),
    ...(item.roomId ? { roomId: item.roomId } : {}),
  };
}

export type CreateCourseRequest = {
  name: string;
  weekday: string;
  time: string;
  capacity: number;
  status?: CourseStatus;
  planningMode?: CoursePlanningMode;
  visibilityMode?: CourseVisibilityMode;
  seriesStartDate?: string;
  seriesEndDate?: string;
  plannedEndDate?: string | null;
  visibleFrom?: string;
  visibleUntil?: string;
  visibilityHorizonWeeks?: number;
  excludedDates?: string[];
  includedDates?: string[];
  participants?: string[];
};

export type UpdateCourseRequest = Partial<CreateCourseRequest>;

export type CancelCourseDateRequest = {
  rollbackSuccessfulSwapsFromCancelledParticipants?: boolean;
  rollbackPendingWaitlistSwapsFromOriginDate?: boolean;
  // backward compatible field kept for older clients/lambdas
  rollbackOutgoingSwapsFromCancelledParticipants?: boolean;
  // deprecated; backend now always notifies already-cancelled participants
  notifyAlreadyCancelledParticipants?: boolean;
};

export type CancelCourseDateResponse = {
  success: boolean;
  courseId: number;
  date: string;
  operationWarnings?: string[];
  affected?: {
    bookedParticipants: string[];
    swappedInParticipants: string[];
    waitlistParticipants: string[];
    alreadyCancelledParticipants: string[];
    outgoingSwapsFromCancelledParticipants: string[];
  };
};

export type DeleteCourseResponse = {
  success: boolean;
  courseId: string;
};

export async function getCourses(): Promise<Course[]> {
  try {
    const response = await axios.get<ApiCourse[]>("/courses");
    return response.data.map(mapApiCourseToCourse);
  } catch (error) {
    console.error("Fehler beim Laden der Courses:", error);
    return [];
  }
}

export async function createCourse(request: CreateCourseRequest): Promise<Course> {
  const response = await axios.post<ApiCourse>("/courses", request);
  return mapApiCourseToCourse(response.data);
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const backendError =
      typeof error.response?.data?.error === "string" ? error.response.data.error : undefined;
    return backendError ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export async function updateCourse(courseId: number | string, request: UpdateCourseRequest): Promise<Course> {
  try {
    const response = await axios.put<ApiCourse>(`/courses/${encodeURIComponent(String(courseId))}`, request);
    return mapApiCourseToCourse(response.data);
  } catch (error) {
    throw new Error(apiErrorMessage(error, "Kurs konnte nicht gespeichert werden."));
  }
}

export async function deleteCourse(courseId: number | string): Promise<DeleteCourseResponse> {
  try {
    const response = await axios.delete<DeleteCourseResponse>(
      `/courses/${encodeURIComponent(String(courseId))}`,
    );
    return response.data;
  } catch (error) {
    throw new Error(apiErrorMessage(error, "Kurs konnte nicht gelöscht werden."));
  }
}

export async function cancelCourseDate(
  courseId: number | string,
  date: string,
  request: CancelCourseDateRequest,
): Promise<CancelCourseDateResponse> {
  const response = await axios.post<CancelCourseDateResponse>(
    `/courses/${encodeURIComponent(String(courseId))}/dates/${encodeURIComponent(date)}/cancel`,
    request,
  );
  return response.data;
}