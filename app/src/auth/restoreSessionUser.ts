import type { User, UserRole } from "shared/types";
import type { ResolveLoginResponse } from "../api/auth";

export type IdTokenPayload = Record<string, unknown>;

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Cognito identity fields used to bind a Studio-Login-Name to a session (#412). */
export function cognitoIdsFromIdTokenPayload(payload: IdTokenPayload): {
  sub: string | null;
  cognitoUsername: string | null;
} {
  return {
    sub: asTrimmedString(payload.sub),
    cognitoUsername: asTrimmedString(payload["cognito:username"]),
  };
}

export function userFieldsFromIdTokenPayload(payload: IdTokenPayload): {
  email: string;
  role: UserRole;
  jwtNickname: string | null;
} {
  return {
    email: asTrimmedString(payload.email) ?? "",
    role: (asTrimmedString(payload["custom:role"]) as UserRole | null) || "participant",
    jwtNickname: asTrimmedString(payload.nickname),
  };
}

function sameCognitoIdentity(
  resolvedCognitoUsername: string,
  ids: { sub: string | null; cognitoUsername: string | null },
): boolean {
  const resolved = resolvedCognitoUsername.trim().toLowerCase();
  if (!resolved) return false;
  if (ids.cognitoUsername && ids.cognitoUsername.toLowerCase() === resolved) return true;
  if (ids.sub && ids.sub.toLowerCase() === resolved) return true;
  return false;
}

/**
 * Actor after reload must be the Tenant Studio-Login-Name (`userId`), not Cognito JWT `nickname`
 * (can diverge across pools / wrong attributes — #412, #324).
 *
 * Prefer stored Studio name when it still belongs to this Cognito session (`authUserId`/`sub`
 * or `resolveLogin` → cognitoUsername). JWT nickname is only a last resort.
 */
export async function restoreStudioUserFromSession(params: {
  payload: IdTokenPayload;
  stored: User | null;
  resolveLogin: (req: { nickname: string }) => Promise<ResolveLoginResponse>;
}): Promise<User> {
  const { payload, stored, resolveLogin } = params;
  const ids = cognitoIdsFromIdTokenPayload(payload);
  const fields = userFieldsFromIdTokenPayload(payload);

  const withStudioNickname = (nickname: string): User => ({
    nickname,
    email: fields.email || stored?.email || "",
    role: fields.role,
    authUserId: ids.sub ?? stored?.authUserId ?? null,
  });

  const storedNickname = stored?.nickname?.trim() || null;
  const storedAuth = stored?.authUserId?.trim() || null;

  // Fast path: login previously persisted Cognito `sub` alongside Studio nickname.
  if (storedNickname && storedAuth && ids.sub && storedAuth === ids.sub) {
    return withStudioNickname(storedNickname);
  }

  if (storedNickname) {
    try {
      const resolved = await resolveLogin({ nickname: storedNickname });
      if (sameCognitoIdentity(resolved.cognitoUsername, ids)) {
        return withStudioNickname(resolved.nickname.trim() || storedNickname);
      }
    } catch {
      // fall through — session may still be valid; try cognito username / JWT
    }
  }

  // No trustworthy storage: try resolving Cognito username as Studio login (legacy pools).
  const lookupKey = ids.cognitoUsername || ids.sub;
  if (lookupKey) {
    try {
      const resolved = await resolveLogin({ nickname: lookupKey });
      if (sameCognitoIdentity(resolved.cognitoUsername, ids) && resolved.nickname.trim()) {
        return withStudioNickname(resolved.nickname.trim());
      }
    } catch {
      // fall through to JWT
    }
  }

  return withStudioNickname(
    fields.jwtNickname || storedNickname || ids.cognitoUsername || ids.sub || "unknown",
  );
}
