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
    AdminUpdateUserAttributesCommand: jest.fn((input) => input),
    AdminGetUserCommand: jest.fn((input) => input),
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
    GetItemCommand: jest.fn((input) => input),
    PutItemCommand: jest.fn((input) => input),
    QueryCommand: jest.fn((input) => input),
    ScanCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend: cognitoMockSend } = jest.requireMock('@aws-sdk/client-cognito-identity-provider');
const { mockSend: sesMockSend } = jest.requireMock('@aws-sdk/client-ses');
const { mockSend: dynamoMockSend } = jest.requireMock('@aws-sdk/client-dynamodb');

function adminGetUserResponse(username: string, sub = `sub-${username}`) {
  return {
    Username: username,
    UserAttributes: [{ Name: 'sub', Value: sub }],
  };
}

describe('createParticipants Lambda', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      USER_POOL_ID: 'test-user-pool-id',
      BASE_URL: 'https://yogaswap.example.com',
      SES_SOURCE_EMAIL: 'yogaswap@example.com',
      AUTH_TOKENS_TABLE: 'test-auth-tokens-table',
      AUTH_TOKEN_TTL_SECONDS: '3600',
      MEMBERSHIPS_TABLE: 'test-memberships-table',
      PARTICIPANTS_TABLE: 'test-participants-table',
    };
    cognitoMockSend.mockReset();
    sesMockSend.mockReset();
    dynamoMockSend.mockReset();
    dynamoMockSend.mockResolvedValue({});
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
    expect(dynamoMockSend.mock.calls.length).toBeGreaterThanOrEqual(3);
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
      .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand (token flow bootstrap)
      .mockResolvedValueOnce({}) // AdminAddUserToGroupCommand
      .mockResolvedValueOnce(adminGetUserResponse('testuser')); // AdminGetUserCommand (sync sub / canonical username)
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
    expect(body.link).toMatch(/\/invite\?/);
    expect(body.link).toMatch(/token=/);

    // Verify Cognito calls
    expect(cognitoMockSend).toHaveBeenCalledTimes(4);
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
        Permanent: true,
      })
    );
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'testuser',
        GroupName: 'participant',
      })
    );
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'testuser',
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
    expect(dynamoMockSend.mock.calls.length).toBeGreaterThanOrEqual(3);
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
          inviteSentAt: expect.objectContaining({ S: expect.any(String) }),
        }),
      })
    );
  });

  test('keeps first entered casing as canonical user id', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(adminGetUserResponse('Kai'));
    sesMockSend.mockResolvedValueOnce({});

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'Kai',
      role: 'participant',
    });
    event.headers = { 'x-tenant-id': 'test-tenant' };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.username).toBe('Kai');

    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        Username: 'Kai',
        UserAttributes: expect.arrayContaining([
          { Name: 'nickname', Value: 'Kai' },
        ]),
      }),
    );
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-memberships-table',
        Item: expect.objectContaining({
          userId: { S: 'Kai' },
        }),
      }),
    );
  });

  test('handles existing user by resetting password', async () => {
    const usernameExistsError = new Error('User already exists');
    (usernameExistsError as any).name = 'UsernameExistsException';

    cognitoMockSend
      .mockRejectedValueOnce(usernameExistsError) // AdminCreateUserCommand fails
      .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand succeeds
      .mockResolvedValueOnce({}) // AdminUpdateUserAttributesCommand
      .mockResolvedValueOnce({}) // AdminAddUserToGroupCommand
      .mockResolvedValueOnce(adminGetUserResponse('existinguser')); // AdminGetUserCommand
    sesMockSend.mockResolvedValueOnce({}); // SendEmailCommand
    dynamoMockSend.mockResolvedValueOnce({ Item: undefined }); // participant profile lookup -> no authUserId

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
    expect(cognitoMockSend).toHaveBeenCalledTimes(5);
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'existinguser',
        Permanent: true,
      })
    );
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'existinguser',
        UserAttributes: expect.arrayContaining([
          { Name: 'email', Value: 'existing@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ]),
      })
    );
  });

  test('registered user with authUserId gets token invite resend when AUTH_TOKENS_TABLE is set', async () => {
    const usernameExistsError = new Error('User already exists');
    (usernameExistsError as any).name = 'UsernameExistsException';

    cognitoMockSend
      .mockRejectedValueOnce(usernameExistsError) // AdminCreateUserCommand fails
      .mockResolvedValueOnce({}) // AdminUpdateUserAttributesCommand (sync email for reset code)
      .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand (normalize state for reset flow)
      .mockResolvedValueOnce({}) // AdminAddUserToGroupCommand
      .mockResolvedValueOnce(adminGetUserResponse('existinguser', 'sub-123')); // AdminGetUserCommand
    sesMockSend.mockResolvedValueOnce({});
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: 'default-tenant' },
          userId: { S: 'existinguser' },
          authUserId: { S: 'sub-123' },
        },
      }) // profile lookup in UsernameExists flow
      .mockResolvedValueOnce({}) // membership write
      .mockResolvedValueOnce({}); // participant profile write

    const event = baseEvent({
      email: 'existing@example.com',
      nickname: 'existinguser',
      role: 'participant',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(body.reactivated).toBe(false);
    expect(body.link).toMatch(/token=/);
    expect(body.tempPassword).toBeUndefined();

    expect(cognitoMockSend).toHaveBeenCalledTimes(5);
    expect(cognitoMockSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: 'existinguser',
        UserAttributes: expect.arrayContaining([
          { Name: 'email', Value: 'existing@example.com' },
          { Name: 'email_verified', Value: 'true' },
        ]),
      }),
    );
  });

  test('reactivates existing login without token table (legacy email only)', async () => {
    const usernameExistsError = new Error('User already exists');
    (usernameExistsError as any).name = 'UsernameExistsException';

    delete process.env.AUTH_TOKENS_TABLE;

    cognitoMockSend
      .mockRejectedValueOnce(usernameExistsError)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(adminGetUserResponse('legacyuser', 'sub-legacy'));
    sesMockSend.mockResolvedValueOnce({});
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: 'default-tenant' },
          userId: { S: 'legacyuser' },
          authUserId: { S: 'sub-legacy' },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const event = baseEvent({
      email: 'legacy@example.com',
      nickname: 'legacyuser',
      role: 'participant',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.reactivated).toBe(true);
    expect(body.link).not.toMatch(/token=/);

    expect(cognitoMockSend).toHaveBeenCalledTimes(3);
    process.env.AUTH_TOKENS_TABLE = 'test-auth-tokens-table';
  });

  test('sends reactivation email when existing active user is reactivated without request email', async () => {
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: 'default-tenant' },
          userId: { S: 'Nova' },
          authUserId: { S: 'sub-999' },
          email: { S: 'nova@example.com' },
          cognitoUsername: { S: 'Nova' },
        },
      }) // canonical lookup by nicknameNormalized
      .mockResolvedValueOnce({}) // membership write
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: 'default-tenant' },
          userId: { S: 'Nova' },
          authUserId: { S: 'sub-999' },
          email: { S: 'nova@example.com' },
        },
      }) // saveParticipantProfile existing lookup
      .mockResolvedValueOnce({}); // participant profile write
    sesMockSend.mockResolvedValueOnce({});

    const event = baseEvent({
      nickname: 'nova',
      role: 'participant',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.username).toBe('Nova');
    expect(body.reactivated).toBe(true);
    expect(body.emailSent).toBe(true);

    // no Cognito flow in no-email path
    expect(cognitoMockSend).not.toHaveBeenCalled();
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ['nova@example.com'] },
      }),
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
    expect(JSON.parse(result.body).error).toBe('Failed to prepare existing user');
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
      .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand
      .mockRejectedValueOnce(groupError) // AdminAddUserToGroupCommand fails
      .mockResolvedValueOnce(adminGetUserResponse('testuser')); // AdminGetUserCommand
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

  test('returns inviteToken if email sending fails', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({}) // AdminCreateUserCommand
      .mockResolvedValueOnce({}) // AdminSetUserPasswordCommand
      .mockResolvedValueOnce({}) // AdminAddUserToGroupCommand
      .mockResolvedValueOnce(adminGetUserResponse('testuser')); // AdminGetUserCommand
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
    expect(body.tempPassword).toBeUndefined();
    expect(body.inviteToken).toBeDefined();
    expect(body.warning).toContain('E-Mail konnte nicht versendet werden');

    // Even if SES fails, inviteSentAt should be stored so status becomes "invited".
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-participants-table',
        Item: expect.objectContaining({
          inviteSentAt: expect.objectContaining({ S: expect.any(String) }),
        }),
      })
    );
  });

  test('handles event.body as object (not string)', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(adminGetUserResponse('testuser'));
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
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(adminGetUserResponse('testuser'));
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
