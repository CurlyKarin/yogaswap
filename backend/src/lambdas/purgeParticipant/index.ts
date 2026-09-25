import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DeleteItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { ParticipantProfile } from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import {
  buildAccountPurgedMail,
  toSesAuthMessage,
} from "../shared/templates/auth/authMailTemplates";
import { loadStudioMailContext } from "../shared/studioContact";
import { resolveSesSourceEmail } from "../shared/notifications/sesFromAddress";
import { resolveAppBaseUrlForTenant } from "../shared/appBaseUrl";
import { getTenantContext } from "../shared/tenantContext";
import { invalidateAuthTokensForUser } from "../shared/invalidateAuthTokens";
import { deleteCognitoUserBestEffort } from "../shared/deleteIncompleteCognitoUser";
import { hasOtherStudioParticipantPresence } from "../shared/otherStudioPresence";

const client = dynamoClient;
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

/**
 * Permanent delete of a former (orphaned) studio member (#271).
 * Soft-delete / studio-exit stays on DELETE /participants/{userId}.
 */
export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const participantsTable = process.env.PARTICIPANTS_TABLE;
  const membershipsTable = process.env.MEMBERSHIPS_TABLE;
  const tenantsTable = process.env.TENANTS_TABLE;
  const authTokensTable = process.env.AUTH_TOKENS_TABLE;
  const userPoolId = process.env.USER_POOL_ID;

  if (!participantsTable || !membershipsTable || !tenantsTable) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error:
          "PARTICIPANTS_TABLE, MEMBERSHIPS_TABLE or TENANTS_TABLE env var is not set",
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
    if (actorMembershipResp.Item?.role?.S !== "admin") {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "Only admins can permanently delete participants" }),
      };
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
    if (!existingResp.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Participant profile not found" }),
      };
    }
    const profile = unmarshall(existingResp.Item) as ParticipantProfile;

    const membershipResp = await client.send(
      new GetItemCommand({
        TableName: membershipsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
        ConsistentRead: true,
      }),
    );
    if (membershipResp.Item) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error:
            "Person ist noch aktives Studio-Mitglied. Bitte zuerst aus dem Studio entfernen.",
          code: "still_active_member",
        }),
      };
    }

    const notificationEmail = profile.email?.trim() || "";
    let authTokensInvalidated = 0;
    if (authTokensTable) {
      try {
        authTokensInvalidated = await invalidateAuthTokensForUser({
          client,
          authTokensTable,
          tenantId,
          userId,
        });
      } catch (tokenErr) {
        console.warn("purgeParticipant token invalidation failed:", tokenErr);
      }
    }

    const hasOtherStudio = await hasOtherStudioParticipantPresence({
      client,
      participantsTable,
      tenantId,
      authUserId: profile.authUserId,
      cognitoUsername: profile.cognitoUsername,
    });

    await client.send(
      new DeleteItemCommand({
        TableName: participantsTable,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: userId },
        },
      }),
    );

    let cognitoUserDeleted = false;
    if (!hasOtherStudio && userPoolId) {
      cognitoUserDeleted = await deleteCognitoUserBestEffort({
        cognito,
        userPoolId,
        cognitoUsername: profile.cognitoUsername,
        userId,
      });
    }

    // Mail must not claim full account wipe if Cognito delete was skipped or failed.
    const effectiveScope =
      hasOtherStudio || !cognitoUserDeleted ? "studio_only" : "full_account";

    let notificationEmailAttempted = false;
    let notificationEmailSent = false;
    if (notificationEmail) {
      notificationEmailAttempted = true;
      const { studioName, studioContact } = await loadStudioMailContext(
        client,
        tenantsTable,
        tenantId,
      );
      const purgedMail = buildAccountPurgedMail({
        locale: process.env.MAIL_LOCALE || "de",
        nickname: profile.userId || userId,
        displayName: profile.displayName,
        studioName,
        studioUrl: resolveAppBaseUrlForTenant(tenantId),
        studioContact,
        purgeScope: effectiveScope,
      });
      try {
        await ses.send(
          new SendEmailCommand({
            Source: resolveSesSourceEmail(),
            Destination: { ToAddresses: [notificationEmail] },
            Message: toSesAuthMessage(purgedMail),
          }),
        );
        notificationEmailSent = true;
      } catch (mailErr) {
        console.warn("purgeParticipant email notification failed:", mailErr);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        profileDeleted: true,
        cognitoUserDeleted,
        purgeScope: effectiveScope,
        notificationEmail: notificationEmailAttempted
          ? notificationEmail || undefined
          : undefined,
        notificationEmailAttempted,
        notificationEmailSent,
        authTokensInvalidated,
        otherStudioPresence: hasOtherStudio,
      }),
    };
  } catch (error) {
    console.error("Failed to permanently delete participant:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to permanently delete participant" }),
    };
  }
};
