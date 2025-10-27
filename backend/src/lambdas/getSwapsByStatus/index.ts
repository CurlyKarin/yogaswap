import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { Swap } from "@yogaswap/shared";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const status = event.queryStringParameters?.status;
  if (!status) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing status parameter' }) };
  }

  const command = new ScanCommand({
    TableName: process.env.SWAPS_TABLE,
    FilterExpression: "#s = :s",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":s": { S: status } },
    ConsistentRead: true,
  });

  try {
    console.log('getSwapsByStatus ScanCommand:', command.input);
    const data = await client.send(command);
    const items: Swap[] = (data.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId.S!),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId.S!),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));
    console.log('getSwapsByStatus result:', items);
    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error('Error querying swaps by status:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};