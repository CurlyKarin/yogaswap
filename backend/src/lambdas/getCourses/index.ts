import axios from 'axios';
import { Course } from '@yogaswap/shared';

export async function getCourses(): Promise<Course[]> {
  try {
    const response = await axios.get('/courses');
    return response.data.map((item: any) => ({
      id: item.id,
      name: item.name,
      weekday: item.weekday,
      time: item.time,
      capacity: item.capacity,
      participants: item.participants || [],
      dates: item.dates.L ? item.dates.L.map((d: any) => new Date(d.S)) : [],  // Parse List<String> zu Date[]
    }));
  } catch (error) {
    console.error('Fehler beim Laden der Courses:', error);
    return [];
  }
}