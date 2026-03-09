import { CognitoIdentityProviderClient, ListUsersCommand, AdminListGroupsForUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const cognito = new CognitoIdentityProviderClient({ region: "eu-central-1" });
const dynamodb = new DynamoDBClient({ region: "eu-central-1" });

const USER_POOL_ID = "eu-central-1_s6pVZ7mnn"; // From tofu outputs
const MEMBERSHIPS_TABLE = "yogaswap-demo-memberships-table";
const TENANT_ID = "default-tenant";

async function run() {
  console.log("Fetching users from Cognito...");
  const command = new ListUsersCommand({ UserPoolId: USER_POOL_ID });
  const response = await cognito.send(command);
  
  const users = response.Users || [];
  console.log(`Found ${users.length} users.`);

  for (const user of users) {
    const username = user.Username;
    if (!username) continue;

    // Get groups (roles) for user
    const groupCommand = new AdminListGroupsForUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username
    });
    
    let role = "participant"; // default
    try {
      const groupResponse = await cognito.send(groupCommand);
      if (groupResponse.Groups && groupResponse.Groups.length > 0) {
        role = groupResponse.Groups[0].GroupName || "participant";
      }
    } catch (e) {
      console.warn(`Could not fetch groups for ${username}, defaulting to participant`);
    }

    console.log(`Migrating user: ${username}, role: ${role}`);
    
    // Write to DynamoDB
    await dynamodb.send(new PutItemCommand({
      TableName: MEMBERSHIPS_TABLE,
      Item: {
        tenantId: { S: TENANT_ID },
        userId: { S: username },
        role: { S: role }
      }
    }));
  }
  
  console.log("Migration complete!");
}

run().catch(console.error);
