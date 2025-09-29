import axios from 'axios';
import type { CourseDateOverride } from '@yogaswap/shared';

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

export async function updateOverride(courseId: number, date: string, updates: Partial<CourseDateOverride>): Promise<void> {
  try {
    await axios.put(`/course-overrides/${courseId}/${date}`, updates);
  } catch (error) {
    console.error('Fehler beim Updaten des Overrides', error);
  }
}

export async function deleteOverride(courseId: number, date: string): Promise<void> {
  try {
    await axios.delete(`/course-overrides/${courseId}/${date}`);
  } catch (error) {
    console.error('Fehler beim Löschen des Overrides', error);
  }
}

export async function createOverride(newOverride: CourseDateOverride): Promise<void> {
  try {
    await axios.post('/course-overrides', newOverride);
  } catch (error) {
    console.error('Fehler beim Anlegen des Overrides', error);
  }
}