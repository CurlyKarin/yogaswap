import {
  AdminGetUserCommand,
  ListUsersCommand,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { randomUUID } from "crypto";

export type CognitoUserRef = {
  username: string;
  sub?: string;
  status?: string;
};

/** Pool identity candidate for explicit Admin link vs new (#342). */
export type CognitoIdentityCandidate = {
  cognitoUsername: string;
  authUserId?: string;
  email?: string;
  nickname?: string;
  poolStatus?: string;
  /** True when Cognito nickname matches the requested studio login name (case-insensitive). */
  nicknameMatch?: boolean;
};

/** Opaque Cognito Username (#324) — not the studio login name. */
export function generateOpaqueCognitoUsername(): string {
  return randomUUID();
}

export function escapeCognitoListFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function attrValue(
  attrs: { Name?: string; Value?: string }[] | undefined,
  name: string,
): string | undefined {
  const value = attrs?.find((a) => a.Name === name)?.Value?.trim();
  return value || undefined;
}

function mapListUserToCandidate(user: {
  Username?: string;
  UserStatus?: string;
  Attributes?: { Name?: string; Value?: string }[];
}): CognitoIdentityCandidate | null {
  const username = user.Username?.trim();
  if (!username) return null;
  return {
    cognitoUsername: username,
    authUserId: attrValue(user.Attributes, "sub"),
    email: attrValue(user.Attributes, "email"),
    nickname: attrValue(user.Attributes, "nickname"),
    poolStatus: user.UserStatus,
  };
}

/**
 * Prefer Cognito users whose nickname matches the studio login name (#342).
 * Stable secondary order: nickname, then cognitoUsername.
 */
export function sortIdentityCandidatesByNicknamePreference(
  candidates: CognitoIdentityCandidate[],
  nickname?: string,
): CognitoIdentityCandidate[] {
  const nick = nickname?.trim().toLowerCase() ?? "";
  return [...candidates]
    .map((c) => ({
      ...c,
      nicknameMatch:
        nick.length > 0 && (c.nickname?.trim().toLowerCase() ?? "") === nick,
    }))
    .sort((a, b) => {
      if (a.nicknameMatch !== b.nicknameMatch) {
        return a.nicknameMatch ? -1 : 1;
      }
      const nickCmp = (a.nickname ?? "").localeCompare(b.nickname ?? "", undefined, {
        sensitivity: "base",
      });
      if (nickCmp !== 0) return nickCmp;
      return a.cognitoUsername.localeCompare(b.cognitoUsername);
    });
}

/** List pool users by email attribute (all matches in the page; typically few). */
export async function listCognitoUsersByEmail(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<CognitoIdentityCandidate[]> {
  const trimmed = email.trim();
  if (!trimmed) return [];
  const filter = `email = "${escapeCognitoListFilterValue(trimmed)}"`;
  try {
    const resp = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: filter,
        Limit: 20,
      }),
    );
    const out: CognitoIdentityCandidate[] = [];
    for (const user of resp.Users ?? []) {
      const mapped = mapListUserToCandidate(user);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (err) {
    console.warn("listCognitoUsersByEmail failed:", err);
    return [];
  }
}

/** Find a pool user by email attribute (first match). */
export async function findCognitoUserByEmail(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<CognitoUserRef | null> {
  const users = await listCognitoUsersByEmail(client, userPoolId, email);
  const user = users[0];
  if (!user) return null;
  return {
    username: user.cognitoUsername,
    sub: user.authUserId,
    status: user.poolStatus,
  };
}

/** Cognito liefert den kanonischen Username + sub; beides kann von Dynamo abweichen. */
export async function resolveCognitoUsernameAndSub(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  primaryUsername: string,
  fallbackUsername: string,
): Promise<CognitoUserRef | null> {
  const candidates = [primaryUsername, fallbackUsername].filter(
    (v, i, a) => v.trim() && a.indexOf(v) === i,
  );
  for (const candidate of candidates) {
    try {
      const resp = await client.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: candidate,
        }),
      );
      const canonical = resp.Username?.trim();
      if (!canonical) continue;
      const sub = resp.UserAttributes?.find((a) => a.Name === "sub")?.Value?.trim();
      return {
        username: canonical,
        sub: sub || undefined,
        status: resp.UserStatus,
      };
    } catch {
      // nächster Kandidat
    }
  }
  return null;
}

/** Dynamo cognitoUsername with legacy fallback to userId (#324 dual path). */
export function effectiveCognitoUsername(
  cognitoUsername: string | undefined | null,
  userId: string,
): string {
  const stored = cognitoUsername?.trim();
  return stored && stored.length > 0 ? stored : userId;
}
