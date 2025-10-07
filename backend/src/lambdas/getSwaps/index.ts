import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { Swap } from "@yogaswap/shared";

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = event.queryStringParameters?.user;
  if (!user) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing user parameter' }) };
  }

  const fromDate = event.queryStringParameters?.fromDate;
  const fromCourseId = event.queryStringParameters?.fromCourseId;
  const toDate = event.queryStringParameters?.toDate;
  const toCourseId = event.queryStringParameters?.toCourseId;
  //const status = event.queryStringParameters?.status; // Kein Default-Wert

  let command: QueryCommand;
  if (fromDate && fromCourseId) {
    // Abfrage über GSI_From, unabhängig vom Status
    command = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      IndexName: "GSI_From",
      KeyConditionExpression: "#u = :u AND begins_with(#f, :f)",
      ExpressionAttributeNames: { "#u": "user", "#f": "fromDate_fromCourseId_status" },
      ExpressionAttributeValues: {
        ":u": { S: user },
        ":f": { S: `${fromDate}_${fromCourseId}` },
      },
      ConsistentRead: true,
    });
  } else if (toDate && toCourseId) {
    // Abfrage über GSI_To, unabhängig vom Status
    command = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      IndexName: "GSI_To",
      KeyConditionExpression: "#u = :u AND begins_with(#t, :t)",
      ExpressionAttributeNames: { "#u": "user", "#t": "toDate_toCourseId_status" },
      ExpressionAttributeValues: {
        ":u": { S: user },
        ":t": { S: `${toDate}_${toCourseId}` },
      },
      ConsistentRead: true,
    });
  } else {
    // Fallback: Alle Swaps für den Benutzer, ohne Status-Filter
    command = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      KeyConditionExpression: "#u = :u",
      ExpressionAttributeNames: { "#u": "user" },
      ExpressionAttributeValues: { ":u": { S: user } },
      ConsistentRead: true,
    });
  }

  try {
    console.log('QueryCommand:', command.input);
    const data = await client.send(command);
    const items: Swap[] = (data.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId.S!),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId.S!),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));
    console.log('getSwaps result:', items);
    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error('Error querying swaps:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};