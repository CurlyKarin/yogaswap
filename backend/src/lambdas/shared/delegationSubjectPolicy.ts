import type { APIGatewayProxyResult } from "aws-lambda";
import { GetItemCommand, QueryCommand, type DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { canManageParticipantStatusInDelegation } from "./permissions";
import { deriveParticipantStatus } from "./participantStatus";
import { loadTenantSettings } from "./tenantSettingsLoader";
import { PARTICIPANTS_NORMALIZED_INDEX } from "./participantEmailLookup";

async function loadSubjectStatus(
  client: DynamoDBClient,
  participantsTable: string,
  tenantId: string,
  actingForUserId: string,
): Promise<ReturnType<typeof deriveParticipantStatus> | null> {
  const exact = await client.send(
    new GetItemCommand({
      TableName: participantsTable,
      Key: {
        tenantId: { S: tenantId },
        userId: { S: actingForUserId },
      },
      ConsistentRead: true,
    }),
  );
  if (exact.Item) {
    return deriveParticipantStatus({
      authUserId: exact.Item.authUserId?.S,
      inviteSentAt: exact.Item.inviteSentAt?.S,
      inviteCompletedAt: exact.Item.inviteCompletedAt?.S,
    });
  }

  try {
    const normalized = await client.send(
      new QueryCommand({
        TableName: participantsTable,
        IndexName: PARTICIPANTS_NORMALIZED_INDEX,
        KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
        ExpressionAttributeValues: {
          ":tenantId": { S: tenantId },
          ":userIdNormalized": { S: actingForUserId.toLowerCase() },
        },
        Limit: 1,
      }),
    );
    const item = normalized.Items?.[0];
    if (!item) return null;
    return deriveParticipantStatus({
      authUserId: item.authUserId?.S,
      inviteSentAt: item.inviteSentAt?.S,
      inviteCompletedAt: item.inviteCompletedAt?.S,
    });
  } catch (error) {
    console.warn("delegation subject normalized lookup failed", {
      tenantId,
      actingForUserId,
      error,
    });
    return null;
  }
}

/**
 * Wenn actingFor gesetzt ist: Subject-Status gegen
 * `delegationCanManageActiveParticipants` prüfen (#141).
 */
export async function getDelegationSubjectPolicyErrorResponse(params: {
  client: DynamoDBClient;
  tenantsTable?: string;
  participantsTable?: string;
  tenantId: string;
  actingForUserId?: string | null;
}): Promise<APIGatewayProxyResult | null> {
  const actingFor = params.actingForUserId?.trim();
  if (!actingFor) return null;

  if (!params.tenantsTable || !params.participantsTable) {
    console.error("delegation subject policy missing table env", {
      tenantId: params.tenantId,
      actingForUserId: actingFor,
      hasTenantsTable: Boolean(params.tenantsTable),
      hasParticipantsTable: Boolean(params.participantsTable),
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "TENANTS_TABLE or PARTICIPANTS_TABLE env var is not set",
      }),
    };
  }

  const settings = await loadTenantSettings(params.client, params.tenantsTable, params.tenantId);
  const status = await loadSubjectStatus(
    params.client,
    params.participantsTable,
    params.tenantId,
    actingFor,
  );
  if (!status) {
    return {
      statusCode: 403,
      body: JSON.stringify({ error: "Delegation subject not found." }),
    };
  }

  if (!canManageParticipantStatusInDelegation(status, settings)) {
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: "Delegation for active participants is disabled by studio settings.",
      }),
    };
  }

  return null;
}
