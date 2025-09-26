import axios from 'axios';
import { Swap } from '@yogaswap/shared';

export async function getSwaps(user: string): Promise<Swap[]> {
  try {
    const response = await axios.get('/swaps', { params: { user } });
    return response.data;
  } catch (error) {
    console.error('Fehler beim Laden der Swaps', error);
    return [];
  }
}

export async function createSwap(newSwap: Swap): Promise<void> {
  try {
    await axios.post('/swaps', newSwap);
  } catch (error) {
    console.error('Fehler beim Anlegen des Swaps', error);
  }
}

export async function updateSwap(swapId: string, status: Swap['status']): Promise<void> {
  try {
    await axios.put(`/swaps/${swapId}`, { status });
  } catch (error) {
    console.error('Fehler beim Updaten des Swaps', error);
  }
}

export async function deleteSwap(swapId: string): Promise<void> {
  try {
    await axios.delete(`/swaps/${swapId}`);
  } catch (error) {
    console.error('Fehler beim Löschen des Swaps', error);
  }
}