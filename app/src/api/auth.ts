import axios from "axios";

export interface StartPasswordResetFromTokenRequest {
  tenantId: string;
  token: string;
}

export interface StartPasswordResetFromTokenResponse {
  success: boolean;
  username: string;
}

export interface RequestSelfPasswordResetRequest {
  nickname: string;
}

export interface RequestSelfPasswordResetResponse {
  success: boolean;
  emailSent?: boolean;
}

function readErrorMessageFromData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const errorValue = record.error;
  if (typeof errorValue === "string" && errorValue.trim()) return errorValue;
  const messageValue = record.message;
  if (typeof messageValue === "string" && messageValue.trim()) return messageValue;
  return null;
}

function readErrorMessageFromUnknownError(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const record = err as Record<string, unknown>;
  const response = record.response;
  if (!response || typeof response !== "object") return null;
  const responseRecord = response as Record<string, unknown>;
  return readErrorMessageFromData(responseRecord.data);
}

export async function startPasswordResetFromToken(
  req: StartPasswordResetFromTokenRequest,
): Promise<StartPasswordResetFromTokenResponse> {
  const { tenantId, token } = req;
  try {
    const response = await axios.post<StartPasswordResetFromTokenResponse>(
      `/auth/password-reset/from-token?token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}`,
    );
    return response.data;
  } catch (err: unknown) {
    const messageFromResponse = readErrorMessageFromUnknownError(err);
    if (messageFromResponse) {
      throw new Error(messageFromResponse);
    }
    if (err instanceof Error) {
      throw new Error(err.message || "Request failed");
    }
    throw new Error("Request failed");
  }
}

export async function requestSelfPasswordReset(
  req: RequestSelfPasswordResetRequest,
): Promise<RequestSelfPasswordResetResponse> {
  try {
    const response = await axios.post<RequestSelfPasswordResetResponse>(
      "/auth/password-reset/request",
      req,
    );
    return response.data;
  } catch (err: unknown) {
    const messageFromResponse = readErrorMessageFromUnknownError(err);
    if (messageFromResponse) {
      throw new Error(messageFromResponse);
    }
    if (err instanceof Error) {
      throw new Error(err.message || "Request failed");
    }
    throw new Error("Request failed");
  }
}

