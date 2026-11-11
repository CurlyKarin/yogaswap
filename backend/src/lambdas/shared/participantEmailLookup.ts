import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { ParticipantProfile, ParticipantSettings } from "@yogaswap/shared";
import { deriveParticipantStatus } from "./participantStatus";

export const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";

export async function resolveParticipantEmail(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  requestedUserId: string,
): Promise<{
  email?: string;
  resolvedUserId?: string;
  displayName?: string;
  status?: "no_login" | "invited" | "active";
  lookupSource?: "exact" | "normalized";
  settings?: ParticipantSettings;
}> {
  const exactProfileResp = await client.send(
    new GetItemCommand({
      TableName: participantsTable,
      Key: {
        tenantId: { S: tenantId },
        userId: { S: requestedUserId },
      },
      ConsistentRead: true,
    }),
  );
  const exactItem = exactProfileResp.Item;
  const exactEmail = exactItem?.email?.S?.trim();
  const exactDisplayName = exactItem?.displayName?.S?.trim() || undefined;
  const exactStatus = exactItem
    ? deriveParticipantStatus({
        authUserId: exactItem.authUserId?.S,
        inviteSentAt: exactItem.inviteSentAt?.S,
        inviteCompletedAt: exactItem.inviteCompletedAt?.S,
      })
    : undefined;
  if (exactItem && exactEmail) {
    const profile = unmarshall(exactItem) as ParticipantProfile;
    return {
      email: exactEmail,
      resolvedUserId: requestedUserId,
      displayName: exactDisplayName,
      status: exactStatus,
      lookupSource: "exact",
      settings: profile.settings,
    };
  }

  let normalizedLookupResp;
  try {
    normalizedLookupResp = await client.send(
      new QueryCommand({
        TableName: participantsTable,
        IndexName: PARTICIPANTS_NORMALIZED_INDEX,
        KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
          ":userIdNormalized": { S: requestedUserId.toLowerCase() },
        },
        Limit: 1,
      }),
    );
  } catch (error) {
    console.warn("participant email normalized lookup failed", {
      tenantId,
      requestedUserId,
      indexName: PARTICIPANTS_NORMALIZED_INDEX,
      error,
    });
    return {};
  }
  const normalizedItem = normalizedLookupResp.Items?.[0];
  const normalizedEmail = normalizedItem?.email?.S?.trim();
  const normalizedUserId = normalizedItem?.userId?.S?.trim();
  const normalizedDisplayName = normalizedItem?.displayName?.S?.trim() || undefined;
  const normalizedStatus = normalizedItem
    ? deriveParticipantStatus({
        authUserId: normalizedItem.authUserId?.S,
        inviteSentAt: normalizedItem.inviteSentAt?.S,
        inviteCompletedAt: normalizedItem.inviteCompletedAt?.S,
      })
    : undefined;
  if (normalizedItem && normalizedEmail) {
    const profile = unmarshall(normalizedItem) as ParticipantProfile;
    return {
      email: normalizedEmail,
      resolvedUserId: normalizedUserId || requestedUserId,
      displayName: normalizedDisplayName,
      status: normalizedStatus,
      lookupSource: "normalized",
      settings: profile.settings,
    };
  }

  return {};
}
