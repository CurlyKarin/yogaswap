// app/api/participants.ts
import axios from 'axios';
import type { ParticipantProfile, ParticipantStatus, ParticipantSettings, UserRole } from 'shared/types';

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

export async function getParticipants(search?: string): Promise<ParticipantWithStatus[]> {
  const config = search ? { params: { search } } : undefined;
  const response = await axios.get<ParticipantWithStatus[]>('/participants', config);
  return response.data;
}

export async function updateParticipant(
  userId: string,
  data: UpdateParticipantRequest,
): Promise<ParticipantWithStatus> {
  const response = await axios.put<ParticipantWithStatus>(`/participants/${encodeURIComponent(userId)}`, data);
  return response.data;
}
