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
}

export async function inviteUser(data: InviteUserRequest): Promise<InviteUserResponse> {
  try {
    const response = await axios.post('/participants', data);
    return response.data; // { success: true } oder { error: "Nickname already exists" }
  } catch (error: any) {
    console.error('Einladung fehlgeschlagen:', error.response?.data || error.message);
    return { error: "Request failed" };
  }
}
