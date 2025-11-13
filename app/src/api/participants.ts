// app/api/participants.ts
import axios from 'axios';

export interface InviteUserRequest {
  email: string;
  nickname: string;
  role: "participant" | "instructor" | "admin";
}

export async function inviteUser(data: InviteUserRequest): Promise<boolean> {
  try {
    const response = await axios.post('/participants', data);
    return response.data.success === true;
  } catch (error: any) {
    console.error('Einladung fehlgeschlagen:', error.response?.data || error.message);
    return false;
  }
}