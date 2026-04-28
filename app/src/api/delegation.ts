let actingForUserId: string | null = null;
let actorUserId: string | null = null;

export function setActingForUserId(nextUserId: string | null): void {
  actingForUserId = nextUserId?.trim() || null;
}

export function getActingForUserId(): string | null {
  return actingForUserId;
}

export function setActorUserId(nextUserId: string | null): void {
  actorUserId = nextUserId?.trim() || null;
}

export function getActorUserId(): string | null {
  return actorUserId;
}

export function delegationHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {};
  if (actorUserId) {
    headers["x-actor-user-id"] = actorUserId;
  }
  if (actingForUserId) {
    headers["x-acting-for-user-id"] = actingForUserId;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}
