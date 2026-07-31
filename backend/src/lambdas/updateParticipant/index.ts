import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import {
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import crypto from "crypto";
import type {
  ParticipantProfile,
  ParticipantSettings,
  UserRole,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import { deriveParticipantStatus } from "../shared/participantStatus";
import { getTenantContext } from "../shared/tenantContext";
import { resolveAppBaseUrlForTenant } from "../shared/appBaseUrl";
import {
  buildEmailChangedNewAddressMail,
  buildEmailChangedOldAddressMail,
  buildRecoveryMail,
  buildRoleChangedMail,
  toSesAuthMessage,
} from "../shared/templates/auth/authMailTemplates";
import { resolveSesSourceEmail } from "../shared/notifications/sesFromAddress";
import { loadTenantName } from "../shared/tenantSettingsLoader";

const client = dynamoClient;
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});
const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";

function generateOneTimeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

type UpdateParticipantBody = {
  email?: string | null;
  settings?: ParticipantSettings;
  inviteSentAt?: string | null;
  inviteCompletedAt?: string | null;
  authUserId?: string | null;
  role?: UserRole;
  forcePasswordResetOnEmailChange?: boolean;
};

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

  const requestedUserId = event.pathParameters?.userId?.trim();
  if (!requestedUserId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing userId in path" }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let body: UpdateParticipantBody;
  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { tenantId, userId: actorUserId } = getTenantContext(event);
  if (!actorUserId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  try {
    let studioName: string | undefined;
    let studioNameLoaded = false;
    const getStudioName = async () => {
      if (!studioNameLoaded) {
        studioName = await loadTenantName(client, tenantsTable, tenantId);
        studioNameLoaded = true;
      }
      return studioName;
    };
    const hasAuthUserId =
      Object.prototype.hasOwnProperty.call(body, "authUserId") &&
      typeof body.authUserId === "string" &&
      body.authUserId.trim().length > 0;

    const hasOtherMutationKeys =
      Object.prototype.hasOwnProperty.call(body, "email") ||
      Object.prototype.hasOwnProperty.call(body, "settings") ||
      Object.prototype.hasOwnProperty.call(body, "inviteSentAt") ||
      Object.prototype.hasOwnProperty.call(body, "inviteCompletedAt") ||
      Object.prototype.hasOwnProperty.call(body, "role");

    // Allow a participant to self-link their own Cognito `sub` once after sign-up.
    // This is required for participants created via invitation to move from "invited" -> "active".
    const isSelfAuthLink =
      actorUserId?.toLowerCase() === requestedUserId.toLowerCase() &&
      hasAuthUserId &&
      !hasOtherMutationKeys;

    if (!isSelfAuthLink) {
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
    }

    const requestsRoleChange = Object.prototype.hasOwnProperty.call(body, "role");
    const requestsForcedPasswordReset =
      body.forcePasswordResetOnEmailChange === true;

    let actorMembershipRole: string | undefined;
    const requestsEmailChange = Object.prototype.hasOwnProperty.call(body, "email");
    if (requestsRoleChange || requestsForcedPasswordReset || requestsEmailChange) {
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
      actorMembershipRole = actorMembershipResp.Item?.role?.S;
    }

    if (requestsRoleChange) {
      if (actorMembershipRole !== "admin") {
        return { statusCode: 403, body: JSON.stringify({ error: "Only admins can change roles" }) };
      }
    }
    if (requestsForcedPasswordReset) {
      if (actorMembershipRole !== "admin") {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Only admins can force password reset on email change" }),
        };
      }
    }

    let targetUserId = requestedUserId;
    const existingResp = await client.send(
      new GetItemCommand({
        TableName: tableName,
        Key: {
          tenantId: { S: tenantId },
          userId: { S: targetUserId },
        },
        ConsistentRead: true,
      }),
    );

    let existingItem = existingResp.Item;
    if (!existingItem) {
      const queryResp = await client.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: PARTICIPANTS_NORMALIZED_INDEX,
          KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
          ExpressionAttributeValues: {
            ":tenantId": { S: tenantId },
            ":userIdNormalized": { S: requestedUserId.toLowerCase() },
          },
          Limit: 1,
        }),
      );
      const queryMatched = queryResp.Items?.[0];
      if (queryMatched?.userId?.S) {
        targetUserId = queryMatched.userId.S;
        existingItem = queryMatched;
      }
    }

    if (!existingItem) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Participant not found" }),
      };
    }

    const existing = unmarshall(existingItem) as ParticipantProfile;
    const existingCognitoUsername = existingItem.cognitoUsername?.S;
    const existingStatus = deriveParticipantStatus(existing);
    let targetMembershipRole: UserRole | undefined;
    if (actorMembershipRole === "instructor" || requestsRoleChange) {
      const targetMembershipResp = await client.send(
        new GetItemCommand({
          TableName: membershipsTable,
          Key: {
            tenantId: { S: tenantId },
            userId: { S: targetUserId },
          },
          ConsistentRead: true,
        }),
      );
      targetMembershipRole = targetMembershipResp.Item?.role?.S as UserRole | undefined;
    }
    if (requestsEmailChange) {
      const requestedEmail = typeof body.email === "string" ? body.email.trim() : body.email;
      const currentEmail = (existing.email ?? "").trim().toLowerCase();
      const nextEmail = (requestedEmail ?? "").trim().toLowerCase();
      const emailChanged = currentEmail !== nextEmail;
      const hasAuthLink = !!existing.authUserId;
      const wasPreviouslyRegistered = !!existing.inviteCompletedAt;
      if (emailChanged && actorMembershipRole === "instructor" && targetMembershipRole && targetMembershipRole !== "participant") {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Instructors can update participants only" }),
        };
      }
      if (
        emailChanged &&
        actorMembershipRole !== "admin" &&
        (existingStatus === "active" || hasAuthLink || wasPreviouslyRegistered)
      ) {
        return {
          statusCode: 403,
          body: JSON.stringify({ error: "Only admins can change email of registered participants" }),
        };
      }
    }
    let passwordResetTriggered = false;
    let passwordResetEmailSent = false;
    let roleChanged = false;
    let roleChangedEmailSent = false;
    let previousRole: UserRole | undefined;
    let nextRoleForMail: UserRole | undefined;
    const updated: ParticipantProfile = {
      ...existing,
      tenantId,
      userId: targetUserId,
      userIdNormalized: targetUserId.toLowerCase(),
    };

    if (Object.prototype.hasOwnProperty.call(body, "email")) {
      const email = typeof body.email === "string" ? body.email.trim() : body.email;
      if (email) {
        const shouldSyncCognitoEmail =
          !!existing.authUserId || !!existing.inviteSentAt || !!existingCognitoUsername;
        const currentEmail = (existing.email ?? "").trim().toLowerCase();
        const nextEmail = email.trim().toLowerCase();
        const emailChanged = currentEmail !== nextEmail;
        if (shouldSyncCognitoEmail) {
          const userPoolId = process.env.USER_POOL_ID;
          if (!userPoolId) {
            return {
              statusCode: 500,
              body: JSON.stringify({ error: "USER_POOL_ID env var is not set" }),
            };
          }
          try {
            const cognitoUsername = existingCognitoUsername || targetUserId;
            await cognito.send(
              new AdminUpdateUserAttributesCommand({
                UserPoolId: userPoolId,
                Username: cognitoUsername,
                UserAttributes: [
                  { Name: "email", Value: email },
                  { Name: "email_verified", Value: "true" },
                ],
              }),
            );
            if (emailChanged && existingStatus === "active") {
              await cognito.send(
                new AdminUserGlobalSignOutCommand({
                  UserPoolId: userPoolId,
                  Username: cognitoUsername,
                }),
              );
            }

            if (emailChanged && existingStatus === "active") {
              const baseUrl = resolveAppBaseUrlForTenant(tenantId);
              const sesSourceEmail = resolveSesSourceEmail();
              const mailLocale = process.env.MAIL_LOCALE || "de";
              const oldEmail = (existing.email ?? "").trim();

              // Best practice: confirm change to new address.
              try {
                const changedNewMail = buildEmailChangedNewAddressMail({
                  locale: mailLocale,
                  nickname: targetUserId,
                  loginUrl: baseUrl,
                  newEmail: email,
                  studioName: await getStudioName(),
                  studioUrl: baseUrl,
                });
                await ses.send(
                  new SendEmailCommand({
                    Source: sesSourceEmail,
                    Destination: { ToAddresses: [email] },
                    Message: toSesAuthMessage(changedNewMail),
                  }),
                );
              } catch (mailErr) {
                console.warn("Failed to send email-change confirmation to new address:", mailErr);
              }

              // Optional security notification to old address (if different).
              if (oldEmail && oldEmail.toLowerCase() !== email.toLowerCase()) {
                try {
                  const changedOldMail = buildEmailChangedOldAddressMail({
                    locale: mailLocale,
                    nickname: targetUserId,
                    loginUrl: baseUrl,
                    newEmail: email,
                    studioName: await getStudioName(),
                    studioUrl: baseUrl,
                  });
                  await ses.send(
                    new SendEmailCommand({
                      Source: sesSourceEmail,
                      Destination: { ToAddresses: [oldEmail] },
                      Message: toSesAuthMessage(changedOldMail),
                    }),
                  );
                } catch (mailErr) {
                  console.warn("Failed to send email-change security mail to old address:", mailErr);
                }
              }
            }

            if (emailChanged && existingStatus === "active" && body.forcePasswordResetOnEmailChange) {
              const authTokensTable = process.env.AUTH_TOKENS_TABLE;
              if (!authTokensTable) {
                return {
                  statusCode: 500,
                  body: JSON.stringify({ error: "AUTH_TOKENS_TABLE env var is not set" }),
                };
              }

              const tokenTtlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || "3600");
              const nowSeconds = Math.floor(Date.now() / 1000);
              const oneTimeToken = generateOneTimeToken();
              await client.send(
                new PutItemCommand({
                  TableName: authTokensTable,
                  Item: {
                    tenantId: { S: tenantId },
                    token: { S: oneTimeToken },
                    cognitoUsername: { S: cognitoUsername },
                    userId: { S: targetUserId },
                    purpose: { S: "admin-password-reset" },
                    createdAt: { N: String(nowSeconds) },
                    expiresAt: { N: String(nowSeconds + tokenTtlSeconds) },
                  },
                }),
              );
              passwordResetTriggered = true;

              const baseUrl = resolveAppBaseUrlForTenant(tenantId);
              const sesSourceEmail = resolveSesSourceEmail();
              const mailLocale = process.env.MAIL_LOCALE || "de";
              const link = `${baseUrl}/invite?mode=admin_reset&tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(oneTimeToken)}&nickname=${encodeURIComponent(cognitoUsername)}&email=${encodeURIComponent(email)}`;
              const recoveryMail = buildRecoveryMail({
                locale: mailLocale,
                nickname: targetUserId,
                link,
                studioName: await getStudioName(),
                studioUrl: baseUrl,
              });
              try {
                await ses.send(
                  new SendEmailCommand({
                    Source: sesSourceEmail,
                    Destination: { ToAddresses: [email] },
                    Message: toSesAuthMessage(recoveryMail),
                  }),
                );
                passwordResetEmailSent = true;
                updated.inviteSentAt = new Date().toISOString();
              } catch (mailErr) {
                console.warn("Failed to send password-reset email after email change:", mailErr);
              }
            }
          } catch (syncErr) {
            console.error("Failed to sync email to Cognito:", syncErr);
            return {
              statusCode: 502,
              body: JSON.stringify({ error: "Failed to sync email to auth profile" }),
            };
          }
        }
        updated.email = email;
      }
      else delete updated.email;
    }

    if (Object.prototype.hasOwnProperty.call(body, "settings")) {
      if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
        updated.settings = body.settings;
      } else if (body.settings == null) {
        delete updated.settings;
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "settings must be an object" }),
        };
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "inviteSentAt")) {
      if (typeof body.inviteSentAt === "string" && body.inviteSentAt.trim()) {
        updated.inviteSentAt = body.inviteSentAt;
      } else {
        delete updated.inviteSentAt;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "inviteCompletedAt")) {
      if (typeof body.inviteCompletedAt === "string" && body.inviteCompletedAt.trim()) {
        updated.inviteCompletedAt = body.inviteCompletedAt;
      } else {
        delete updated.inviteCompletedAt;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "authUserId")) {
      if (typeof body.authUserId === "string" && body.authUserId.trim()) {
        updated.authUserId = body.authUserId;
      } else {
        delete updated.authUserId;
      }
    }

    if (isSelfAuthLink && hasAuthUserId) {
      updated.inviteCompletedAt = new Date().toISOString();
    }

    if (Object.prototype.hasOwnProperty.call(body, "role")) {
      const nextRole = body.role;
      if (!nextRole || !["admin", "instructor", "participant"].includes(nextRole)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid role value" }),
        };
      }
      const currentRole = targetMembershipRole;
      await client.send(
        new PutItemCommand({
          TableName: membershipsTable,
          Item: marshall({
            tenantId,
            userId: targetUserId,
            role: nextRole,
          }),
        }),
      );
      previousRole = currentRole;
      nextRoleForMail = nextRole;
      roleChanged = currentRole !== nextRole;
    }

    if (roleChanged && existingStatus === "active" && updated.email) {
      const baseUrl = resolveAppBaseUrlForTenant(tenantId);
      const sesSourceEmail = resolveSesSourceEmail();
      const mailLocale = process.env.MAIL_LOCALE || "de";
      try {
        const roleChangedMail = buildRoleChangedMail({
          locale: mailLocale,
          nickname: targetUserId,
          loginUrl: baseUrl,
          oldRole: previousRole ?? "participant",
          newRole: nextRoleForMail ?? "participant",
          studioName: await getStudioName(),
          studioUrl: baseUrl,
        });
        await ses.send(
          new SendEmailCommand({
            Source: sesSourceEmail,
            Destination: { ToAddresses: [updated.email] },
            Message: toSesAuthMessage(roleChangedMail),
          }),
        );
        roleChangedEmailSent = true;
      } catch (mailErr) {
        console.warn("Failed to send role-change notification mail:", mailErr);
      }
    }

    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: marshall(updated, { removeUndefinedValues: true }),
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...updated,
        status: deriveParticipantStatus(updated),
        passwordResetTriggered,
        passwordResetEmailSent,
        roleChanged,
        roleChangedEmailSent,
      }),
    };
  } catch (error) {
    console.error("Failed to update participant:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to update participant" }),
    };
  }
};

