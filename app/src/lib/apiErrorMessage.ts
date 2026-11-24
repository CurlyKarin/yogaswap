import axios from "axios";

/** Prefer API `{ error }` body over generic Axios status text. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown; message?: unknown } | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error.trim();
    if (typeof data?.message === "string" && data.message.trim()) return data.message.trim();
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}

export function apiErrorCode(err: unknown): string | undefined {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { code?: unknown } | undefined;
    if (typeof data?.code === "string" && data.code.trim()) return data.code.trim();
  }
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && code.trim()) return code.trim();
  }
  return undefined;
}
