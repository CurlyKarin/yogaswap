import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type {
  ParticipantProfile,
  ParticipantSettings,
  UserRole,
} from "@yogaswap/shared";
import { dynamoClient } from "../shared/dynamoClient";
import { canActorManageParticipants } from "../shared/participantAuthorization";
import { deriveParticipantStatus } from "../shared/participantStatus";
import { getTenantContext } from "../shared/tenantContext";

const client = dynamoClient;
const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

function generateSafeTempPassword(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

type UpdateParticipantBody = {
  email?: string | null;
  settings?: ParticipantSettings;
  inviteSentAt?: string | null;
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

  const userId = event.pathParameters?.userId?.trim();
  if (!userId) {
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
    const hasAuthUserId =
      Object.prototype.hasOwnProperty.call(body, "authUserId") &&
      typeof body.authUserId === "string" &&
      body.authUserId.trim().length > 0;

    const hasOtherMutationKeys =
      Object.prototype.hasOwnProperty.call(body, "email") ||
      Object.prototype.hasOwnProperty.call(body, "settings") ||
      Object.prototype.hasOwnProperty.call(body, "inviteSentAt") ||
      Object.prototype.hasOwnProperty.call(body, "role");

    // Allow a participant to self-link their own Cognito `sub` once after sign-up.
    // This is required for participants created via invitation to move from "invited" -> "active".
    const isSelfAuthLink =
      actorUserId?.toLowerCase() === userId.toLowerCase() &&
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
    if (requestsRoleChange || requestsForcedPasswordReset) {
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

    const existingResp = await client.send(
      new GetItemCommand({
        TableName: tableName,
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
        body: JSON.stringify({ error: "Participant not found" }),
      };
    }

    const existing = unmarshall(existingResp.Item) as ParticipantProfile;
    const existingCognitoUsername = existingResp.Item.cognitoUsername?.S;
    let passwordResetTriggered = false;
    let passwordResetEmailSent = false;
    const updated: ParticipantProfile = {
      ...existing,
      tenantId,
      userId,
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
            const cognitoUsername = existingCognitoUsername || userId;
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
            if (emailChanged) {
              await cognito.send(
                new AdminUserGlobalSignOutCommand({
                  UserPoolId: userPoolId,
                  Username: cognitoUsername,
                }),
              );
            }

            if (emailChanged && body.forcePasswordResetOnEmailChange) {
              const rawPassword = `${generateSafeTempPassword(10)}A1`;
              await cognito.send(
                new AdminSetUserPasswordCommand({
                  UserPoolId: userPoolId,
                  Username: cognitoUsername,
                  Password: rawPassword,
                  Permanent: false,
                }),
              );
              passwordResetTriggered = true;

              const baseUrlEnv = process.env.BASE_URL || "";
              const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;
              const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
              const link = `${baseUrl}/invite?nickname=${encodeURIComponent(cognitoUsername)}&email=${encodeURIComponent(email)}`;
              try {
                await ses.send(
                  new SendEmailCommand({
                    Source: sesSourceEmail,
                    Destination: { ToAddresses: [email] },
                    Message: {
                      Subject: { Data: "YogaSwap Passwort zuruecksetzen" },
                      Body: {
                        Html: {
                          Data: `
                            <h2>Hallo ${userId}!</h2>
                            <p>Deine E-Mail-Adresse wurde aktualisiert. Bitte setze jetzt ein neues Passwort.</p>
                            <p><a href="${link}">Klicke hier, um ein neues Passwort zu setzen</a></p>
                            <div style="margin-top:12px;">
                              <p style="margin:0 0 6px 0;"><strong>Temporäres Passwort (bitte kopieren & einfügen):</strong></p>
                              <div>
                                <code style="display:inline-block;background:#f0f0f0;padding:8px 10px;border-radius:4px;line-height:1.4;font-family:monospace;">${rawPassword}</code>
                              </div>
                            </div>
                          `,
                        },
                      },
                    },
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

    if (Object.prototype.hasOwnProperty.call(body, "authUserId")) {
      if (typeof body.authUserId === "string" && body.authUserId.trim()) {
        updated.authUserId = body.authUserId;
      } else {
        delete updated.authUserId;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "role")) {
      const nextRole = body.role;
      if (!nextRole || !["admin", "instructor", "participant"].includes(nextRole)) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid role value" }),
        };
      }
      await client.send(
        new PutItemCommand({
          TableName: membershipsTable,
          Item: marshall({
            tenantId,
            userId,
            role: nextRole,
          }),
        }),
      );
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

