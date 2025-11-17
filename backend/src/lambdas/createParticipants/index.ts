import { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient, AdminSetUserPasswordCommand} from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

export const handler = async (event: any) => {
  console.log('EVENT:', JSON.stringify(event));  

  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { email, nickname, role } = body;

  if (!email || !nickname || !role) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  // URL-sicheres temporäres Passwort (Base64-encoded)
  const rawPassword = Math.random().toString(36).slice(-8) + "A1!";
  const tempPasswordB64 = Buffer.from(rawPassword).toString('base64');
  // DEBUG-LOGS (temporär)
console.log("createParticipants: will create username =", nickname);
console.log("createParticipants: rawPassword =", rawPassword);

  try {
    // 1. User erstellen
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: nickname, // Nickname muss einzigartig sein
      TemporaryPassword: tempPasswordB64 ,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "nickname", Value: nickname },
        { Name: "custom:role", Value: role }
      ],
      MessageAction: "SUPPRESS", // Keine automatische E-Mail
    }));
  } catch (err: any) {
    if (err.name === "UsernameExistsException") {
      // Wenn Benutzer schon existiert, setze neues temporäres Passwort (force change)
      console.log("Username exists — resetting temporary password via AdminSetUserPassword");
      try {
        await cognito.send(new AdminSetUserPasswordCommand({
          UserPoolId: process.env.USER_POOL_ID!,
          Username: nickname,
          Password: rawPassword,
          Permanent: false, // false => user must change password on next sign-in
        }));
      } catch (err2: any) {
        console.error("AdminSetUserPassword failed:", err2);
        throw err2;
      }
    } else {
      console.error("AdminCreateUser failed:", err);
      throw err;
    }
  }

  // 2. Gruppe zuweisen
  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: nickname,
      GroupName: role,
    }));
  } catch (err: any) {
    console.warn("Group assignment error (ignored):", err.message);
  }

  // Link erstellen & Email senden (nickname + base64 temp)
  const baseUrl = process.env.BASE_URL?.startsWith("http") ? process.env.BASE_URL : `https://${process.env.BASE_URL}`;
  const link = `${baseUrl}/invite?nickname=${encodeURIComponent(nickname)}&temp=${encodeURIComponent(tempPasswordB64)}&email=${encodeURIComponent(email)}`;

  // E-Mail senden (nur wenn SES verifiziert)
  try {
    await ses.send(new SendEmailCommand({
      Source: "karin.schrader@online.de",
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Willkommen bei YogaSwap!" },
        Body: {
          Html: {
            Data: `
              <h2>Hi ${nickname}!</h2>
              <p>Du wurdest zu YogaSwap eingeladen.</p>
              <p><a href="${link}">Klicke hier, um dein Passwort zu setzen</a></p>
              <p><strong>Temporäres Passwort:</strong> <code>${tempPasswordB64}</code></p>
              <p>(Nur falls der Link nicht funktioniert)</p>
            `
          }
        }
      }
    }));
  } catch (err: any) {
    console.warn("SES Error (ignored):", err.message);
  }

  return { success: true };

};