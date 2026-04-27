export type DelegatedAction =
  | "create_override"
  | "update_override"
  | "delete_override"
  | "create_swap"
  | "update_swap"
  | "delete_swap";

const DELEGATED_ACTION_ALLOWLIST = new Set<DelegatedAction>([
  "create_override",
  "update_override",
  "delete_override",
  "create_swap",
  "update_swap",
  "delete_swap",
]);

export function ensureDelegatedActionAllowed(params: {
  action: DelegatedAction;
  actorUserId?: string | null;
  actingForUserId?: string | null;
}): { ok: true } | { ok: false; statusCode: number; error: string } {
  const actingFor = params.actingForUserId?.trim();
  if (!actingFor) return { ok: true };

  const actor = params.actorUserId?.trim();
  if (!actor) {
    return { ok: false, statusCode: 403, error: "Delegation requires authenticated actor user." };
  }

  if (actor.toLowerCase() === actingFor.toLowerCase()) {
    return { ok: false, statusCode: 400, error: "Delegation target must differ from actor." };
  }

  if (!DELEGATED_ACTION_ALLOWLIST.has(params.action)) {
    return { ok: false, statusCode: 403, error: "Delegated action is not allowed." };
  }

  return { ok: true };
}
