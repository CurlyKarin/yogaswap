import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

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
  console.log("updateSwap tenant context", { tenantId, userId });
  const swapId = event.pathParameters?.swapId;
  const user = event.queryStringParameters?.user;
  if (!swapId || !user) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing swapId or user" }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing request body" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const { status } = body;
  if (!status) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing status field" }),
    };
  }

  // Extrahiere fromDate, fromCourseId, toDate, toCourseId aus swapId
  const parts = swapId.split("_");
  if (parts.length !== 4) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid swapId format" }),
    };
  }
  const [fromDate, fromCourseId, toDate, toCourseId] = parts;

  const user_swapId = `${user}#${swapId}`;
  const command = new UpdateItemCommand({
    TableName: process.env.SWAPS_TABLE,
    Key: {
      tenantId: { S: tenantId },
      user_swapId: { S: user_swapId },
    },
    UpdateExpression: "SET #status = :status, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":status": { S: status },
      ":fromStatus": { S: `${fromDate}_${fromCourseId}_${status}` },
      ":toStatus": { S: `${toDate}_${toCourseId}_${status}` },
    },
  });

  try {
    console.log("UpdateItemCommand:", command.input);
    await client.send(command);
    console.log("Swap updated:", { swapId, user, status });
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Swap updated" }),
    };
  } catch (err) {
    console.error("Error updating swap:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};