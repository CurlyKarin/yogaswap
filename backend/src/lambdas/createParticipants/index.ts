import {
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetItemCommand, PutItemCommand, QueryCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import crypto from "crypto";
import { dynamoClient } from "../shared/dynamoClient";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});
const dynamodb = dynamoClient;

const DEFAULT_TENANT_ID = "default-tenant";
const PARTICIPANTS_NORMALIZED_INDEX = "GSI_UserIdNormalized";

function getTenantId(event: any): string {
  // Behandle baseEvent-Mock (event.headers ist in tests teils undefined, daher Fallback prüfen)
  const headers = event.headers || {};
  return headers['x-tenant-id'] || headers['X-Tenant-ID'] || DEFAULT_TENANT_ID;
}

function generateSafeTempPassword(length = 10) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

function generateOneTimeToken(bytes = 32) {
  // base64url => keine "/" oder "+" im Token (besser für URL-Parameter).
  return crypto.randomBytes(bytes).toString("base64url");
}

async function saveParticipantProfile(params: {
  tenantId: string;
  userId: string;
  email?: string;
  inviteSentAt?: string;
  cognitoUsername?: string;
  authUserId?: string;
}) {
  if (!process.env.PARTICIPANTS_TABLE) {
    console.warn("PARTICIPANTS_TABLE environment variable not set, skipping participant profile write.");
    return;
  }

  let item: Record<string, AttributeValue> = {
    tenantId: { S: params.tenantId },
    userId: { S: params.userId },
    userIdNormalized: { S: params.userId.toLowerCase() },
  };

  try {
    const existing = await dynamodb.send(
      new GetItemCommand({
        TableName: process.env.PARTICIPANTS_TABLE,
        Key: {
          tenantId: { S: params.tenantId },
          userId: { S: params.userId },
        },
        ConsistentRead: true,
      }),
    );
    if (existing.Item) {
      item = {
        ...existing.Item,
        tenantId: { S: params.tenantId },
        userId: { S: params.userId },
        userIdNormalized: { S: params.userId.toLowerCase() },
      };
    }
  } catch (err) {
    console.warn("Could not read existing participant profile, proceeding with upsert.", err);
  }

  if (params.email && params.email.trim()) {
    item.email = { S: params.email.trim() };
  }
  if (params.inviteSentAt && params.inviteSentAt.trim()) {
    item.inviteSentAt = { S: params.inviteSentAt };
  }
  if (params.cognitoUsername && params.cognitoUsername.trim()) {
    item.cognitoUsername = { S: params.cognitoUsername.trim() };
  }
  if (params.authUserId && params.authUserId.trim()) {
    item.authUserId = { S: params.authUserId.trim() };
  }

  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.PARTICIPANTS_TABLE,
      Item: item,
    }),
  );
}

/** Cognito liefert den kanonischen Username + sub; beides kann von Dynamo (z. B. nach Altlasten) abweichen. */
async function resolveCognitoUsernameAndSub(
  userPoolId: string,
  primaryUsername: string,
  fallbackUsername: string,
): Promise<{ username: string; sub?: string } | null> {
  const candidates = [primaryUsername, fallbackUsername].filter(
    (v, i, a) => v.trim() && a.indexOf(v) === i,
  );
  for (const candidate of candidates) {
    try {
      const resp = await cognito.send(
        new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: candidate,
        }),
      );
      const canonical = resp.Username?.trim();
      if (!canonical) continue;
      const sub = resp.UserAttributes?.find((a) => a.Name === "sub")?.Value?.trim();
      return { username: canonical, sub: sub || undefined };
    } catch {
      // nächster Kandidat (Groß-/Kleinschreibung, veralteter cognitoUsername in Dynamo)
    }
  }
  return null;
}

export const handler = async (event: any) => {
  console.log('EVENT:', JSON.stringify(event));
  // Debug: Environment Variables ausgeben
  console.log('Environment Variables:', {
    SES_SOURCE_EMAIL: process.env.SES_SOURCE_EMAIL,
    USER_POOL_ID: process.env.USER_POOL_ID,
    BASE_URL: process.env.BASE_URL
  });  

  if (event.body == null) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing request body" }) };
  }
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { email, nickname, role } = body ?? {};
  const tenantId = getTenantId(event);
  const tokensTable = process.env.AUTH_TOKENS_TABLE;
  const tokenInviteEnabled = !!tokensTable;

  const emailNormalized = typeof email === "string" ? email.trim() : "";
  const hasEmail = emailNormalized.length > 0;
  const nicknameRaw = typeof nickname === "string" ? nickname.trim() : "";
  const nicknameNormalized = nicknameRaw.toLowerCase();

  if (!nicknameRaw || !role) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // "First entry wins": resolve canonical userId case-insensitively.
  let canonicalUserId = nicknameRaw;
  let cognitoUsername = nicknameRaw;
  let existingAuthUserId: string | undefined;
  let existingEmail: string | undefined;
  if (process.env.PARTICIPANTS_TABLE) {
    try {
      const existingExactLower = await dynamodb.send(
        new GetItemCommand({
          TableName: process.env.PARTICIPANTS_TABLE,
          Key: { tenantId: { S: tenantId }, userId: { S: nicknameNormalized } },
          ConsistentRead: true,
        }),
      );
      const lowerItem = existingExactLower.Item as
        | {
            userId?: { S?: string };
            authUserId?: { S?: string };
            cognitoUsername?: { S?: string };
            email?: { S?: string };
          }
        | undefined;
      if (lowerItem?.userId?.S) {
        canonicalUserId = lowerItem.userId.S;
        cognitoUsername = lowerItem.cognitoUsername?.S || lowerItem.userId.S;
        existingAuthUserId = lowerItem.authUserId?.S;
        existingEmail = lowerItem.email?.S;
      } else {
        const queryResp = await dynamodb.send(
          new QueryCommand({
            TableName: process.env.PARTICIPANTS_TABLE,
            IndexName: PARTICIPANTS_NORMALIZED_INDEX,
            KeyConditionExpression: "tenantId = :tenantId AND userIdNormalized = :userIdNormalized",
            ExpressionAttributeValues: {
              ":tenantId": { S: tenantId },
              ":userIdNormalized": { S: nicknameNormalized },
            },
            Limit: 1,
          }),
        );
        const matched = queryResp.Items?.[0];
        if (matched?.userId?.S) {
          canonicalUserId = matched.userId.S;
          cognitoUsername = matched.cognitoUsername?.S || matched.userId.S;
          existingAuthUserId = matched.authUserId?.S;
          existingEmail = matched.email?.S;
        }
      }
    } catch (lookupErr) {
      console.warn("Failed canonical participant lookup, fallback to raw nickname", lookupErr);
    }
  }

  // Security hardening (#94): For new/invite flows with email we require token-table mode.
  // Existing login reactivation without token table remains allowed (no temp password mail).
  if (hasEmail && !tokensTable && !existingAuthUserId) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "AUTH_TOKENS_TABLE is required for secure invite flow",
      }),
    };
  }

  // Email optional: if missing/empty, skip Cognito and SES and only write membership to DynamoDB.
  if (!hasEmail) {
    const reactivated = !!existingAuthUserId;
    let emailSent = false;
    try {
      if (process.env.MEMBERSHIPS_TABLE) {
        await dynamodb.send(
          new PutItemCommand({
            TableName: process.env.MEMBERSHIPS_TABLE,
            Item: {
              tenantId: { S: tenantId },
              userId: { S: canonicalUserId },
              role: { S: role },
            },
          }),
        );
        console.log(
          `Membership saved in DynamoDB (no email): user=${canonicalUserId}, tenant=${tenantId}, role=${role}`,
        );
      } else {
        console.warn(
          "MEMBERSHIPS_TABLE environment variable not set, skipping DynamoDB write.",
        );
      }

      await saveParticipantProfile({
        tenantId,
        userId: canonicalUserId,
      });

      // If an already registered user is reactivated without passing email in request,
      // use the existing profile email to notify about reactivation.
      if (reactivated && existingEmail?.trim()) {
        const baseUrlEnv = process.env.BASE_URL || "";
        const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;
        const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
        const reactivatedHtml = `
          <h2>Hallo ${nicknameRaw}!</h2>
          <p>Dein Zugang zu YogaSwap wurde fuer dieses Studio reaktiviert.</p>
          <p>Du kannst dich mit deinem bestehenden Passwort wieder anmelden.</p>
          <p><a href="${baseUrl}">Zur Anmeldung</a></p>
        `;
        try {
          await ses.send(
            new SendEmailCommand({
              Source: sesSourceEmail,
              Destination: { ToAddresses: [existingEmail.trim()] },
              Message: {
                Subject: { Data: "YogaSwap Reaktivierung" },
                Body: { Html: { Data: reactivatedHtml } },
              },
            }),
          );
          emailSent = true;
        } catch (mailErr: any) {
          console.warn("SES reactivation email warning:", mailErr?.message || mailErr);
        }
      }
    } catch (err: any) {
      console.error("Failed to save membership in DynamoDB:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to create participant" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        username: canonicalUserId,
        emailSent,
        reactivated,
        warning:
          "E-Mail fehlt – Cognito/SES übersprungen. Teilnehmer wurde nur in DynamoDB angelegt.",
      }),
    };
  }

  // Bootstrap password for Cognito admin operations.
  // In token-based flow we keep it internal and then trigger the code flow from /invite.
  const rawPassword = generateSafeTempPassword(10) + "A1"; // ensure mix / length
  // Do NOT put passwords in URLs.

  const userId = canonicalUserId;

  let reactivated = false;
  try {
    // 1. User erstellen
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: cognitoUsername, // Nickname muss einzigartig sein
      TemporaryPassword: rawPassword ,
      UserAttributes: [
        { Name: "email", Value: emailNormalized },
        { Name: "email_verified", Value: "true" },
        { Name: "nickname", Value: nicknameRaw },
        { Name: "custom:role", Value: role }
      ],
      MessageAction: "SUPPRESS", // Keine automatische E-Mail
    }));

    // Token-based invite flow relies on reset code endpoint (AdminResetUserPassword).
    // For reliability, move newly created users to CONFIRMED with an internal password.
    if (tokenInviteEnabled) {
      await cognito.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: process.env.USER_POOL_ID!,
          Username: cognitoUsername,
          Password: rawPassword,
          Permanent: true,
        }),
      );
    }
  } catch (err: any) {
    // If user exists, set a new temporary password (so admin can re-invite)
    if (err?.name === "UsernameExistsException") {
      let hasLoginProfile = false;
      if (process.env.PARTICIPANTS_TABLE) {
        try {
          const existingParticipantResp = await dynamodb.send(
            new GetItemCommand({
              TableName: process.env.PARTICIPANTS_TABLE,
              Key: {
                tenantId: { S: tenantId },
                userId: { S: userId },
              },
              ConsistentRead: true,
            }),
          );
          let existingParticipant = existingParticipantResp.Item as
            | { authUserId?: { S?: string } }
            | undefined;
          // Backward compatibility for legacy mixed-case profile keys.
          if (!existingParticipant && nicknameRaw !== userId) {
            const legacyProfileResp = await dynamodb.send(
              new GetItemCommand({
                TableName: process.env.PARTICIPANTS_TABLE,
                Key: {
                  tenantId: { S: tenantId },
                  userId: { S: nicknameRaw },
                },
                ConsistentRead: true,
              }),
            );
            existingParticipant = legacyProfileResp.Item as
              | { authUserId?: { S?: string } }
              | undefined;
          }
          hasLoginProfile = !!(existingAuthUserId || existingParticipant?.authUserId?.S);
        } catch (profileErr) {
          console.warn("Could not read participant profile, fallback to password reset flow.", profileErr);
        }
      }

      if (hasLoginProfile) {
        if (tokenInviteEnabled) {
          // Bereits registriert: gleicher Token-/Invite-Link wie Neulinge (AdminResetUserPassword erst nach Klick).
          // Ohne diesen Pfad: reactivated + kein Token → keine E-Mail mit Link, UI-Status oft „active“ → Einladen-Button aus.
          reactivated = false;
          console.log("Username exists with login; resending token-based invite (recovery).");
          try {
            await cognito.send(
              new AdminUpdateUserAttributesCommand({
                UserPoolId: process.env.USER_POOL_ID!,
                Username: cognitoUsername,
                UserAttributes: [
                  { Name: "email", Value: emailNormalized },
                  { Name: "email_verified", Value: "true" },
                  { Name: "nickname", Value: nicknameRaw },
                ],
              }),
            );
            // Einige Cognito-Zustände (z. B. nach Altflows) erlauben kein AdminResetUserPassword.
            // Durch ein permanentes Passwort wird der User wieder in einen reset-fähigen Zustand gebracht.
            await cognito.send(
              new AdminSetUserPasswordCommand({
                UserPoolId: process.env.USER_POOL_ID!,
                Username: cognitoUsername,
                Password: rawPassword,
                Permanent: true,
              }),
            );
          } catch (err2: any) {
            console.error("AdminUpdateUserAttributes/AdminSetUserPassword failed (registered user resend):", err2);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to prepare existing user" }) };
          }
        } else {
          reactivated = true;
          console.log("Username exists with authUserId; reactivating without password reset.");
        }
      } else {
        console.log("Username exists; setting a new temporary password via AdminSetUserPassword");
        try {
          await cognito.send(new AdminSetUserPasswordCommand({
            UserPoolId: process.env.USER_POOL_ID!,
            Username: cognitoUsername,
            Password: rawPassword,
            // In token mode we need a CONFIRMED user so reset code can be issued reliably.
            Permanent: tokenInviteEnabled,
          }));
          // Ensure reset code can be delivered to the currently entered invite email.
          await cognito.send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: process.env.USER_POOL_ID!,
              Username: cognitoUsername,
              UserAttributes: [
                { Name: "email", Value: emailNormalized },
                { Name: "email_verified", Value: "true" },
                { Name: "nickname", Value: nicknameRaw },
              ],
            }),
          );
        } catch (err2: any) {
          console.error("AdminSetUserPassword/AdminUpdateUserAttributes failed:", err2);
          return { statusCode: 500, body: JSON.stringify({ error: "Failed to prepare existing user" }) };
        }
      }
    } else {
      console.error("AdminCreateUser failed:", err);
      return { statusCode: 500, body: JSON.stringify({ error: "Failed to create user" }) };
    }
  }

  // 2. Gruppe zuweisen
  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: cognitoUsername,
      GroupName: role,
    }));
  } catch (err: any) {
    console.warn("Group assignment error (ignored):", err.message);
  }

  // 3. UserTenantMembership in DynamoDB speichern
  try {
    if (process.env.MEMBERSHIPS_TABLE) {
      await dynamodb.send(new PutItemCommand({
        TableName: process.env.MEMBERSHIPS_TABLE,
        Item: {
          tenantId: { S: tenantId },
          userId: { S: userId },
          role: { S: role }
        }
      }));
      console.log(`Membership saved in DynamoDB: user=${userId}, tenant=${tenantId}, role=${role}`);
    } else {
      console.warn("MEMBERSHIPS_TABLE environment variable not set, skipping DynamoDB write.");
    }
  } catch (err: any) {
    console.error("Failed to save membership in DynamoDB:", err);
    // Wir werfen hier keinen Fehler, da der User in Cognito bereits existiert,
    // aber wir loggen es deutlich.
  }

  // Cognito-Username mit Dynamo abgleichen (kanonischer Username). authUserId nur nach abgeschlossener
  // Einladung im Client (updateParticipant), nicht hier – sonst „registriert“ ohne echtes Onboarding.
  const poolId = process.env.USER_POOL_ID;
  if (poolId) {
    const resolved = await resolveCognitoUsernameAndSub(poolId, cognitoUsername, userId);
    if (resolved) {
      cognitoUsername = resolved.username;
      try {
        await saveParticipantProfile({
          tenantId,
          userId,
          email: emailNormalized,
          cognitoUsername: resolved.username,
        });
      } catch (syncErr) {
        console.warn("Could not persist Cognito sync to participant profile:", syncErr);
      }
    } else {
      console.warn(
        `AdminGetUser failed for invite user: tried cognitoUsername=${cognitoUsername}, userId=${userId}`,
      );
    }
  }

  // Build link (only nickname in the URL)
  const baseUrlEnv = process.env.BASE_URL || "";
  const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;
  const tokenTtlSeconds = Number(process.env.AUTH_TOKEN_TTL_SECONDS || "3600");
  const nowSeconds = Math.floor(Date.now() / 1000);

  let oneTimeToken: string | undefined;
  let link = `${baseUrl}/invite?nickname=${encodeURIComponent(cognitoUsername)}&email=${encodeURIComponent(emailNormalized)}`;

  // Token nur für "echte Einladung" (nicht für Reaktivierung ohne Passwortreset).
  if (!reactivated && tokensTable) {
    oneTimeToken = generateOneTimeToken();
    try {
      await dynamodb.send(
        new PutItemCommand({
          TableName: tokensTable,
          Item: {
            tenantId: { S: tenantId },
            token: { S: oneTimeToken },
            cognitoUsername: { S: cognitoUsername },
            userId: { S: userId },
            purpose: { S: "invite-activation" },
            createdAt: { N: String(nowSeconds) },
            expiresAt: { N: String(nowSeconds + tokenTtlSeconds) },
          },
        }),
      );
    } catch (tokenErr) {
      console.warn("Failed to store one-time token:", tokenErr);
      oneTimeToken = undefined;
    }

    if (oneTimeToken) {
      link = `${baseUrl}/invite?tenantId=${encodeURIComponent(tenantId)}&token=${encodeURIComponent(
        oneTimeToken,
      )}&nickname=${encodeURIComponent(cognitoUsername)}&email=${encodeURIComponent(emailNormalized)}`;
    }
  }

  if (!reactivated && tokenInviteEnabled && !oneTimeToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Failed to create secure invite token",
      }),
    };
  }

  // Send invitation email (Token-Link, kein temporäres Passwort im E-Mail-Body)
  const emailHtml = reactivated
    ? `
      <h2>Hallo ${nicknameRaw}!</h2>
      <p>Dein Zugang zu YogaSwap wurde für dieses Studio reaktiviert.</p>
      <p>Du kannst dich mit deinem bestehenden Passwort wieder anmelden.</p>
      <p><a href="${baseUrl}">Zur Anmeldung</a></p>
    `
    : tokensTable && oneTimeToken
      ? `
        <h2>Hallo ${nicknameRaw}!</h2>
        <p>Du wurdest zu YogaSwap eingeladen.</p>
        <p><a href="${link}">Klicke hier, um ein neues Passwort festzulegen</a></p>
        <p>Danach erhältst du eine E-Mail mit einem Code zur Bestätigung.</p>
      `
      : `
        <h2>Hallo ${nicknameRaw}!</h2>
        <p>Dein Zugang wird vorbereitet.</p>
        <p>Bitte kontaktiere dein Studio, falls du keinen gueltigen Einladungslink erhalten hast.</p>
      `;

  let emailSent = false;
  try {
    const sesSourceEmail = process.env.SES_SOURCE_EMAIL || "yogaswap@example.com";
    // Debug: Zeige die verwendete E-Mail-Adresse
    console.log(`📧 Verwende SES Source Email: "${sesSourceEmail}"`);
    console.log(`📧 process.env.SES_SOURCE_EMAIL = "${process.env.SES_SOURCE_EMAIL}"`);
    await ses.send(new SendEmailCommand({
      Source: sesSourceEmail,
      Destination: { ToAddresses: [emailNormalized] },
      Message: {
        Subject: { Data: reactivated ? "YogaSwap Reaktivierung" : "YogaSwap Einladung" },
        Body: { Html: { Data: emailHtml } }
      }
    }));
    emailSent = true;
    console.log("SES email sent successfully to", emailNormalized);
  } catch (err: any) {
    console.warn("SES send warning:", err?.message || err);
    // do not fail user creation if SES can't send (depending on your policy)
    // In token-basierten Flows wird kein temporäres Passwort per E-Mail verschickt.
  }

  console.log("createParticipants: created/updated username=", userId);
  // Do NOT log passwords in production normally, but log if email failed
  if (!emailSent) {
    console.warn(`⚠️ WICHTIG: E-Mail nicht versendet. User '${userId}' benötigt den Einladungslink.`);
  }

  const inviteSentAt = new Date().toISOString();
  try {
    await saveParticipantProfile({
      tenantId,
      userId,
      email: emailNormalized,
      inviteSentAt,
      cognitoUsername,
    });
  } catch (err: any) {
    console.warn("Failed to save participant profile (ignored):", err?.message || err);
  }

  return { 
    statusCode: 200, 
    body: JSON.stringify({ 
      success: true, 
      username: userId, 
      link,
      emailSent,
      reactivated,
      ...(emailSent || reactivated
        ? {}
        : { 
            inviteToken: oneTimeToken,
            warning: "E-Mail konnte nicht versendet werden. Bitte Einladungslink (oder Token) manuell übermitteln."
          })
    }) 
  };
};