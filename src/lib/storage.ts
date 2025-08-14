import type { User, UserActions } from "../types";

const CURRENT_USER_KEY = "yogaswap_current_user";
const ACTIONS_KEY_PREFIX = "yogaswap_user_actions_"; // + email

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

export function getUserActions(email: string): UserActions {
  const raw = localStorage.getItem(ACTIONS_KEY_PREFIX + email);
  if (!raw) return { absences: [], swapRequests: [] };
  try {
    return JSON.parse(raw) as UserActions;
  } catch {
    return { absences: [], swapRequests: [] };
  }
}

export function setUserActions(email: string, actions: UserActions) {
  localStorage.setItem(ACTIONS_KEY_PREFIX + email, JSON.stringify(actions));
}

export function toggleAbsence(email: string, courseId: number) {
  const a = getUserActions(email);
  const exists = a.absences.includes(courseId);
  const absences = exists ? a.absences.filter(id => id !== courseId) : [...a.absences, courseId];
  setUserActions(email, { ...a, absences });
}

export function toggleSwap(email: string, courseId: number) {
  const a = getUserActions(email);
  const exists = a.swapRequests.includes(courseId);
  const swapRequests = exists ? a.swapRequests.filter(id => id !== courseId) : [...a.swapRequests, courseId];
  setUserActions(email, { ...a, swapRequests });
}
