import axios from 'axios';
import { CourseDateOverride, Swap } from 'shared/types';

export async function getSwaps(user: string, fromDate?: string, fromCourseId?: number, toDate?: string, toCourseId?: number, status?: string): Promise<Swap[]> {
  try {
    const params: Record<string, string | number> = { user };
    if (fromDate) params.fromDate = fromDate;
    if (fromCourseId) params.fromCourseId = fromCourseId.toString();
    if (toDate) params.toDate = toDate;
    if (toCourseId) params.toCourseId = toCourseId.toString();
    if (status) params.status = status;

    console.log('getSwaps params:', params);
    const response = await axios.get('/swaps', { params });
    let data = response.data;
    console.log('getSwaps initial response:', data);
    if (data.length === 0) {
      console.log('Retrying getSwaps...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryResponse = await axios.get('/swaps', { params });
      data = retryResponse.data;
      console.log('getSwaps retry response:', data);
    }
    return data.map((item: any) => ({
      user: item.user,
      fromCourseId: parseInt(item.fromCourseId),
      fromDate: item.fromDate,
      toCourseId: parseInt(item.toCourseId),
      toDate: item.toDate,
      status: item.status,
    }));
  } catch (error) {
    console.error('Fehler beim Laden der Swaps:', error);
    return [];
  }
}

export async function createSwap(swap: Swap): Promise<void> {
  try {
    console.log('Create Swap Call:', swap);
    await axios.post('/swaps', swap);
  } catch (error) {
    console.error('Fehler beim Erstellen des Swaps:', error);
    throw error;
  }
}

export async function updateSwap(swap: Swap, status: Swap['status']): Promise<void> {
  try {
    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    console.log('Update Swap Call:', { swapId, user: swap.user, status });
    await axios.put(`/swaps/${swapId}`, { status }, { params: { user: swap.user } });
  } catch (error) {
    console.error('Fehler beim Updaten des Swaps:', error);
    throw error;
  }
}

export async function deleteSwap(swap: Swap): Promise<void> {
  try {
    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    console.log('Delete Swap Call:', { swapId, user: swap.user });
    await axios.delete(`/swaps/${swapId}`, { params: { user: swap.user } });
  } catch (error) {
    console.error('Fehler beim Löschen des Swaps:', error);
    throw error;
  }
}

export async function getSwapsByStatus(status: string): Promise<Swap[]> {
  try {
    console.log('getSwapsByStatus called with status:', status);
    const response = await axios.get('/swaps/status', { params: { status } });
    console.log('getSwapsByStatus response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Fehler beim Laden der Swaps by status:', error);
    return [];
  }
}

// Verarbeitet die Wartelisten für alle Kurse
// export async function processPromotions(): Promise<void> {
//   try {
//     await axios.post('/process-promotions', {});
//   } catch (error) {
//     console.error('Failed to process promotions:', error);
//     throw error;
//   }
// }

export async function processPromotions(): Promise<{
  message: string;
  iterations: number;
  promoted: number;
  swaps: Swap[];
  overrides: CourseDateOverride[];
}> {
  try {
    const response = await axios.post('/process-promotions', {});
    return response.data;
  } catch (error) {
    console.error('Failed to process promotions:', error);
    throw error;
  }
}
