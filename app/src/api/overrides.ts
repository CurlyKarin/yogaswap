import axios from 'axios';
import { CourseDateOverride } from 'shared/types';
import { delegationHeaders } from './delegation';

export async function getOverrides(sinceDate?: string): Promise<CourseDateOverride[]> {
  try {
    const response = await axios.get('/course-overrides', { params: { sinceDate } });
    const data = response.data;
    console.log('API Overrides Response:', data); // Debugging
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Fehler beim Laden der Overrides', error);
    return [];
  }
}

export async function updateOverride(
  courseId: number | string,
  date: string,
  updates: Partial<CourseDateOverride>,
): Promise<void> {
  const pathCourse = encodeURIComponent(String(courseId));
  const pathDate = encodeURIComponent(date);
  try {
    const headers = delegationHeaders();
    if (headers) {
      await axios.put(`/course-overrides/${pathCourse}/${pathDate}`, updates, { headers });
    } else {
      await axios.put(`/course-overrides/${pathCourse}/${pathDate}`, updates);
    }
    console.log('API Overrides Response (updates):', updates);
  } catch (error) {
    console.error('Fehler beim Updaten des Overrides', error);
    throw error;
  }
}

export async function deleteOverride(courseId: number | string, date: string): Promise<void> {
  const pathCourse = encodeURIComponent(String(courseId));
  const pathDate = encodeURIComponent(date);
  try {
    const headers = delegationHeaders();
    if (headers) {
      await axios.delete(`/course-overrides/${pathCourse}/${pathDate}`, { headers });
    } else {
      await axios.delete(`/course-overrides/${pathCourse}/${pathDate}`);
    }
    console.log('API Overrides Response (delete):', { courseId, date });
  } catch (error) {
    console.error('Fehler beim Löschen des Overrides', error);
  }
}

export async function createOverride(newOverride: CourseDateOverride): Promise<void> {
  try {
    const headers = delegationHeaders();
    if (headers) {
      await axios.post('/course-overrides', newOverride, { headers });
    } else {
      await axios.post('/course-overrides', newOverride);
    }
    console.log('API Overrides Response (newOverride):', newOverride);
  } catch (error) {
    console.error('Fehler beim Anlegen des Overrides', error);
    throw error;
  }
}