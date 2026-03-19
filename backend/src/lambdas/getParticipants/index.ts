import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import {
  type ParticipantProfile,
  type ParticipantStatus,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;

function deriveParticipantStatus(
  profile: Pick<ParticipantProfile, "authUserId" | "inviteSentAt">,
): ParticipantStatus {
  if (profile.authUserId) return "active";
  if (profile.inviteSentAt) return "invited";
  return "no_login";
}

type ParticipantListItem = ParticipantProfile & {
  status: ParticipantStatus;
};

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.PARTICIPANTS_TABLE;
  if (!tableName) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "PARTICIPANTS_TABLE env var is not set" }),
    };
  }

  const { tenantId } = getTenantContext(event);
  const search = (event.queryStringParameters?.search || "").trim().toLowerCase();

  try {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "tenantId = :tid",
        ExpressionAttributeValues: { ":tid": { S: tenantId } },
        ConsistentRead: true,
      }),
    );

    const profiles: ParticipantProfile[] = (result.Items || []).map((item) =>
      unmarshall(item) as ParticipantProfile,
    );

    const filtered = search
      ? profiles.filter((p) => {
          const userId = (p.userId || "").toLowerCase();
          const email = (p.email || "").toLowerCase();
          return userId.includes(search) || email.includes(search);
        })
      : profiles;

    const participants: ParticipantListItem[] = filtered
      .map((profile) => ({
        ...profile,
        status: deriveParticipantStatus(profile),
      }))
      .sort((a, b) => a.userId.localeCompare(b.userId));

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

