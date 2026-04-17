import axios from "axios";
import { Course, CourseStatus } from "shared/types";

type ApiCourse = Omit<Course, "participants" | "dates"> & {
  participants?: string[];
  dates?: string[];
};

export type CreateCourseRequest = {
  name: string;
  weekday: string;
  time: string;
  capacity: number;
  status?: CourseStatus;
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
      participants: item.participants ?? [],
      dates: item.dates ?? [],
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
    participants: response.data.participants ?? [],
    dates: response.data.dates ?? [],
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
    participants: response.data.participants ?? [],
    dates: response.data.dates ?? [],
  };
}

export async function deleteCourse(courseId: number | string): Promise<DeleteCourseResponse> {
  const response = await axios.delete<DeleteCourseResponse>(
    `/courses/${encodeURIComponent(String(courseId))}`,
  );
  return response.data;
}