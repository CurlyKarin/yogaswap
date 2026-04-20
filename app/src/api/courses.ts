import axios from "axios";
import { Course, CoursePlanningMode, CourseStatus, CourseVisibilityMode } from "shared/types";

type ApiCourse = Omit<Course, "participants" | "dates"> & {
  participants?: string[];
  dates?: string[];
  visibleDates?: string[];
};

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
  visibleFrom?: string;
  visibleUntil?: string;
  visibilityHorizonWeeks?: number;
  excludedDates?: string[];
  includedDates?: string[];
};

export type UpdateCourseRequest = Partial<CreateCourseRequest>;

export type DeleteCourseResponse = {
  success: boolean;
  courseId: string;
};

export async function getCourses(): Promise<Course[]> {
  try {
    const response = await axios.get<ApiCourse[]>("/courses");
    return response.data.map((item) => ({
      id: item.id,
      name: item.name,
      weekday: item.weekday,
      time: item.time,
      capacity: item.capacity,
      status: item.status ?? "active",
      planningMode: item.planningMode,
      visibilityMode: item.visibilityMode,
      seriesStartDate: item.seriesStartDate,
      seriesEndDate: item.seriesEndDate,
      visibleFrom: item.visibleFrom,
      visibleUntil: item.visibleUntil,
      visibilityHorizonWeeks: item.visibilityHorizonWeeks,
      excludedDates: item.excludedDates ?? [],
      includedDates: item.includedDates ?? [],
      visibleDates: item.visibleDates ?? item.dates ?? [],
      participants: item.participants ?? [],
      dates: item.visibleDates ?? item.dates ?? [],
    }));
  } catch (error) {
    console.error("Fehler beim Laden der Courses:", error);
    return [];
  }
}

export async function createCourse(request: CreateCourseRequest): Promise<Course> {
  const response = await axios.post<ApiCourse>("/courses", request);
  return {
    id: response.data.id,
    name: response.data.name,
    weekday: response.data.weekday,
    time: response.data.time,
    capacity: response.data.capacity,
    status: response.data.status ?? "active",
    planningMode: response.data.planningMode,
    visibilityMode: response.data.visibilityMode,
    seriesStartDate: response.data.seriesStartDate,
    seriesEndDate: response.data.seriesEndDate,
    visibleFrom: response.data.visibleFrom,
    visibleUntil: response.data.visibleUntil,
    visibilityHorizonWeeks: response.data.visibilityHorizonWeeks,
    excludedDates: response.data.excludedDates ?? [],
    includedDates: response.data.includedDates ?? [],
    visibleDates: response.data.visibleDates ?? response.data.dates ?? [],
    participants: response.data.participants ?? [],
    dates: response.data.visibleDates ?? response.data.dates ?? [],
  };
}

export async function updateCourse(courseId: number | string, request: UpdateCourseRequest): Promise<Course> {
  const response = await axios.put<ApiCourse>(`/courses/${encodeURIComponent(String(courseId))}`, request);
  return {
    id: response.data.id,
    name: response.data.name,
    weekday: response.data.weekday,
    time: response.data.time,
    capacity: response.data.capacity,
    status: response.data.status ?? "active",
    planningMode: response.data.planningMode,
    visibilityMode: response.data.visibilityMode,
    seriesStartDate: response.data.seriesStartDate,
    seriesEndDate: response.data.seriesEndDate,
    visibleFrom: response.data.visibleFrom,
    visibleUntil: response.data.visibleUntil,
    visibilityHorizonWeeks: response.data.visibilityHorizonWeeks,
    excludedDates: response.data.excludedDates ?? [],
    includedDates: response.data.includedDates ?? [],
    visibleDates: response.data.visibleDates ?? response.data.dates ?? [],
    participants: response.data.participants ?? [],
    dates: response.data.visibleDates ?? response.data.dates ?? [],
  };
}

export async function deleteCourse(courseId: number | string): Promise<DeleteCourseResponse> {
  const response = await axios.delete<DeleteCourseResponse>(
    `/courses/${encodeURIComponent(String(courseId))}`,
  );
  return response.data;
}