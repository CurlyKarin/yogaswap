import { AdminCreateUserCommand, AdminAddUserToGroupCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESClient({});

export const handler = async (event: {
  email: string;
  nickname: string;
  role: "participant" | "instructor" | "admin";
}) => {
  const { email, nickname, role } = event;
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

    // 2. In Gruppe
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: nickname,
      GroupName: role,
    }));

    // 3. Einladungslink
    const link = `https://yogaswap.de/invite?email=${encodeURIComponent(email)}&temp=${tempPassword}`;

    // 4. E-Mail
    await ses.send(new SendEmailCommand({
      Source: "no-reply@yogaswap.de",
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "Willkommen bei YogaSwap!" },
        Body: { Html: { Data: `
          <h2>Hi ${nickname}!</h2>
          <p>Du wurdest zu YogaSwap eingeladen.</p>
          <p><a href="${link}">Klicke hier, um dein Passwort zu setzen</a></p>
          <p>Temporäres Passwort: <strong>${tempPassword}</strong> (nur falls Link nicht klappt)</p>
        `}},
      },
    }));

    return { success: true };
  } catch (err: any) {
    console.error(err);
    throw err;
  }
};