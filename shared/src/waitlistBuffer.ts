/**
 * Persönlicher Wartelisten-Zeitpuffer (#438).
 * Default = Studio-Absagefrist; nur gleich oder länger.
 */

import { DEFAULT_CANCELLATION_SWAP_CUTOFF_MINUTES } from "./cancellationSwapCutoff";

export const MAX_WAITLIST_NO_PROMOTE_MINUTES = 24 * 60;

/** Effektiver Puffer: mind. Studio-Absagefrist, höchstens 24h. */
export function resolveWaitlistNoPromoteWithinMinutes(
  personalMinutes: number | undefined | null,
  studioCutoffMinutes: number = DEFAULT_CANCELLATION_SWAP_CUTOFF_MINUTES,
): number {
  const floor = clampStudioCutoff(studioCutoffMinutes);
  if (
    typeof personalMinutes === "number" &&
    Number.isInteger(personalMinutes) &&
    personalMinutes >= floor
  ) {
    return Math.min(personalMinutes, MAX_WAITLIST_NO_PROMOTE_MINUTES);
  }
  return floor;
}

function clampStudioCutoff(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < 0) {
    return DEFAULT_CANCELLATION_SWAP_CUTOFF_MINUTES;
  }
  return Math.min(minutes, MAX_WAITLIST_NO_PROMOTE_MINUTES);
}

/** Adaptive Schrittweite: unter 2h → 15 Min, unter 6h → 30 Min, danach 1h. */
export function waitlistBufferStepMinutes(currentMinutes: number): number {
  if (currentMinutes < 120) return 15;
  if (currentMinutes < 360) return 30;
  return 60;
}

export function snapWaitlistBufferMinutes(
  value: number,
  min: number,
  max: number = MAX_WAITLIST_NO_PROMOTE_MINUTES,
): number {
  const floor = Math.max(0, Math.min(min, max));
  const ceiling = Math.max(floor, Math.min(max, MAX_WAITLIST_NO_PROMOTE_MINUTES));
  const clamped = Math.min(ceiling, Math.max(floor, value));
  const step = waitlistBufferStepMinutes(clamped);
  const steps = Math.round((clamped - floor) / step);
  return Math.min(ceiling, Math.max(floor, floor + steps * step));
}

export function stepWaitlistBufferMinutes(
  current: number,
  direction: 1 | -1,
  min: number,
  max: number = MAX_WAITLIST_NO_PROMOTE_MINUTES,
): number {
  const floor = Math.max(0, Math.min(min, max));
  const ceiling = Math.max(floor, Math.min(max, MAX_WAITLIST_NO_PROMOTE_MINUTES));
  const base = Number.isFinite(current) ? current : floor;
  // Schritt an der aktuellen Zone (beim Hochzählen) bzw. leicht darunter (beim Runterzählen).
  const probe = direction === 1 ? base : Math.max(floor, base - 1);
  const step = waitlistBufferStepMinutes(probe);
  return snapWaitlistBufferMinutes(base + direction * step, floor, ceiling);
}

/** Lesbare Dauer für Labels (z. B. „2 Std.“ / „90 Min.“). */
export function formatWaitlistBufferDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes === 0) return "0 Min.";
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 Std." : `${hours} Std.`;
  }
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours} Std. ${rest} Min.`;
  }
  return `${minutes} Min.`;
}
