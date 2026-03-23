// app/api/participants.ts
import axios from 'axios';
import type { ParticipantProfile, ParticipantStatus, ParticipantSettings, UserRole } from 'shared/types';
import { loadCurrentUser } from "shared/lib/storage";

export interface InviteUserRequest {
  email?: string;
  nickname: string;
  role: UserRole;
}

export interface InviteUserResponse {
  success?: boolean;
  error?: string;
  tempPassword?: string;  // Temporäres Passwort (nur wenn E-Mail nicht versendet wurde)
  warning?: string;       // Warnung, z.B. wenn E-Mail nicht versendet werden konnte
  emailSent?: boolean;    // Ob E-Mail erfolgreich versendet wurde
  username?: string;
  link?: string;
}

export type ParticipantWithStatus = ParticipantProfile & { status: ParticipantStatus };

export interface UpdateParticipantRequest {
  email?: string | null;
  settings?: ParticipantSettings;
  inviteSentAt?: string | null;
  authUserId?: string | null;
}

export type ParticipantSortBy = "nickname" | "userId" | "email" | "status";
export type ParticipantSortOrder = "asc" | "desc";

export interface GetParticipantsRequest {
  search?: string;
  status?: ParticipantStatus;
  hasEmail?: boolean;
  sortBy?: ParticipantSortBy;
  sortOrder?: ParticipantSortOrder;
}

export async function inviteUser(data: InviteUserRequest): Promise<InviteUserResponse> {
  try {
    const response = await axios.post<InviteUserResponse>('/participants', data);
    return response.data; // { success: true } oder { error: "Nickname already exists" }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Einladung fehlgeschlagen:', error.response?.data || error.message);
    } else {
      console.error('Einladung fehlgeschlagen:', error);
    }
    return { error: "Request failed" };
  }
}

export async function getParticipants(
  request?: string | GetParticipantsRequest,
): Promise<ParticipantWithStatus[]> {
  const currentUser = loadCurrentUser();
  const params: Record<string, string> = {};
  if (currentUser?.nickname) params.user = currentUser.nickname;
  if (typeof request === "string") {
    if (request.trim()) params.search = request;
  } else if (request) {
    if (request.search?.trim()) params.search = request.search;
    if (request.status) params.status = request.status;
    if (typeof request.hasEmail === "boolean") params.hasEmail = String(request.hasEmail);
    if (request.sortBy) params.sortBy = request.sortBy;
    if (request.sortOrder) params.sortOrder = request.sortOrder;
  }

  const config = Object.keys(params).length > 0 ? { params } : undefined;
  const response = await axios.get<ParticipantWithStatus[]>('/participants', config);
  if (Array.isArray(response.data)) {
    return response.data;
  }

  throw new Error("Unexpected /participants response format");
}

export async function updateParticipant(
  userId: string,
  data: UpdateParticipantRequest,
): Promise<ParticipantWithStatus> {
  const currentUser = loadCurrentUser();
  const params = currentUser?.nickname ? { user: currentUser.nickname } : undefined;
  const config = params ? { params } : undefined;
  const response = await axios.put<ParticipantWithStatus>(
    `/participants/${encodeURIComponent(userId)}`,
    data,
    config,
  );
  return response.data;
}
