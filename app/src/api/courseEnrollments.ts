import axios from "axios";
import type { CourseEnrollment } from "shared/types";

export async function getCourseEnrollments(courseId?: number): Promise<CourseEnrollment[]> {
  const response = await axios.get("/course-enrollments", {
    params: {
      ...(courseId !== undefined ? { courseId } : {}),
      _: Date.now(),
    },
    headers: { "Cache-Control": "no-cache" },
  });
  return Array.isArray(response.data) ? response.data : [];
}
