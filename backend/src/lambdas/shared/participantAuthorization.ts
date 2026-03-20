import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { Tenant, UserTenantMembership } from "@yogaswap/shared";
import { canManageParticipants } from "./permissions";

type DynamoSender = {
  send: (command: GetItemCommand) => Promise<{ Item?: Record<string, unknown> }>;
};

/**
 * Gemeinsamer AuthZ-Check fuer Participant-Endpunkte.
 * Laedt Membership + Tenant und prueft danach zentral die Berechtigung
 * via `canManageParticipants`.
 */
export async function canActorManageParticipants(params: {
  client: DynamoSender;
  membershipsTable: string;
  tenantsTable: string;
  tenantId: string;
  actorUserId: string;
}): Promise<boolean> {
  const membershipResp = await params.client.send(
    new GetItemCommand({
      TableName: params.membershipsTable,
      Key: {
        tenantId: { S: params.tenantId },
        userId: { S: params.actorUserId },
      },
      ConsistentRead: true,
    }),
  );

  const membership = membershipResp.Item
    ? (unmarshall(membershipResp.Item as Record<string, { S: string }>) as UserTenantMembership)
    : undefined;
  if (!membership) return false;

  const tenantResp = await params.client.send(
    new GetItemCommand({
      TableName: params.tenantsTable,
      Key: { tenantId: { S: params.tenantId } },
      ConsistentRead: true,
    }),
  );
  const tenant = tenantResp.Item
    ? (unmarshall(tenantResp.Item as Record<string, { S: string }>) as Tenant)
    : undefined;

  return canManageParticipants(membership, tenant?.settings);
}
