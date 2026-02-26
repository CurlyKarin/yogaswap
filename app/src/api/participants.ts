// app/api/participants.ts
import axios from 'axios';

export interface InviteUserRequest {
  email: string;
  nickname: string;
  role: "participant" | "instructor" | "admin";
}

export interface InviteUserResponse {
  success?: boolean;
  error?: string;
  tempPassword?: string;  // Temporäres Passwort (nur wenn E-Mail nicht versendet wurde)
  warning?: string;       // Warnung, z.B. wenn E-Mail nicht versendet werden konnte
  emailSent?: boolean;    // Ob E-Mail erfolgreich versendet wurde
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
