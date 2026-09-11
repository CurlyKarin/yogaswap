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

/** Opaque Cognito Username (#324) — not the studio login name. */
export function generateOpaqueCognitoUsername(): string {
  return randomUUID();
}

export function escapeCognitoListFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Find a pool user by email attribute (first match). */
export async function findCognitoUserByEmail(
  client: CognitoIdentityProviderClient,
  userPoolId: string,
  email: string,
): Promise<CognitoUserRef | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  const filter = `email = "${escapeCognitoListFilterValue(trimmed)}"`;
  try {
    const resp = await client.send(
      new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: filter,
        Limit: 5,
      }),
    );
    const user = resp.Users?.[0];
    const username = user?.Username?.trim();
    if (!user || !username) return null;
    const sub = user.Attributes?.find((a) => a.Name === "sub")?.Value?.trim();
    return {
      username,
      sub: sub || undefined,
      status: user.UserStatus,
    };
  } catch (err) {
    console.warn("findCognitoUserByEmail failed:", err);
    return null;
  }
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
