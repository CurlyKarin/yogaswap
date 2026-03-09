import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "eu-central-1" });

const DEFAULT_TENANT_ID = "default-tenant";

type TenantContext = {
  tenantId: string;
  userId?: string | null;
};

function getTenantContext(event: APIGatewayProxyEvent): TenantContext {
  const userId =
    event.requestContext?.authorizer?.principalId ??
    event.queryStringParameters?.user ??
    null;

  const tenantId =
    event.headers?.['x-tenant-id'] ??
    event.headers?.['X-Tenant-ID'] ??
    DEFAULT_TENANT_ID;

  return {
    tenantId,
    userId: userId ?? undefined,
  };
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId } = getTenantContext(event);
  const swapId = event.pathParameters?.swapId;
  const user = event.queryStringParameters?.user;
  console.log('DeleteSwap params:', { swapId, user });
  console.log('deleteSwap tenant context:', { tenantId, userId });
  
  if (!swapId || !user) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing swapId or user parameter" }),
    };
  }

  const user_swapId = `${user}#${swapId}`;
  const command = new DeleteItemCommand({
    TableName: process.env.SWAPS_TABLE,
    Key: {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
    },
  });

  try {
    console.log('DeleteSwap command:', command.input);
    await client.send(command);
    console.log('DeleteSwap success:', { swapId, user });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Swap deleted successfully" }),
    };
  } catch (err) {
    console.error('Error deleting swap:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};