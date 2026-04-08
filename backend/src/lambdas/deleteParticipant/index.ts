import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  DeleteItemCommand,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { ParticipantProfile } from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import { buildStudioAccessRemovedMail } from "../shared/templates/auth/authMailTemplates";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;
const ses = new SESClient({});

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;

  if (!participantsTable || !membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "PARTICIPANTS_TABLE, MEMBERSHIPS_TABLE or TENANTS_TABLE env var is not set",
      }),
    };
  }

  const userId = event.pathParameters?.userId?.trim();
  if (!userId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing userId in path" }),
    };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
    const canManage = await canActorManageParticipants({
      client,
      membershipsTable,
      tenantsTable,
      tenantId,
      actorUserId,
    });
    if (!canManage) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }
    const actorMembershipResp = await client.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: actorUserId },
        },
        ConsistentRead: true,
      }),
    );
    const actorRole = actorMembershipResp.Item?.role?.S;
    if (actorRole !== "admin") {
      return { statusCode: 403, body: JSON.stringify({ error: "Only admins can delete participants" }) };
    }

    const existingResp = await client.send(
      new GetItemCommand({
        TableName: participantsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
        ConsistentRead: true,
      }),
    );
    const profile = existingResp.Item
      ? (unmarshall(existingResp.Item) as ParticipantProfile)
      : undefined;

    await client.send(
      new DeleteItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
      }),
    );

    let profileDeleted = false;
    const hasAuthUserId = !!profile?.authUserId;
    const notificationEmail = profile?.email?.trim() || "";
    let notificationEmailSent = false;

    if (profile && !hasAuthUserId) {
      const membershipsByUser = await client.send(
        new ScanCommand({
          TableName: membershipsTable,
          FilterExpression: "userId = :uid",
          ExpressionAttributeValues: {
            ":uid": { S: userId },
          },
          ConsistentRead: true,
        }),
      );
      const hasAnyMembership = (membershipsByUser.Count ?? 0) > 0;

      if (!hasAnyMembership) {
        await client.send(
          new DeleteItemCommand({
            TableName: participantsTable,
            Key: {
              tenantId: { S: tenantId },
              userId: { S: userId },
            },
          }),
        );
        profileDeleted = true;
      }
    }

    // Optional notification email when participant has an email address.
    if (profile?.email) {
      const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
      const mailLocale = process.env.MAIL_LOCALE || "de";
      const removedMail = buildStudioAccessRemovedMail({
        locale: mailLocale,
        nickname: profile.userId || userId,
      });
      try {
        await ses.send(
          new SendEmailCommand({
            Source: sesSourceEmail,
            Destination: { ToAddresses: [profile.email] },
            Message: {
              Subject: { Data: removedMail.subject },
              Body: {
                Html: {
                  Data: removedMail.html,
                },
              },
            },
          }),
        );
        notificationEmailSent = true;
      } catch (mailErr) {
        // Deletion must not fail because of SES issues.
        console.warn("deleteParticipant email notification failed:", mailErr);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        membershipDeleted: true,
        profileDeleted,
        notificationEmail: notificationEmail || undefined,
        notificationEmailSent,
      }),
    };
  } catch (error) {
    console.error("Failed to delete participant:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to delete participant" }),
    };
  }
};

