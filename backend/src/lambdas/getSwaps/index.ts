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
  const status = event.queryStringParameters?.status || "pending";

  // Range Key zusammengesetzt: "fromDate_fromCourseId"

    let keyCondition = "#u = :u";
    const expressionValues: { [key: string]: { S: string } } = { ":u": { S: user } };
    const expressionNames: { [key: string]: string } = { "#u": "user" }; // user ist reserviert

    if (fromDate && fromCourseId) {
        keyCondition += " AND fromDate_fromCourseId_status = :f";
        expressionValues[":f"] = { S: `${fromDate}#${fromCourseId}#${status}` };
    }

  const command = new QueryCommand({
    TableName: process.env.SWAPS_TABLE,   // besser per ENV setzen!
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionValues,
    ExpressionAttributeNames: expressionNames,
  });

  try {
    const data = await client.send(command);
    
    const items: Swap[] = (data.Items || []).map((item) => {
      const [fDate, fCourseId, tDate, tCourseId] = item.swapId.S!.split("#");
      return {
        user: item.user.S!,
        fromCourseId: Number(fCourseId),
        fromDate: fDate,
        toCourseId: Number(tCourseId),
        toDate: tDate!,
        status: item.status.S as Swap["status"],
      };
    });

    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
