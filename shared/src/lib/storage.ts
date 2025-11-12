// shared/src/lib/storage.ts
import type { User } from '..';

const USER_KEY = "yogaswap_current_user";

export const saveCurrentUser = (user: User) => {
  localStorage.setItem('currentUser', JSON.stringify(user));
};

export const loadCurrentUser = (): User | null => {
  const data = localStorage.getItem('currentUser');
  return data ? JSON.parse(data) : null;
};

export const clearCurrentUser = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_KEY);
  }
};
