import { fetchAuthSession } from "aws-amplify/auth";
import { loadCurrentUser } from "shared/lib/storage";
import { clearCognitoSession } from "./cognitoSession";

/** sessionStorage key for one-shot login banner after forced logout (#318). */
export const SESSION_NOTICE_KEY = "yogaswap_session_notice";

export const SESSION_ENDED_EVENT = "yogaswap:session-ended";

export type SessionEndReason = "expired" | "idle" | "unauthorized";

/**
 * Idle logout for SPA (#318). Cognito refresh keeps short-lived tokens alive;
 * idle covers "tab left open overnight" without requiring bank-level timeouts.
 * 8h ≈ studio workday + buffer.
 */
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;

const SESSION_END_MESSAGES: Record<SessionEndReason, string> = {
  expired: "Deine Sitzung ist abgelaufen. Bitte melde Dich erneut an.",
  idle: "Du warst länger inaktiv. Bitte melde Dich erneut an.",
  unauthorized: "Deine Sitzung ist nicht mehr gültig. Bitte melde Dich erneut an.",
};

let endingSession = false;

export function setSessionNotice(message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  try {
    sessionStorage.setItem(SESSION_NOTICE_KEY, trimmed);
  } catch {
    // private mode / quota — ignore
  }
}

/** Read and clear the one-shot session notice for the Login screen. */
export function consumeSessionNotice(): string {
  try {
    const value = sessionStorage.getItem(SESSION_NOTICE_KEY)?.trim() ?? "";
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
    return value;
  } catch {
    return "";
  }
}

/**
 * Clear Cognito + local user cache and notify the SPA (#318).
 * Safe to call multiple times; concurrent calls coalesce.
 */
export async function endSessionDueToExpiry(reason: SessionEndReason): Promise<void> {
  if (endingSession) return;
  endingSession = true;
  try {
    setSessionNotice(SESSION_END_MESSAGES[reason]);
    await clearCognitoSession();
    window.dispatchEvent(
      new CustomEvent(SESSION_ENDED_EVENT, { detail: { reason } }),
    );
  } finally {
    endingSession = false;
  }
}

/** True when Amplify still has a usable ID token (refresh may run inside fetchAuthSession). */
export async function hasValidCognitoIdToken(): Promise<boolean> {
  try {
    const session = await fetchAuthSession();
    return !!session.tokens?.idToken;
  } catch {
    return false;
  }
}

/**
 * If local UI thinks we are logged in but Cognito has no token → force logout.
 * Used on tab focus / visibility restore (#318).
 */
export async function reconcileLocalUserWithCognitoSession(): Promise<void> {
  if (!loadCurrentUser()) return;
  const ok = await hasValidCognitoIdToken();
  if (!ok) {
    await endSessionDueToExpiry("expired");
  }
}

const IDLE_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
];

/**
 * Start idle watchdog. Returns cleanup. No-op when timeoutMs <= 0.
 */
export function startSessionIdleWatchdog(options?: {
  timeoutMs?: number;
  now?: () => number;
}): () => void {
  const timeoutMs = options?.timeoutMs ?? SESSION_IDLE_TIMEOUT_MS;
  if (timeoutMs <= 0) return () => undefined;

  const now = options?.now ?? (() => Date.now());
  let lastActivity = now();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const remaining = timeoutMs - (now() - lastActivity);
    timer = setTimeout(() => {
      void (async () => {
        if (stopped) return;
        if (!loadCurrentUser()) {
          schedule();
          return;
        }
        if (now() - lastActivity >= timeoutMs) {
          await endSessionDueToExpiry("idle");
          return;
        }
        schedule();
      })();
    }, Math.max(1000, remaining));
  };

  const onActivity = () => {
    lastActivity = now();
  };

  for (const eventName of IDLE_ACTIVITY_EVENTS) {
    window.addEventListener(eventName, onActivity, { passive: true });
  }
  schedule();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    for (const eventName of IDLE_ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, onActivity);
    }
  };
}

export type YogaswapSessionDebugApi = {
  /** Sofort Idle-Logout + Hinweis. */
  endIdle: () => Promise<void>;
  /** Sofort „Sitzung abgelaufen“. */
  endExpired: () => Promise<void>;
  /** Sofort „Sitzung nicht mehr gültig“ (wie nach 401). */
  endUnauthorized: () => Promise<void>;
  /**
   * Ersetzt den Idle-Watchdog durch einen kurzen Timeout (ms).
   * Danach: Tab liegen lassen, nicht klicken/scrollen.
   */
  startShortIdle: (timeoutMs?: number) => () => void;
};

declare global {
  interface Window {
    __yogaswapSession?: YogaswapSessionDebugApi;
  }
}

/** Console-Hilfe für manuelle Session-Tests (#318). Staging + DEV. */
export function installSessionDebugApi(): void {
  if (typeof window === "undefined") return;
  const host = window.location.hostname;
  const enabled =
    import.meta.env.DEV ||
    import.meta.env.VITE_SESSION_DEBUG === "1" ||
    host.includes("staging") ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (!enabled) return;

  let shortIdleStop: (() => void) | null = null;

  window.__yogaswapSession = {
    endIdle: () => endSessionDueToExpiry("idle"),
    endExpired: () => endSessionDueToExpiry("expired"),
    endUnauthorized: () => endSessionDueToExpiry("unauthorized"),
    startShortIdle: (timeoutMs = 60_000) => {
      shortIdleStop?.();
      shortIdleStop = startSessionIdleWatchdog({ timeoutMs });
      console.info(
        `[yogaswap] Short idle gestartet (${timeoutMs} ms). Keine Maus/Tastatur bis Logout.`,
      );
      return () => {
        shortIdleStop?.();
        shortIdleStop = null;
      };
    },
  };
  console.info(
    "[yogaswap] Session-Debug: window.__yogaswapSession.endIdle() | .endExpired() | .startShortIdle(60000)",
  );
}
