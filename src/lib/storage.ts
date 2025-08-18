import type { User } from "../types";

const CURRENT_USER_KEY = "yogaswap_current_user";

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

