import { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient, AdminSetUserPasswordCommand} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});
const dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION || "eu-central-1" });

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

  if (!email || !nickname || !role) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
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
        { Name: "email", Value: email },
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
  const link = `${baseUrl}/invite?nickname=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`;

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
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "YogaSwap Einladung" },
        Body: { Html: { Data: emailHtml } }
      }
    }));
    emailSent = true;
    console.log("SES email sent successfully to", email);
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