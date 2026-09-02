import { GetItemCommand, QueryCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  generateParticipantId,
  looksLikeParticipantId,
  normalizeParticipantRef,
  type ParticipantProfile,
} from "@yogaswap/shared";

export const GSI_PARTICIPANT_ID = "GSI_ParticipantId";
export const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";

export type ResolvedParticipant = {
  participantId: string;
  nickname: string;
  profile?: ParticipantProfile;
};

export async function fetchParticipantByNickname(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  nickname: string,
): Promise<ParticipantProfile | undefined> {
  const trimmed = nickname.trim();
  if (!trimmed) return undefined;

  const exact = await client.send(
    new GetItemCommand({
      TableName: participantsTable,
      Key: { tenantId: { S: tenantId }, userId: { S: trimmed } },
      ConsistentRead: true,
    }),
  );
  if (exact.Item?.userId?.S) {
    return profileFromItem(exact.Item);
  }

  const normalized = normalizeParticipantRef(trimmed);
  const query = await client.send(
    new QueryCommand({
      TableName: participantsTable,
      IndexName: PARTICIPANTS_NORMALIZED_INDEX,
      KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
      ExpressionAttributeValues: {
        ":tenantId": { S: tenantId },
        ":userIdNormalized": { S: normalized },
      },
      Limit: 1,
    }),
  );
  const item = query.Items?.[0];
  return item ? profileFromItem(item) : undefined;
}

export async function fetchParticipantById(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  participantId: string,
): Promise<ParticipantProfile | undefined> {
  const id = participantId.trim();
  if (!id) return undefined;

  const gsi = await client.send(
    new QueryCommand({
      TableName: participantsTable,
      IndexName: GSI_PARTICIPANT_ID,
      KeyConditionExpression: "tenantId = :tenantId AND participantId = :participantId",
      ExpressionAttributeValues: {
        ":tenantId": { S: tenantId },
        ":participantId": { S: id },
      },
      Limit: 1,
    }),
  );
  const item = gsi.Items?.[0];
  if (item) return profileFromItem(item);

  return undefined;
}

/**
 * Resolve nickname or participantId to canonical participant record.
 * Generates no new IDs — use ensureParticipantId for writes.
 */
export async function resolveParticipantRef(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  nicknameOrId: string,
): Promise<ResolvedParticipant | undefined> {
  const raw = nicknameOrId.trim();
  if (!raw) return undefined;

  if (looksLikeParticipantId(raw)) {
    const profile = await fetchParticipantById(client, participantsTable, tenantId, raw);
    if (!profile?.participantId) return undefined;
    return {
      participantId: profile.participantId,
      nickname: profile.userId,
      profile,
    };
  }

  const profile = await fetchParticipantByNickname(client, participantsTable, tenantId, raw);
  if (!profile?.participantId) return undefined;
  return {
    participantId: profile.participantId,
    nickname: profile.userId,
    profile,
  };
}

export function profileFromItem(item: Record<string, { S?: string }>): ParticipantProfile | undefined {
  const tenantId = item.tenantId?.S;
  const userId = item.userId?.S;
  if (!tenantId || !userId) return undefined;
  const participantId = item.participantId?.S?.trim() || userId;
  return {
    tenantId,
    participantId,
    userId,
    ...(item.userIdNormalized?.S ? { userIdNormalized: item.userIdNormalized.S } : {}),
    ...(item.email?.S ? { email: item.email.S } : {}),
    ...(item.authUserId?.S ? { authUserId: item.authUserId.S } : {}),
    ...(item.inviteSentAt?.S ? { inviteSentAt: item.inviteSentAt.S } : {}),
    ...(item.inviteCompletedAt?.S ? { inviteCompletedAt: item.inviteCompletedAt.S } : {}),
  };
}

/** Returns existing participantId or a newly generated one (caller must persist). */
export function ensureParticipantId(profile?: Pick<ParticipantProfile, "participantId">): string {
  const existing = profile?.participantId?.trim();
  if (existing) return existing;
  return generateParticipantId();
}

/**
 * Nickname for operational Dynamo writes (#317 hybrid).
 * Falls back to the raw ref when no profile exists (legacy nickname).
 */
export async function resolveOperationalNickname(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  nicknameOrId: string,
): Promise<string> {
  const raw = nicknameOrId.trim();
  if (!raw) return raw;
  const resolved = await resolveParticipantRef(client, participantsTable, tenantId, raw);
  return resolved?.nickname ?? raw;
}

/**
 * Refs to query for swaps/overrides during migration (nickname + UUID aliases).
 */
export async function resolveParticipantQueryRefs(
  client: DynamoDBClient,
  participantsTable: string | undefined,
  tenantId: string,
  nicknameOrId: string,
): Promise<string[]> {
  const trimmed = nicknameOrId.trim();
  if (!trimmed) return [];
  if (!participantsTable) return [trimmed];

  const resolved = await resolveParticipantRef(client, participantsTable, tenantId, trimmed);
  const refs: string[] = [];
  if (resolved) {
    refs.push(resolved.nickname);
    if (resolved.participantId.toLowerCase() !== resolved.nickname.toLowerCase()) {
      refs.push(resolved.participantId);
    }
  }
  if (!refs.some((entry) => entry.toLowerCase() === trimmed.toLowerCase())) {
    refs.push(trimmed);
  }
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const entry of refs) {
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }
  return unique;
}

/**
 * Map nickname or participantId refs to operational nicknames for storage.
 */
export async function resolveOperationalNicknameList(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  refs: string[],
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const trimmed = ref.trim();
    if (!trimmed) continue;
    const nickname = await resolveOperationalNickname(client, participantsTable, tenantId, trimmed);
    const key = normalizeParticipantRef(nickname);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(nickname);
  }
  return out;
}

/**
 * Map a list of nickname or participantId refs to participantIds.
 * Unknown refs are passed through unchanged (legacy data during migration).
 */
export async function resolveParticipantIdList(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  refs: string[],
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const trimmed = ref.trim();
    if (!trimmed) continue;
    const resolved = await resolveParticipantRef(client, participantsTable, tenantId, trimmed);
    const id = resolved?.participantId ?? trimmed;
    const key = normalizeParticipantRef(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

/** Nickname + participantId aliases for dual-read stem/override matching. */
export async function resolveParticipantRefAliases(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  nicknameOrId: string,
): Promise<string[]> {
  const trimmed = nicknameOrId.trim();
  if (!trimmed) return [];
  const resolved = await resolveParticipantRef(client, participantsTable, tenantId, trimmed);
  const aliases = resolved ? [resolved.nickname, resolved.participantId] : [trimmed];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const alias of aliases) {
    const key = alias.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(alias.trim());
  }
  return out;
}
