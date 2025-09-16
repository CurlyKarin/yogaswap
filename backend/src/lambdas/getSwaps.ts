import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { Swap } from "@shared/types";


const client = new DynamoDBClient({ region: "eu-central-1" });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = event.queryStringParameters?.user;
  if (!user) {
    return { statusCode: 400, body: "Missing 'user' query parameter" };
  }

  const command = new ScanCommand({ 
    TableName: "swaps",
  });

  try {
    const data = await client.send(command);
    const items: Swap[] = (data.Items || [])
      .map(item => ({
        user: item.user.S!,
        fromCourseId: Number(JSON.parse(item.fromCourseId.S!)),
        fromDate: item.fromDate.S!,
        toCourseId: Number(JSON.parse(item.toCourseId.S!)),
        toDate: item.toDate.S!,
        status: item.status.S as Swap["status"],
      }))
      .filter(swap => swap.user === user);

    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
