import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { Swap } from "@yogaswap/shared";

//cd backend/src/lambdas/getSwaps
//npm init -y
//npm install typescript @types/node @aws-sdk/client-dynamodb aws-lambda --save-dev

const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = event.queryStringParameters?.user;
  if (!user) {
    return { statusCode: 400, body: "Missing 'user' query parameter" };
  }

  // Optional: Filter nach fromDate und fromCourseId
  const fromDate = event.queryStringParameters?.fromDate;
  const fromCourseId = event.queryStringParameters?.fromCourseId;
  const toCourseId = event.queryStringParameters?.toCourseId; // fuer OR-Filter; 
  const toDate = event.queryStringParameters?.toDate; // Für OR-Filter
  const status = event.queryStringParameters?.status || "pending";

  // Range Key zusammengesetzt: "fromDate_fromCourseId"

let command: QueryCommand;
  if (fromDate && fromCourseId) {
    // Abfrage über GSI_From
    command = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      IndexName: "GSI_From",
      KeyConditionExpression: "#u = :u AND #f = :f",
      ExpressionAttributeNames: { "#u": "user", "#f": "fromDate_fromCourseId_status" },
      ExpressionAttributeValues: {
        ":u": { S: user },
        ":f": { S: `${fromDate}#${fromCourseId}${status ? `#${status}` : ''}` },
      },
    });
  } else if (toDate && toCourseId) {
    // Abfrage über GSI_To
    command = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      IndexName: "GSI_To",
      KeyConditionExpression: "#u = :u AND #t = :t",
      ExpressionAttributeNames: { "#u": "user", "#t": "toDate_toCourseId_status" },
      ExpressionAttributeValues: {
        ":u": { S: user },
        ":t": { S: `${toDate}#${toCourseId}${status ? `#${status}` : ''}` },
      },
    });
  } else {
    // Fallback: Alle Swaps für den Benutzer
    command = new QueryCommand({
      TableName: process.env.SWAPS_TABLE,
      KeyConditionExpression: "#u = :u",
      ExpressionAttributeNames: { "#u": "user" },
      ExpressionAttributeValues: { ":u": { S: user } },
      ...(status ? {
        FilterExpression: "#s = :s",
        ExpressionAttributeNames: { "#u": "user", "#s": "status" },
        ExpressionAttributeValues: { ":u": { S: user }, ":s": { S: status } },
      } : {}),
    });
  }

  try {
    const data = await client.send(command);
    
    const items: Swap[] = (data.Items || []).map((item) => ({
      user: item.user.S!,
      fromCourseId: Number(item.fromCourseId.S!),
      fromDate: item.fromDate.S!,
      toCourseId: Number(item.toCourseId.S!),
      toDate: item.toDate.S!,
      status: item.status.S as Swap["status"],
    }));

    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
