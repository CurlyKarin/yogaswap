import { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

// export const handler = async (event: {
//   email: string;
//   nickname: string;
//   role: "participant" | "instructor" | "admin";
// }) => {
export const handler = async (event: any) => {
  console.log('EVENT:', JSON.stringify(event));  

  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { email, nickname, role } = body;
  if (!email || !nickname || !role) {
    throw new Error('Missing required fields');
  }
  const tempPassword = Math.random().toString(36).slice(-8) + "A1!";

  try {
    // 1. User anlegen
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: nickname,
      TemporaryPassword: tempPassword,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" },
        { Name: "nickname", Value: nickname },
        { Name: "custom:role", Value: role },
      ],
      MessageAction: "SUPPRESS",
    }));
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      console.log('User exists, updating group...');
    } else {
      console.error('Cognito Error:', err);
      throw err;
    }
  }

  // 2. In Gruppe (immer ausführen)
  try {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: nickname,
      GroupName: role,
    }));
  } catch (err: any) {
    if (err.name !== 'ResourceNotFoundException') {  // Gruppe existiert nicht
      console.error('Group Error:', err);
      throw err;
    }
  }

  // 3. Einladungslink
  const link = `https://yogaswap.de/invite?email=${encodeURIComponent(email)}&temp=${tempPassword}`;

  // 4. E-Mail senden (nur wenn SES verifiziert)
  try {
    await ses.send(new SendEmailCommand({
      Source: "karin.schrader@online.de",
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Willkommen bei YogaSwap!" },
        Body: { Html: { Data: `
          <h2>Hi ${nickname}!</h2>
          <p>Du wurdest zu YogaSwap eingeladen.</p>
          <p><a href="${link}">Klicke hier, um dein Passwort zu setzen</a></p>
          <p><strong>Temporäres Passwort:</strong> <code style="background:#f0f0f0;padding:4px 8px;border-radius:4px;">${tempPassword}</code></p>
          <p>(Nur falls der Link nicht funktioniert)</p>
      `}},
      },
    }));
  } catch (err: any) {
    console.warn('SES Error (ignored for now):', err.message);
  }

  return { success: true };

};