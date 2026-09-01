import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  type ParticipantProfile,
  type ParticipantStatus,
  type UserRole,
  type UserTenantMembership,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import { deriveParticipantStatus } from "../shared/participantStatus";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

type ParticipantListItem = ParticipantProfile & {
  status: ParticipantStatus;
  role?: UserRole;
};

type SortBy = "nickname" | "userId" | "email" | "status";
type SortOrder = "asc" | "desc";

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  if (!tableName) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "PARTICIPANTS_TABLE env var is not set" }),
    };
  }
  if (!membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "MEMBERSHIPS_TABLE or TENANTS_TABLE env var is not set" }),
    };
  }

  const { tenantId, userId } = getTenantContext(event);
  const search = (event.queryStringParameters?.search || "").trim().toLowerCase();
  const rosterOnly = (event.queryStringParameters?.roster || "").trim().toLowerCase() === "true";
  const includeOrphaned = (event.queryStringParameters?.includeOrphaned || "")
    .trim()
    .toLowerCase() === "true";
  const statusFilter = (event.queryStringParameters?.status || "").trim().toLowerCase();
  const hasEmailFilter = (event.queryStringParameters?.hasEmail || "").trim().toLowerCase();
  const sortByRaw = (event.queryStringParameters?.sortBy || "nickname").trim();
  const sortOrderRaw = (event.queryStringParameters?.sortOrder || "asc").trim().toLowerCase();

  const sortBy: SortBy =
    sortByRaw === "nickname" || sortByRaw === "userId" || sortByRaw === "email" || sortByRaw === "status"
      ? sortByRaw
      : "nickname";
  const sortOrder: SortOrder = sortOrderRaw === "desc" ? "desc" : "asc";

  const allowedStatuses: ParticipantStatus[] = ["no_login", "invited", "active"];
  if (statusFilter && !allowedStatuses.includes(statusFilter as ParticipantStatus)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid status filter" }),
    };
  }
  if (hasEmailFilter && hasEmailFilter !== "true" && hasEmailFilter !== "false") {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid hasEmail filter" }),
    };
  }

  if (!userId) {
    console.warn("getParticipants forbidden: missing actor userId", { tenantId });
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
    console.log("getParticipants request", {
      tenantId,
      actorUserId: userId,
      search,
      includeOrphaned,
      statusFilter,
      hasEmailFilter,
      sortBy,
      sortOrder,
    });

    const canManage = await canActorManageParticipants({
      client,
      membershipsTable,
      tenantsTable,
      tenantId,
      actorUserId: userId,
    });
    if (!canManage && !rosterOnly) {
      console.warn("getParticipants forbidden: actor cannot manage participants", {
        tenantId,
        actorUserId: userId,
      });
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const profiles: ParticipantProfile[] = (result.Items || []).map((item) => {
      const profile = unmarshall(item) as ParticipantProfile;
      return {
        ...profile,
        participantId: profile.participantId?.trim() || profile.userId,
      };
    });

    const membershipsResult = await client.send(
      new QueryCommand({
        TableName: membershipsTable,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );
    const memberships: UserTenantMembership[] = (membershipsResult.Items || []).map((item) =>
      unmarshall(item) as UserTenantMembership,
    );
    const roleByUserId = new Map<string, UserRole>(
      memberships.map((m) => [m.userId, m.role]),
    );

    if (rosterOnly) {
      if (!memberships.some((membership) => membership.userId === userId)) {
        return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
      }
      const roster = profiles
        .filter((profile) => roleByUserId.has(profile.userId))
        .map((profile) => ({
          tenantId: profile.tenantId,
          userId: profile.userId,
          participantId: profile.participantId,
        }));
      return {
        statusCode: 200,
        body: JSON.stringify(roster),
      };
    }

    if (!canManage) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }

    console.log("getParticipants query result", {
      tenantId,
      rawCount: profiles.length,
    });

    const participants: ParticipantListItem[] = profiles
      .filter((profile) => includeOrphaned || roleByUserId.has(profile.userId))
      .map((profile) => ({
        ...profile,
        status: deriveParticipantStatus(profile),
        role: roleByUserId.get(profile.userId),
      }))
      .filter((p) => {
        if (search) {
          const participantUserId = (p.userId || "").toLowerCase();
          const participantEmail = (p.email || "").toLowerCase();
          if (!participantUserId.includes(search) && !participantEmail.includes(search)) return false;
        }

        if (statusFilter && p.status !== statusFilter) return false;

        if (hasEmailFilter === "true" && !(p.email && p.email.trim())) return false;
        if (hasEmailFilter === "false" && !!(p.email && p.email.trim())) return false;

        return true;
      })
      .sort((a, b) => {
        const getSortValue = (item: ParticipantListItem): string => {
          if (sortBy === "nickname" || sortBy === "userId") return item.userId || "";
          if (sortBy === "email") return item.email || "";
          return item.status;
        };

        const left = getSortValue(a).toLowerCase();
        const right = getSortValue(b).toLowerCase();
        const cmp = left.localeCompare(right);
        return sortOrder === "desc" ? -cmp : cmp;
      });

    console.log("getParticipants response", {
      tenantId,
      rawCount: profiles.length,
      filteredCount: participants.length,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(participants),
    };
  } catch (error) {
    console.error("Failed to list participants:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to list participants" }),
    };
  }
};

