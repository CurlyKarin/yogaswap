import { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient, AdminSetUserPasswordCommand} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
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
}) {
  if (!process.env.PARTICIPANTS_TABLE) {
    console.warn("PARTICIPANTS_TABLE environment variable not set, skipping participant profile write.");
    return;
  }

  const item: Record<string, { S: string }> = {
    tenantId: { S: params.tenantId },
    userId: { S: params.userId },
  };

  if (params.email && params.email.trim()) {
    item.email = { S: params.email.trim() };
  }
  if (params.inviteSentAt && params.inviteSentAt.trim()) {
    item.inviteSentAt = { S: params.inviteSentAt };
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

  const emailNormalized = typeof email === "string" ? email.trim() : "";
  const hasEmail = emailNormalized.length > 0;

  if (!nickname || !role) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // Email optional: if missing/empty, skip Cognito and SES and only write membership to DynamoDB.
  if (!hasEmail) {
    const tenantId = getTenantId(event);
    try {
      if (process.env.MEMBERSHIPS_TABLE) {
        await dynamodb.send(
          new PutItemCommand({
            TableName: process.env.MEMBERSHIPS_TABLE,
            Item: {
              tenantId: { S: tenantId },
              userId: { S: nickname },
              role: { S: role },
            },
          }),
        );
        console.log(
          `Membership saved in DynamoDB (no email): user=${nickname}, tenant=${tenantId}, role=${role}`,
        );
      } else {
        console.warn(
          "MEMBERSHIPS_TABLE environment variable not set, skipping DynamoDB write.",
        );
      }

      await saveParticipantProfile({
        tenantId,
        userId: nickname,
      });
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
        username: nickname,
        emailSent: false,
        warning:
          "E-Mail fehlt – Cognito/SES übersprungen. Teilnehmer wurde nur in DynamoDB angelegt.",
      }),
    };
  }

  // raw temporary password (safe characters)
  const rawPassword = generateSafeTempPassword(10) + "A1"; // ensure mix / length
  // Do NOT put the password in the URL; include in the email body only.

  // Use the nickname as Username (no suffix). If your pool is case-insensitive,
  // Cognito will internally normalize; at sign-in we normalize too (frontend).
  const username = nickname;

  try {
    // 1. User erstellen
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: nickname, // Nickname muss einzigartig sein
      TemporaryPassword: rawPassword ,
      UserAttributes: [
        { Name: "email", Value: emailNormalized },
        { Name: "email_verified", Value: "true" },
        { Name: "nickname", Value: username },
        { Name: "custom:role", Value: role }
      ],
      MessageAction: "SUPPRESS", // Keine automatische E-Mail
    }));
  } catch (err: any) {
    // If user exists, set a new temporary password (so admin can re-invite)
    if (err?.name === "UsernameExistsException") {
      console.log("Username exists; setting a new temporary password via AdminSetUserPassword");
      try {
        await cognito.send(new AdminSetUserPasswordCommand({
          UserPoolId: process.env.USER_POOL_ID!,
          Username: username,
          Password: rawPassword,
          Permanent: false // user must change on next sign-in
        }));
      } catch (err2: any) {
        console.error("AdminSetUserPassword failed:", err2);
        return { statusCode: 500, body: JSON.stringify({ error: "Failed to reset password" }) };
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
      Username: username,
      GroupName: role,
    }));
  } catch (err: any) {
    console.warn("Group assignment error (ignored):", err.message);
  }

  // 3. UserTenantMembership in DynamoDB speichern
  const tenantId = getTenantId(event);
  try {
    if (process.env.MEMBERSHIPS_TABLE) {
      await dynamodb.send(new PutItemCommand({
        TableName: process.env.MEMBERSHIPS_TABLE,
        Item: {
          tenantId: { S: tenantId },
          userId: { S: username },
          role: { S: role }
        }
      }));
      console.log(`Membership saved in DynamoDB: user=${username}, tenant=${tenantId}, role=${role}`);
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
  const link = `${baseUrl}/invite?nickname=${encodeURIComponent(username)}&email=${encodeURIComponent(emailNormalized)}`;

  // Send invitation email (temp password shown in email body)
  const emailHtml = `
    <h2>Hi ${nickname}!</h2>
    <p>Du wurdest zu YogaSwap eingeladen.</p>
    <p><a href="${link}">Klicke hier, um dein temporäres Passwort einzugeben und ein neues Passwort zu setzen</a></p>
    <p><strong>Temporäres Passwort (bitte kopieren & einfügen):</strong>
      <br/><code style="background:#f0f0f0;padding:4px 8px;border-radius:4px;">${rawPassword}</code>
    </p>
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
    console.warn(`⚠️ E-Mail konnte nicht versendet werden. Temporäres Passwort für User '${username}': ${rawPassword}`);
  }

  console.log("createParticipants: created/updated username=", username);
  // Do NOT log passwords in production normally, but log if email failed
  if (!emailSent) {
    console.warn(`⚠️ WICHTIG: E-Mail nicht versendet. User '${username}' benötigt temporäres Passwort: ${rawPassword}`);
  }

  try {
    await saveParticipantProfile({
      tenantId,
      userId: username,
      email: emailNormalized,
      inviteSentAt: emailSent ? new Date().toISOString() : undefined,
    });
  } catch (err: any) {
    console.warn("Failed to save participant profile (ignored):", err?.message || err);
  }

  return { 
    statusCode: 200, 
    body: JSON.stringify({ 
      success: true, 
      username: username, 
      link,
      emailSent,
      // Nur wenn E-Mail nicht versendet wurde, Passwort zurückgeben (für Admin)
      ...(emailSent ? {} : { tempPassword: rawPassword, warning: "E-Mail konnte nicht versendet werden. Bitte Passwort manuell übermitteln." })
    }) 
  };
};