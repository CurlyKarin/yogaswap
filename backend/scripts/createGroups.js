// scripts/createGroups.js
const { CognitoIdentityProviderClient, CreateGroupCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({});
const groups = ["admin", "instructor", "participant"];

(async () => {
  const userPoolId = process.argv[2];
  for (const group of groups) {
    try {
      await client.send(new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: group }));
      console.log(`Group ${group} created`);
    } catch (err) {
      if (err.name !== "GroupExistsException") throw err;
    }
  }
})();