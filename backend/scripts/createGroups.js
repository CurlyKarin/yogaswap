// backend/scripts/createGroups.js
const { CognitoIdentityProviderClient, CreateGroupCommand } = require('@aws-sdk/client-cognito-identity-provider');

const userPoolId = process.argv[2];
const groups = ['admin', 'instructor', 'participant'];

const client = new CognitoIdentityProviderClient({ region: 'eu-central-1' });

(async () => {
  for (const group of groups) {
    try {
      await client.send(new CreateGroupCommand({
        UserPoolId: userPoolId,
        GroupName: group,
        Precedence: groups.indexOf(group) + 1,
      }));
      console.log(`✅ Group '${group}' created`);
    } catch (err) {
      if (err.name === 'GroupExistsException') {
        console.log(`ℹ️ Group '${group}' already exists`);
      } else {
        console.error(`❌ Error creating group '${group}':`, err);
      }
    }
  }
  console.log('✅ All groups processed');
})();