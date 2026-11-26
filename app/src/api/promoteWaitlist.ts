import axios from "axios";
import type { CourseDateOverride, Swap } from "shared/types";
import { apiErrorMessage } from "../lib/apiErrorMessage";

/** Rohdaten von Promote-Response (Kurs-IDs oft als String). */
type ApiSwapRow = {
  participantId?: string;
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

export type PromoteWaitlistRequest = {
  participantId: string;
  confirmExceedMaxCapacity?: boolean;
  acknowledgeCutoff?: boolean;
};

export type PromoteWaitlistResult = {
  message: string;
  promotedParticipantId?: string;
  promotedBy?: string;
  acknowledgedCutoff?: boolean;
  exceededMaxCapacity?: boolean;
  swaps: Swap[];
  overrides: CourseDateOverride[];
};

export type PromoteWaitlistApiError = Error & {
  code?: string;
  status?: number;
  limit?: number;
  nextOccupancy?: number;
};

export async function promoteWaitlistPerson(
  courseId: number | string,
  date: string,
  body: PromoteWaitlistRequest,
): Promise<PromoteWaitlistResult> {
  const pathCourse = encodeURIComponent(String(courseId));
  const pathDate = encodeURIComponent(date);
  try {
    const response = await axios.post<{
      message: string;
      promotedParticipantId?: string;
      promotedBy?: string;
      acknowledgedCutoff?: boolean;
      exceededMaxCapacity?: boolean;
      swaps: ApiSwapRow[];
      overrides: CourseDateOverride[];
    }>(`/courses/${pathCourse}/dates/${pathDate}/promote-waitlist`, body);
    const data = response.data;
    return {
      ...data,
      swaps: Array.isArray(data.swaps) ? data.swaps.map(mapApiSwapRow) : [],
      overrides: Array.isArray(data.overrides) ? data.overrides : [],
    };
  } catch (error) {
    const err = new Error(
      apiErrorMessage(error, "Wartelisten-Übernahme fehlgeschlagen."),
    ) as PromoteWaitlistApiError;
    if (axios.isAxiosError(error)) {
      err.status = error.response?.status;
      const data = error.response?.data as
        | {
            code?: string;
            limit?: number;
            nextOccupancy?: number;
          }
        | undefined;
      if (typeof data?.code === "string") err.code = data.code;
      if (typeof data?.limit === "number") err.limit = data.limit;
      if (typeof data?.nextOccupancy === "number") err.nextOccupancy = data.nextOccupancy;
    }
    throw err;
  }
}
