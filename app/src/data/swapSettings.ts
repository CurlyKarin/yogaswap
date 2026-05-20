import { resolveSwapWindow } from "shared/tenantSettings";
import type { SwapSettings } from "../types";

/** Fallback wenn kein Tenant-Kontext geladen ist (Tests, Storybook). */
export const swapSettings: SwapSettings = resolveSwapWindow(undefined);
