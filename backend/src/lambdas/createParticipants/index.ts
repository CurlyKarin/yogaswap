import { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient, AdminSetUserPasswordCommand} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { GetItemCommand, PutItemCommand, ScanCommand, type AttributeValue } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "../shared/dynamoClient";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});
const dynamodb = dynamoClient;

const DEFAULT_TENANT_ID = "default-tenant";

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

async function saveParticipantProfile(params: {
  tenantId: string;
  userId: string;
  email?: string;
  inviteSentAt?: string;
  cognitoUsername?: string;
}) {
  if (!process.env.PARTICIPANTS_TABLE) {
    console.warn("PARTICIPANTS_TABLE environment variable not set, skipping participant profile write.");
    return;
  }

  let item: Record<string, AttributeValue> = {
    tenantId: { S: params.tenantId },
    userId: { S: params.userId },
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

  await dynamodb.send(
    new PutItemCommand({
      TableName: process.env.PARTICIPANTS_TABLE,
      Item: item,
    }),
  );
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
        const scanResp = await dynamodb.send(
          new ScanCommand({
            TableName: process.env.PARTICIPANTS_TABLE,
            FilterExpression: "tenantId = :tenantId",
            ExpressionAttributeValues: { ":tenantId": { S: tenantId } },
            ProjectionExpression: "userId, authUserId, cognitoUsername, email",
          }),
        );
        const matched = (scanResp.Items ?? []).find((item) => {
          const id = item.userId?.S ?? "";
          return id.toLowerCase() === nicknameNormalized;
        });
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

  // raw temporary password (safe characters)
  const rawPassword = generateSafeTempPassword(10) + "A1"; // ensure mix / length
  // Do NOT put the password in the URL; include in the email body only.

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
        reactivated = true;
        console.log("Username exists with authUserId; reactivating without password reset.");
      } else {
        console.log("Username exists; setting a new temporary password via AdminSetUserPassword");
        try {
          await cognito.send(new AdminSetUserPasswordCommand({
            UserPoolId: process.env.USER_POOL_ID!,
            Username: cognitoUsername,
            Password: rawPassword,
            Permanent: false // user must change on next sign-in
          }));
        } catch (err2: any) {
          console.error("AdminSetUserPassword failed:", err2);
          return { statusCode: 500, body: JSON.stringify({ error: "Failed to reset password" }) };
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

  // Build link (only nickname in the URL)
  const baseUrlEnv = process.env.BASE_URL || "";
  const baseUrl = baseUrlEnv.startsWith("http") ? baseUrlEnv : `https://${baseUrlEnv}`;
  const link = `${baseUrl}/invite?nickname=${encodeURIComponent(cognitoUsername)}&email=${encodeURIComponent(emailNormalized)}`;

  // Send invitation email (temp password shown in email body)
  const emailHtml = reactivated
    ? `
      <h2>Hallo ${nicknameRaw}!</h2>
      <p>Dein Zugang zu YogaSwap wurde für dieses Studio reaktiviert.</p>
      <p>Du kannst dich mit deinem bestehenden Passwort wieder anmelden.</p>
      <p><a href="${baseUrl}">Zur Anmeldung</a></p>
    `
    : `
      <h2>Hallo ${nicknameRaw}!</h2>
      <p>Du wurdest zu YogaSwap eingeladen.</p>
      <p><a href="${link}">Klicke hier, um dein temporäres Passwort einzugeben und ein neues Passwort zu setzen</a></p>
      <div style="margin-top:12px;">
        <p style="margin:0 0 6px 0;"><strong>Temporäres Passwort (bitte kopieren & einfügen):</strong></p>
        <div>
          <code style="display:inline-block;background:#f0f0f0;padding:8px 10px;border-radius:4px;line-height:1.4;font-family:monospace;">${rawPassword}</code>
        </div>
      </div>
      <p>Tipp: Falls das Passwort beim Einfügen nicht funktioniert, achte auf keine Leerzeichen vor/nach dem Passwort.</p>
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
        Subject: { Data: "YogaSwap Einladung" },
        Body: { Html: { Data: emailHtml } }
      }
    }));
    emailSent = true;
    console.log("SES email sent successfully to", emailNormalized);
  } catch (err: any) {
    console.warn("SES send warning:", err?.message || err);
    // do not fail user creation if SES can't send (depending on your policy)
    // Falls E-Mail nicht versendet werden kann, logge das temporäre Passwort für den Admin
    console.warn(`⚠️ E-Mail konnte nicht versendet werden. Temporäres Passwort für User '${userId}': ${rawPassword}`);
  }

  console.log("createParticipants: created/updated username=", userId);
  // Do NOT log passwords in production normally, but log if email failed
  if (!emailSent) {
    console.warn(`⚠️ WICHTIG: E-Mail nicht versendet. User '${userId}' benötigt temporäres Passwort: ${rawPassword}`);
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
      // Nur wenn E-Mail nicht versendet wurde, Passwort zurückgeben (für Admin)
      ...(emailSent || reactivated
        ? {}
        : { tempPassword: rawPassword, warning: "E-Mail konnte nicht versendet werden. Bitte Passwort manuell übermitteln." })
    }) 
  };
};