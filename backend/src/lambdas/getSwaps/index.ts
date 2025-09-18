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

  // Range Key zusammengesetzt: "fromDate_fromCourseId"
  let keyCondition = "user = :u";
  const expressionValues: Record<string, any> = { ":u": { S: user } };
  if (fromDate && fromCourseId) {
    keyCondition += " AND fromDate_fromCourseId = :f";
    expressionValues[":f"] = { S: `${fromDate}#${fromCourseId}` };
  }

  const command = new QueryCommand({
    TableName: process.env.SWAPS_TABLE,   // besser per ENV setzen!
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionValues,
  });

  try {
    const data = await client.send(command);
      const items: Swap[] = (data.Items || []).map((item) => {
      const [fDate, fCourseId] = item.fromDate_fromCourseId.S!.split("_");
      return {
        user: item.user.S!,
        fromCourseId: Number(fCourseId),
        fromDate: fDate,
        toCourseId: Number(item.toCourseId.N!),
        toDate: item.toDate.S!,
        status: item.status.S as Swap["status"],
      };
    });
    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
