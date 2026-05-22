import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
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
  status?: "no_login" | "invited" | "active";
  lookupSource?: "exact" | "normalized";
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
  const exactEmail = exactProfileResp.Item?.email?.S?.trim();
  const exactStatus = exactProfileResp.Item
    ? deriveParticipantStatus({
        authUserId: exactProfileResp.Item.authUserId?.S,
        inviteSentAt: exactProfileResp.Item.inviteSentAt?.S,
        inviteCompletedAt: exactProfileResp.Item.inviteCompletedAt?.S,
      })
    : undefined;
  if (exactProfileResp.Item && exactEmail) {
    return {
      email: exactEmail,
      resolvedUserId: requestedUserId,
      status: exactStatus,
      lookupSource: "exact",
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
  const normalizedStatus = normalizedItem
    ? deriveParticipantStatus({
        authUserId: normalizedItem.authUserId?.S,
        inviteSentAt: normalizedItem.inviteSentAt?.S,
        inviteCompletedAt: normalizedItem.inviteCompletedAt?.S,
      })
    : undefined;
  if (normalizedItem && normalizedEmail) {
    return {
      email: normalizedEmail,
      resolvedUserId: normalizedUserId || requestedUserId,
      status: normalizedStatus,
      lookupSource: "normalized",
    };
  }

  return {};
}
