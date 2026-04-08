// shared/src/lib/storage.ts
import type { User } from '..';

const USER_KEY = "currentUser";
const LEGACY_USER_KEY = "yogaswap_current_user";

export const saveCurrentUser = (user: User) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  // Cleanup legacy key to avoid stale user resurrection.
  localStorage.removeItem(LEGACY_USER_KEY);
};

export const loadCurrentUser = (): User | null => {
  const data = localStorage.getItem(USER_KEY) ?? localStorage.getItem(LEGACY_USER_KEY);
  return data ? JSON.parse(data) : null;
};

export const clearCurrentUser = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LEGACY_USER_KEY);
  }
};
