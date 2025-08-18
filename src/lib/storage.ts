import type { SwapSettings, User } from "../types";

const CURRENT_USER_KEY = "yogaswap_current_user";
const SWAP_SETTINGS_KEY = "swapSettings";

export function saveCurrentUser(user: User) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): User | null {
  const raw = localStorage.getItem(CURRENT_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function clearCurrentUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

// lib/storage.ts
export function getSwapSettings(): SwapSettings {
  const raw = localStorage.getItem(SWAP_SETTINGS_KEY);
  if (!raw) {
    return { minOffsetDays: 0, maxOffsetDays: 30 }; // Default
  }
  return JSON.parse(raw);
}

export function setSwapSettings(settings: SwapSettings) {
  localStorage.setItem(SWAP_SETTINGS_KEY, JSON.stringify(settings));
}
