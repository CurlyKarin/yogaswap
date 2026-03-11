import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const region = process.env.AWS_REGION || "eu-central-1";

export const dynamoClient = new DynamoDBClient({ region });

