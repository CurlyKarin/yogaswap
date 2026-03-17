import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { getTenantContext } from '../shared/tenantContext';
import { dynamoClient } from '../shared/dynamoClient';

const client = dynamoClient;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const { tenantId, userId } = getTenantContext(event);
  console.log('createOverride tenant context', { tenantId, userId });
  const tableName = process.env.OVERRIDES_TABLE;
  const override = JSON.parse(event.body || '{}');

  try {
    if (!override.courseId || !override.date) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing courseId or date' }) };
    }

    // Validierung der Eingaben
    const participants = override.participants || [];
    const swapped = override.swapped || [];
    const waitlist = override.waitlist || [];

    if (!Array.isArray(participants) || participants.some((p: any) => typeof p !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid participants array' }) };
    }
    if (!Array.isArray(swapped) || swapped.some((s: any) => typeof s !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid swapped array' }) };
    }
    if (!Array.isArray(waitlist) || waitlist.some((w: any) => typeof w !== 'string')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid waitlist array' }) };
    }

    const courseId_date = `${override.courseId}_${override.date}`;
    const dynamoItem = {
      tenantId: { S: tenantId },
      courseId_date: { S: courseId_date },
      courseId: { S: override.courseId.toString() },
      date: { S: override.date },
      participants: { L: participants.map((p: string) => ({ S: p })) },
      swapped: { L: swapped.map((s: string) => ({ S: s })) },
      waitlist: { L: waitlist.map((w: string) => ({ S: w })) },
    };

    await client.send(new PutItemCommand({ TableName: tableName, Item: dynamoItem }));
    return { statusCode: 200, body: JSON.stringify({ message: 'Override created' }) };
  } catch (error) {
    console.error('Error creating override:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create override' }) };
  }
};