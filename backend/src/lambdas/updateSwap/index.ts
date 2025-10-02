import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
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
  const parts = swapId.split("-");
  if (parts.length !== 4) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid swapId format" }),
    };
  }
  const [fromDate, fromCourseId, toDate, toCourseId] = parts;

  const command = new UpdateItemCommand({
    TableName: process.env.SWAPS_TABLE,
    Key: {
      swapId: { S: swapId },
      user: { S: user },
    },
    UpdateExpression: "SET #status = :status, fromDate_fromCourseId_status = :fromStatus, toDate_toCourseId_status = :toStatus",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":status": { S: status },
      ":fromStatus": { S: `${fromDate}-${fromCourseId}-${status}` },
      ":toStatus": { S: `${toDate}-${toCourseId}-${status}` },
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