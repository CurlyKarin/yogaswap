// backend/scripts/createAdminUser.js
// Erstellt den ersten Admin-User in Cognito
// 
// WICHTIG: Bei YogaSwap ist der NICKNAME eindeutig (nicht die E-Mail)!
//          Mehrere User können die gleiche E-Mail-Adresse haben.
//          Der Nickname wird als Username in Cognito verwendet.
// 
// Verwendung:
//   node createAdminUser.js <userPoolId> <email> <nickname> [password]
//
// Beispiele:
//   node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin
//   node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin MeinPasswort123!

const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminAddUserToGroupCommand, AdminSetUserPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');

const userPoolId = process.argv[2];
const email = process.argv[3];
const nickname = process.argv[4];
const password = process.argv[5] || null; // Optional: Wenn nicht angegeben, wird ein temporäres Passwort generiert

if (!userPoolId || !email || !nickname) {
  console.error('❌ Fehler: Benötigte Argumente fehlen');
  console.log('');
  console.log('Verwendung:');
  console.log('  node createAdminUser.js <userPoolId> <email> <nickname> [password]');
  console.log('');
  console.log('Beispiele:');
  console.log('  node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin');
  console.log('  node createAdminUser.js eu-central-1_XXXXXXXXX admin@example.com admin MeinPasswort123!');
  console.log('');
  console.log('Hinweis: Wenn kein Passwort angegeben wird, erstellt Cognito automatisch ein temporäres Passwort.');
  console.log('         In diesem Fall muss der User beim ersten Login ein neues Passwort setzen.');
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: 'eu-central-1' });

function generateTempPassword(length = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pw = "";
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw + "A1"; // Sicherstellen, dass mindestens ein Großbuchstabe und eine Zahl vorhanden sind
}

(async () => {
  try {
    // WICHTIG: Der Nickname wird als Username verwendet und muss eindeutig sein
    //          Die E-Mail kann mehrfach verwendet werden (z.B. mehrere User mit gleicher E-Mail)
    const username = nickname; // Nickname = Username (eindeutig)
    
    // Prüfe, ob User bereits existiert
    let userExists = false;
    let tempPassword = null;
    
    try {
      // Wenn Passwort angegeben: Verwende es temporär (wird danach permanent gesetzt)
      // Wenn kein Passwort: Generiere temporäres Passwort und gib es aus
      if (!password) {
        tempPassword = generateTempPassword();
      } else {
        tempPassword = password;
      }
      
      await client.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username, // Nickname als Username (muss eindeutig sein)
        UserAttributes: [
          { Name: "email", Value: email }, // E-Mail kann mehrfach verwendet werden
          { Name: "email_verified", Value: "true" },
          { Name: "nickname", Value: nickname },
          { Name: "custom:role", Value: "admin" }
        ],
        MessageAction: "SUPPRESS", // Keine E-Mail senden
        TemporaryPassword: tempPassword
      }));
      console.log(`✅ User '${nickname}' erstellt (Username: ${username})`);
      
      // Wenn Passwort angegeben wurde: Setze es sofort als permanent
      if (password) {
        try {
          await client.send(new AdminSetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: username,
            Password: password,
            Permanent: true // Passwort ist permanent (User muss nicht ändern)
          }));
          console.log(`✅ Passwort permanent gesetzt (keine Passwortänderung beim ersten Login erforderlich)`);
        } catch (err) {
          console.warn(`⚠️  Passwort konnte nicht permanent gesetzt werden: ${err.message}`);
          console.warn(`⚠️  User muss beim ersten Login das Passwort ändern. Temporäres Passwort: ${tempPassword}`);
        }
      } else {
        console.log(`⚠️  WICHTIG: Temporäres Passwort wurde generiert. User muss beim ersten Login das Passwort ändern.`);
        console.log(`⚠️  Verwende die Invite-Seite (/invite?nickname=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}) oder ändere das Passwort manuell.`);
      }
      
    } catch (err) {
      if (err.name === 'UsernameExistsException') {
        console.log(`ℹ️  User mit Nickname '${nickname}' existiert bereits (Username muss eindeutig sein)`);
        userExists = true;
      } else {
        throw err;
      }
    }

    // Wenn User bereits existiert und Passwort angegeben wurde, Passwort setzen
    if (userExists && password) {
      try {
        await client.send(new AdminSetUserPasswordCommand({
          UserPoolId: userPoolId,
          Username: username, // Nickname als Username verwenden
          Password: password,
          Permanent: true // Passwort ist permanent (User muss nicht ändern)
        }));
        console.log(`✅ Passwort für '${nickname}' gesetzt (permanent)`);
      } catch (err) {
        console.warn(`⚠️  Passwort konnte nicht gesetzt werden: ${err.message}`);
      }
    }

    // User zur Admin-Gruppe hinzufügen
    try {
      await client.send(new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username, // Nickname als Username verwenden
        GroupName: 'admin'
      }));
      console.log(`✅ User '${nickname}' zur Gruppe 'admin' hinzugefügt`);
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        console.error(`❌ Fehler: Gruppe 'admin' existiert nicht. Führe zuerst 'node createGroups.js ${userPoolId}' aus.`);
        process.exit(1);
      } else {
        throw err;
      }
    }

    console.log('');
    console.log('✅ Admin-User erfolgreich erstellt!');
    console.log('');
    console.log('Login-Daten:');
    console.log(`  Username (Nickname): ${nickname}`);
    console.log(`  E-Mail: ${email}`);
    if (password) {
      console.log(`  Passwort: ${password}`);
      console.log(`  ✅ Passwort ist permanent gesetzt - Du kannst dich direkt einloggen!`);
    } else {
      console.log(`  ⚠️  Temporäres Passwort: ${tempPassword}`);
      console.log('');
      console.log('  WICHTIG: Du musst beim ersten Login das Passwort ändern!');
      console.log('  Option 1: Nutze die Invite-Seite:');
      console.log(`    /invite?nickname=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`);
      console.log(`    Temporäres Passwort: ${tempPassword}`);
      console.log('  Option 2: Setze das Passwort manuell permanent (siehe Dokumentation)');
    }
    console.log('');

  } catch (err) {
    console.error(`❌ Fehler beim Erstellen des Admin-Users:`, err.message || err);
    process.exit(1);
  }
})();
