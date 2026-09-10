// backend/scripts/createAdminUser.js
// Erstellt den ersten Admin-User in Cognito
//
// #324: Cognito-Username ist opaque (UUID). Der Nickname ist nur Attribut + Studio-Login-Name.
//       Gleiche E-Mail darf mehrere Cognito-User haben (kein Auto-Link).
//
// Verwendung:
//   node createAdminUser.js <userPoolId> <email> <nickname> [password]
//
// Beispiele:
//   node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin
//   node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin MeinPasswort123!

const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
  randomUUID,
} = (() => {
  const cognito = require("@aws-sdk/client-cognito-identity-provider");
  const { randomUUID } = require("crypto");
  return { ...cognito, randomUUID };
})();

const userPoolId = process.argv[2];
const email = process.argv[3];
const nickname = process.argv[4];
const password = process.argv[5] || null;

if (!userPoolId || !email || !nickname) {
  console.error("❌ Fehler: Benötigte Argumente fehlen");
  console.log("");
  console.log("Verwendung:");
  console.log("  node createAdminUser.js <userPoolId> <email> <nickname> [password]");
  console.log("");
  console.log("Beispiele:");
  console.log("  node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin");
  console.log("  node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin MeinPasswort123!");
  console.log("");
  console.log("Hinweis: Cognito-Username ist eine UUID; Login in der App mit dem Nickname (Studio).");
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: "eu-central-1" });

function generateTempPassword(length = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw + "A1";
}

(async () => {
  try {
    const username = randomUUID();
    let tempPassword = password || generateTempPassword();

    try {
      await client.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: username,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
            { Name: "nickname", Value: nickname },
            { Name: "custom:role", Value: "admin" },
          ],
          MessageAction: "SUPPRESS",
          TemporaryPassword: tempPassword,
        }),
      );
      console.log(`✅ User '${nickname}' erstellt (Cognito-Username: ${username})`);
    } catch (err) {
      console.error(`❌ AdminCreateUser fehlgeschlagen:`, err.message || err);
      process.exit(1);
    }

    if (password) {
      try {
        await client.send(
          new AdminSetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: username,
            Password: password,
            Permanent: true,
          }),
        );
        console.log(
          `✅ Passwort permanent gesetzt (keine Passwortänderung beim ersten Login erforderlich)`,
        );
        tempPassword = null;
      } catch (err) {
        console.warn(`⚠️  Passwort konnte nicht permanent gesetzt werden: ${err.message}`);
        console.warn(
          `⚠️  User muss beim ersten Login das Passwort ändern. Temporäres Passwort: ${tempPassword}`,
        );
      }
    } else {
      console.log(
        `⚠️  WICHTIG: Temporäres Passwort wurde generiert. User muss beim ersten Login das Passwort ändern.`,
      );
    }

    try {
      await client.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: username,
          GroupName: "admin",
        }),
      );
      console.log(`✅ User '${nickname}' zur Gruppe 'admin' hinzugefügt`);
    } catch (err) {
      if (err.name === "ResourceNotFoundException") {
        console.error(
          `❌ Fehler: Gruppe 'admin' existiert nicht. Führe zuerst 'node createGroups.js ${userPoolId}' aus.`,
        );
        process.exit(1);
      } else {
        throw err;
      }
    }

    console.log("");
    console.log("✅ Admin-User erfolgreich erstellt!");
    console.log("");
    console.log("Login-Daten:");
    console.log(`  Login-Name (Nickname): ${nickname}`);
    console.log(`  Cognito-Username (intern): ${username}`);
    console.log(`  E-Mail: ${email}`);
    console.log(`  Speichere cognitoUsername=${username} am ParticipantProfile.`);
    if (password && !tempPassword) {
      console.log(`  Passwort: ${password}`);
      console.log(`  ✅ Passwort ist permanent gesetzt - Du kannst dich direkt einloggen!`);
    } else if (tempPassword) {
      console.log(`  ⚠️  Temporäres Passwort: ${tempPassword}`);
    }
    console.log("");
  } catch (err) {
    console.error(`❌ Fehler beim Erstellen des Admin-Users:`, err.message || err);
    process.exit(1);
  }
})();
