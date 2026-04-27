let actingForUserId: string | null = null;

export function setActingForUserId(nextUserId: string | null): void {
  actingForUserId = nextUserId?.trim() || null;
}

export function getActingForUserId(): string | null {
  return actingForUserId;
}

export function delegationHeaders(): Record<string, string> | undefined {
  if (!actingForUserId) return undefined;
  return { "x-acting-for-user-id": actingForUserId };
}
