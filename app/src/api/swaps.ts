import axios from "axios";
import { CourseDateOverride, Swap } from "shared/types";
import { delegationHeaders } from "./delegation";

/** Rohdaten von GET /swaps und /swaps/status (Kurs-IDs oft als String). */
type ApiSwapRow = {
  participantId?: string;
  /** Legacy API-Feld bis alle Clients migriert sind. */
  user?: string;
  fromCourseId: string | number;
  fromDate: string;
  toCourseId: string | number;
  toDate: string;
  status: Swap["status"];
  fromCourseUid?: string;
  toCourseUid?: string;
};

function mapApiSwapRow(item: ApiSwapRow): Swap {
  const participantId = item.participantId ?? item.user ?? "";
  const fromUid = typeof item.fromCourseUid === "string" ? item.fromCourseUid.trim() : "";
  const toUid = typeof item.toCourseUid === "string" ? item.toCourseUid.trim() : "";
  return {
    participantId,
    fromCourseId: Number(item.fromCourseId),
    fromDate: item.fromDate,
    toCourseId: Number(item.toCourseId),
    toDate: item.toDate,
    status: item.status,
    ...(fromUid ? { fromCourseUid: fromUid } : {}),
    ...(toUid ? { toCourseUid: toUid } : {}),
  };
}

export async function getSwaps(user: string, fromDate?: string, fromCourseId?: number, toDate?: string, toCourseId?: number, status?: string): Promise<Swap[]> {
  try {
    const params: Record<string, string | number> = { user };
    if (fromDate) params.fromDate = fromDate;
    if (fromCourseId) params.fromCourseId = fromCourseId.toString();
    if (toDate) params.toDate = toDate;
    if (toCourseId) params.toCourseId = toCourseId.toString();
    if (status) params.status = status;

    console.log("getSwaps params:", params);
    const response = await axios.get<ApiSwapRow[]>("/swaps", { params });
    let data = response.data;
    console.log("getSwaps initial response:", data);
    if (data.length === 0) {
      console.log("Retrying getSwaps...");
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryResponse = await axios.get<ApiSwapRow[]>("/swaps", { params });
      data = retryResponse.data;
      console.log("getSwaps retry response:", data);
    }
    return data.map(mapApiSwapRow);
  } catch (error) {
    console.error('Fehler beim Laden der Swaps:', error);
    return [];
  }
}

export async function createSwap(swap: Swap): Promise<void> {
  try {
    console.log('Create Swap Call:', swap);
    const headers = delegationHeaders();
    if (headers) {
      await axios.post('/swaps', swap, { headers });
    } else {
      await axios.post('/swaps', swap);
    }
  } catch (error) {
    console.error('Fehler beim Erstellen des Swaps:', error);
    throw error;
  }
}

export async function updateSwap(swap: Swap, status: Swap['status']): Promise<void> {
  try {
    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    console.log('Update Swap Call:', { swapId, participantId: swap.participantId, status });
    const params = { user: swap.participantId };
    const headers = delegationHeaders();
    if (headers) {
      await axios.put(`/swaps/${swapId}`, { status }, { params, headers });
    } else {
      await axios.put(`/swaps/${swapId}`, { status }, { params });
    }
  } catch (error) {
    console.error('Fehler beim Updaten des Swaps:', error);
    throw error;
  }
}

export async function deleteSwap(swap: Swap): Promise<void> {
  try {
    const swapId = `${swap.fromDate}_${swap.fromCourseId}_${swap.toDate}_${swap.toCourseId}`;
    console.log('Delete Swap Call:', { swapId, participantId: swap.participantId });
    const params = { user: swap.participantId };
    const headers = delegationHeaders();
    if (headers) {
      await axios.delete(`/swaps/${swapId}`, { params, headers });
    } else {
      await axios.delete(`/swaps/${swapId}`, { params });
    }
  } catch (error) {
    console.error('Fehler beim Löschen des Swaps:', error);
    throw error;
  }
}

export async function getSwapsByStatus(status: string): Promise<Swap[]> {
  try {
    console.log('getSwapsByStatus called with status:', status);
    const response = await axios.get<ApiSwapRow[]>('/swaps/status', { params: { status } });
    console.log('getSwapsByStatus response:', response.data);
    const data = Array.isArray(response.data) ? response.data : [];
    return data.map(mapApiSwapRow);
  } catch (error) {
    console.error('Fehler beim Laden der Swaps by status:', error);
    return [];
  }
}

export async function processPromotions(): Promise<{
  message: string;
  iterations: number;
  promoted: number;
  swaps: Swap[];
  overrides: CourseDateOverride[];
}> {
  try {
    const response = await axios.post<{
      message: string;
      iterations: number;
      promoted: number;
      swaps: ApiSwapRow[];
      overrides: CourseDateOverride[];
    }>('/process-promotions', {});
    const body = response.data;
    return {
      ...body,
      swaps: Array.isArray(body.swaps) ? body.swaps.map(mapApiSwapRow) : body.swaps,
    };
  } catch (error) {
    console.error('Failed to process promotions:', error);
    throw error;
  }
}

export async function processRingSwaps(): Promise<{
  message: string;
  diagnostics: {
    pendingSwaps: number;
    graphNodes: number;
    graphEdges: number;
    detectedCycles: number;
    selectedCycles: number;
    droppedSwaps: number;
  };
}> {
  try {
    const response = await axios.post<{
      message: string;
      diagnostics: {
        pendingSwaps: number;
        graphNodes: number;
        graphEdges: number;
        detectedCycles: number;
        selectedCycles: number;
        droppedSwaps: number;
      };
    }>("/process-ring-swaps", {});
    return response.data;
  } catch (error) {
    console.error("Failed to process ring swaps:", error);
    throw error;
  }
}
