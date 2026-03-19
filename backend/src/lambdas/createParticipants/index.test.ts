import { handler } from './index';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock Cognito
jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  const mockSend = jest.fn();
  return {
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
    AdminCreateUserCommand: jest.fn((input) => input),
    AdminAddUserToGroupCommand: jest.fn((input) => input),
    AdminSetUserPasswordCommand: jest.fn((input) => input),
    mockSend,
  };
});

// Mock SES
jest.mock('@aws-sdk/client-ses', () => {
  const mockSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: mockSend })),
    SendEmailCommand: jest.fn((input) => input),
    mockSend,
  };
});

// Mock DynamoDB
jest.mock('@aws-sdk/client-dynamodb', () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    PutItemCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend: cognitoMockSend } = jest.requireMock('@aws-sdk/client-cognito-identity-provider');
const { mockSend: sesMockSend } = jest.requireMock('@aws-sdk/client-ses');
const { mockSend: dynamoMockSend } = jest.requireMock('@aws-sdk/client-dynamodb');

describe('createParticipants Lambda', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      USER_POOL_ID: 'test-user-pool-id',
      BASE_URL: 'https://yogaswap.example.com',
      SES_SOURCE_EMAIL: 'yogaswap@example.com',
      MEMBERSHIPS_TABLE: 'test-memberships-table',
      PARTICIPANTS_TABLE: 'test-participants-table',
    };
    cognitoMockSend.mockReset();
    sesMockSend.mockReset();
    dynamoMockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const baseEvent = (body: any): APIGatewayProxyEvent =>
    ({
      body: JSON.stringify(body),
    } as any);

  test('returns 400 if request body is missing', async () => {
    const event = { body: undefined } as any;
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Missing request body');
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test('returns 400 if required fields are missing', async () => {
    const event = baseEvent({ email: 'test@example.com' }); // missing nickname and role
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Missing required fields');
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test('creates a foreign-managed participant if email is empty (skips Cognito/SES)', async () => {
    const event = baseEvent({
      email: '',
      nickname: 'noligin',
      role: 'participant',
    });
    event.headers = { 'x-tenant-id': 'test-tenant' };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.username).toBe('noligin');
    expect(body.emailSent).toBe(false);
    expect(body.warning).toMatch(/Cognito\/SES übersprungen/i);

    // Cognito + SES should not be called
    expect(cognitoMockSend).not.toHaveBeenCalled();
    expect(sesMockSend).not.toHaveBeenCalled();

    // DynamoDB should be called to store membership + participant profile
    expect(dynamoMockSend).toHaveBeenCalledTimes(2);
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-memberships-table',
        Item: expect.objectContaining({
          tenantId: { S: 'test-tenant' },
          userId: { S: 'noligin' },
          role: { S: 'participant' },
        }),
      })
    );
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-participants-table',
        Item: expect.objectContaining({
          tenantId: { S: 'test-tenant' },
          userId: { S: 'noligin' },
        }),
      })
    );
  });

  test('successfully creates a new user', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({}) // AdminCreateUserCommand
      .mockResolvedValueOnce({}); // AdminAddUserToGroupCommand
    sesMockSend.mockResolvedValueOnce({}); // SendEmailCommand

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'testuser',
      role: 'participant',
    });
    event.headers = { 'x-tenant-id': 'test-tenant' };

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.username).toBe('testuser');
    expect(body.emailSent).toBe(true);
    expect(body.tempPassword).toBeUndefined(); // Should not be in response if email sent

    // Verify Cognito calls
    expect(cognitoMockSend).toHaveBeenCalledTimes(2);
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'testuser',
        UserAttributes: expect.arrayContaining([
          { Name: 'email', Value: 'test@example.com' },
          { Name: 'nickname', Value: 'testuser' },
          { Name: 'custom:role', Value: 'participant' },
        ]),
      })
    );
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'testuser',
        GroupName: 'participant',
      })
    );

    // Verify SES call
    expect(sesMockSend).toHaveBeenCalledTimes(1);
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Source: 'yogaswap@example.com',
        Destination: { ToAddresses: ['test@example.com'] },
      })
    );

    // Verify DynamoDB call (membership + participant profile)
    expect(dynamoMockSend).toHaveBeenCalledTimes(2);
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-memberships-table',
        Item: expect.objectContaining({
          tenantId: { S: 'test-tenant' },
          userId: { S: 'testuser' },
          role: { S: 'participant' },
        }),
      })
    );
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-participants-table',
        Item: expect.objectContaining({
          tenantId: { S: 'test-tenant' },
          userId: { S: 'testuser' },
          email: { S: 'test@example.com' },
        }),
      })
    );
  });

  test('handles existing user by resetting password', async () => {
    const usernameExistsError = new Error('User already exists');
    (usernameExistsError as any).name = 'UsernameExistsException';

    cognitoMockSend
      .mockRejectedValueOnce(usernameExistsError) // AdminCreateUserCommand fails
      .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand succeeds
      .mockResolvedValueOnce({}); // AdminAddUserToGroupCommand
    sesMockSend.mockResolvedValueOnce({}); // SendEmailCommand

    const event = baseEvent({
      email: 'existing@example.com',
      nickname: 'existinguser',
      role: 'instructor',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.username).toBe('existinguser');

    // Verify password reset was called
    expect(cognitoMockSend).toHaveBeenCalledTimes(3);
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'existinguser',
        Permanent: false,
      })
    );
  });

  test('returns 500 if password reset fails for existing user', async () => {
    const usernameExistsError = new Error('User already exists');
    (usernameExistsError as any).name = 'UsernameExistsException';

    cognitoMockSend
      .mockRejectedValueOnce(usernameExistsError) // AdminCreateUserCommand fails
      .mockRejectedValueOnce(new Error('Password reset failed')); // AdminSetUserPasswordCommand fails

    const event = baseEvent({
      email: 'existing@example.com',
      nickname: 'existinguser',
      role: 'participant',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Failed to reset password');
  });

  test('returns 500 if user creation fails with non-UsernameExists error', async () => {
    cognitoMockSend.mockRejectedValueOnce(new Error('Cognito error'));

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'testuser',
      role: 'participant',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Failed to create user');
  });

  test('continues even if group assignment fails', async () => {
    const groupError = new Error('Group assignment failed');
    cognitoMockSend
      .mockResolvedValueOnce({}) // AdminCreateUserCommand
      .mockRejectedValueOnce(groupError); // AdminAddUserToGroupCommand fails
    sesMockSend.mockResolvedValueOnce({}); // SendEmailCommand

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'testuser',
      role: 'admin',
    });

    const result = await handler(event);

    // Should still succeed even if group assignment fails
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  test('returns tempPassword if email sending fails', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({}) // AdminCreateUserCommand
      .mockResolvedValueOnce({}); // AdminAddUserToGroupCommand
    sesMockSend.mockRejectedValueOnce(new Error('SES error')); // SendEmailCommand fails

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'testuser',
      role: 'participant',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(body.tempPassword).toBeDefined();
    expect(body.warning).toContain('E-Mail konnte nicht versendet werden');
  });

  test('handles event.body as object (not string)', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    sesMockSend.mockResolvedValueOnce({});

    const event = {
      body: {
        email: 'test@example.com',
        nickname: 'testuser',
        role: 'participant',
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  test('uses default BASE_URL if not provided', async () => {
    process.env.BASE_URL = '';
    cognitoMockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    sesMockSend.mockResolvedValueOnce({});

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'testuser',
      role: 'participant',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.link).toBeDefined();
    // Link should still be generated even without BASE_URL
  });
});
