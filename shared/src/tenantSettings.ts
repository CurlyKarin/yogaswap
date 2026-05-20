import { DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END } from "./courseStatus";
import type { TenantSettings } from "./types";

export const DEFAULT_SWAP_MIN_OFFSET_DAYS = -7;
export const DEFAULT_SWAP_MAX_OFFSET_DAYS = 7;
export const DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS = 5;

export type SwapWindow = {
  minOffsetDays: number;
  maxOffsetDays: number;
};

export function resolveSwapWindow(settings?: TenantSettings): SwapWindow {
  const min = settings?.minOffsetDays;
  const max = settings?.maxOffsetDays;
  return {
    minOffsetDays:
      typeof min === "number" && Number.isInteger(min)
        ? min
        : DEFAULT_SWAP_MIN_OFFSET_DAYS,
    maxOffsetDays:
      typeof max === "number" && Number.isInteger(max)
        ? max
        : DEFAULT_SWAP_MAX_OFFSET_DAYS,
  };
}

export function resolveRollingExcludeLockWeeks(settings?: TenantSettings): number {
  const value = settings?.excludeLockWeeks;
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 52) {
    return value;
  }
  return DEFAULT_ROLLING_EXCLUDE_LOCK_WEEKS;
}

export function resolveInactiveGraceDays(settings?: TenantSettings): number {
  const value = settings?.inactiveGraceDaysAfterCourseEnd;
  return Number.isInteger(value) && (value ?? 0) >= 0
    ? (value as number)
    : DEFAULT_INACTIVE_GRACE_DAYS_AFTER_END;
}

export type StudioSettingsPatch = {
  name?: string;
  inactiveGraceDaysAfterCourseEnd?: number;
  minOffsetDays?: number;
  maxOffsetDays?: number;
  excludeLockWeeks?: number;
};

export function validateStudioSettingsPatch(patch: StudioSettingsPatch): string | null {
  if (Object.prototype.hasOwnProperty.call(patch, "name")) {
    const name = typeof patch.name === "string" ? patch.name.trim() : "";
    if (!name) return "Bitte einen Studionamen eingeben.";
  }
  if (Object.prototype.hasOwnProperty.call(patch, "inactiveGraceDaysAfterCourseEnd")) {
    const days = patch.inactiveGraceDaysAfterCourseEnd;
    if (!Number.isInteger(days) || (days ?? 0) < 0 || (days ?? 0) > 90) {
      return "Nachlauf muss eine ganze Zahl zwischen 0 und 90 sein.";
    }
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, "minOffsetDays") ||
    Object.prototype.hasOwnProperty.call(patch, "maxOffsetDays")
  ) {
    const min = patch.minOffsetDays;
    const max = patch.maxOffsetDays;
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      return "Tauschfenster: beide Werte müssen ganze Zahlen sein.";
    }
    if ((min ?? 0) < -90 || (min ?? 0) > 90 || (max ?? 0) < -90 || (max ?? 0) > 90) {
      return "Tauschfenster: Werte müssen zwischen -90 und 90 liegen.";
    }
    if ((min as number) > (max as number)) {
      return "Tauschfenster: „frühestens“ darf nicht größer als „spätestens“ sein.";
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, "excludeLockWeeks")) {
    const weeks = patch.excludeLockWeeks;
    if (!Number.isInteger(weeks) || (weeks ?? 0) < 1 || (weeks ?? 0) > 52) {
      return "Planungssperre muss eine ganze Zahl zwischen 1 und 52 Wochen sein.";
    }
  }
  return null;
}
