import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: 'eu-central-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.OVERRIDES_TABLE;
  const courseId = event.pathParameters?.courseId;
  const date = event.pathParameters?.date;
  const updates = JSON.parse(event.body || '{}');

  try {
    if (!courseId || !date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    let updateExpression = 'SET';
    const expressionAttributeValues: Record<string, any> = {};
    const expressionAttributeNames: Record<string, string> = {};

    if (updates.participants) {
      updateExpression += ' #participants = :participants,';
      expressionAttributeNames['#participants'] = 'participants';
      expressionAttributeValues[':participants'] = { S: JSON.stringify(updates.participants) };
    }
    if (updates.swapped) {
      updateExpression += ' #swapped = :swapped,';
      expressionAttributeNames['#swapped'] = 'swapped';
      expressionAttributeValues[':swapped'] = { S: JSON.stringify(updates.swapped) };
    }
    if (updates.waitlist) {
      updateExpression += ' #waitlist = :waitlist,';
      expressionAttributeNames['#waitlist'] = 'waitlist';
      expressionAttributeValues[':waitlist'] = { S: JSON.stringify(updates.waitlist) };
    }

    if (updateExpression === 'SET') {
      return { statusCode: 400, body: JSON.stringify({ error: 'No fields to update' }) };
    }

    updateExpression = updateExpression.slice(0, -1); // Entferne letztes Komma

    await client.send(
      new UpdateItemCommand({
        TableName: tableName,
        Key: { courseId: { S: courseId }, date: { S: date } },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
      })
    );

    return { statusCode: 200, body: JSON.stringify({ message: 'Override updated' }) };
  } catch (error) {
    console.error('Error updating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to update override' }) };
  }
};