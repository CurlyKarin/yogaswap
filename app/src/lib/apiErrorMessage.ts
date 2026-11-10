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
