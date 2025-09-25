import axios from 'axios';
import { Swap } from '@yogaswap/shared';

export async function getSwaps(user: string, params?: { fromCourseId?: string; fromDate?: string; courseId?: string; date?: string; status?: string }): Promise<Swap[]> {
  const response = await axios.get(`/swaps`, { params: { user, ...params } });
  return response.data;
}

// export async function createSwap(newSwap: Swap): Promise<void> {
//   await axios.post(`${API_ENDPOINT}/swaps`, newSwap);
// }

// export async function updateSwap(swapId: string, updates: Partial<Swap>): Promise<void> {
//   await axios.put(`${API_ENDPOINT}/swaps/${swapId}`, updates);
// }

// export async function deleteSwap(swapId: string): Promise<void> {
//   await axios.delete(`${API_ENDPOINT}/swaps/${swapId}`);
// }