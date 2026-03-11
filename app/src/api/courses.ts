import axios from "axios";
import { Course } from "shared/types";

type ApiCourse = Omit<Course, "participants" | "dates"> & {
  participants?: string[];
  dates?: string[];
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
      participants: item.participants ?? [],
      dates: item.dates ?? [],
    }));
  } catch (error) {
    console.error("Fehler beim Laden der Courses:", error);
    return [];
  }
}