import { CognitoIdentityProviderClient, ListUsersCommand, AdminListGroupsForUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const AWS_REGION =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-central-1";

const cognito = new CognitoIdentityProviderClient({ region: AWS_REGION });
const dynamodb = new DynamoDBClient({ region: AWS_REGION });

// Fail-fast statt hartkodierter Demo-/prod-Werte (siehe #74): Zielumgebung muss
// explizit gesetzt werden, sonst koennte dieses einmalige Migrationsskript die
// falsche Cognito-Pool/Tabelle anfassen.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `❌ Fehlende Umgebungsvariable: ${name}.\n` +
        `   Setze USER_POOL_ID und MEMBERSHIPS_TABLE der Zielumgebung, z. B.:\n` +
        `     USER_POOL_ID="<pool-id>" \\\n` +
        `     MEMBERSHIPS_TABLE="<project>-memberships-table" \\\n` +
        `     npx ts-node src/scripts/migrate_users.ts`,
    );
    process.exit(1);
  }
  return value;
}

const USER_POOL_ID = requireEnv("USER_POOL_ID");
const MEMBERSHIPS_TABLE = requireEnv("MEMBERSHIPS_TABLE");
const TENANT_ID = process.env.TENANT_ID || "default-tenant";

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
    } catch (_e) {
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
