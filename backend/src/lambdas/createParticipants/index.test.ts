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
    ListUsersCommand: jest.fn((input) => input),
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

/**
 * ListUsers empty + legacy AdminGetUser miss → opaque AdminCreateUser path.
 * resolveCognitoUsernameAndSub only calls AdminGetUser once when userId === nickname.
 */
function mockNewUserCognitoPrelude(opaqueUsername: string) {
  return cognitoMockSend
    .mockResolvedValueOnce({ Users: [] })
    .mockRejectedValueOnce(new Error('UserNotFoundException'))
    .mockResolvedValueOnce({}) // AdminCreateUser
    .mockResolvedValueOnce({}) // AdminSetUserPassword
    .mockResolvedValueOnce({}) // AdminAddUserToGroup
    .mockResolvedValueOnce(adminGetUserResponse(opaqueUsername));
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

  const baseEvent = (body: any): APIGatewayProxyEvent => {
    const nextBody =
      body &&
      typeof body === "object" &&
      typeof body.nickname === "string" &&
      !Object.prototype.hasOwnProperty.call(body, "displayName")
        ? { ...body, displayName: body.nickname }
        : body;
    return {
      body: JSON.stringify(nextBody),
    } as any;
  };

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
    expect(JSON.parse(result.body).error).toBe('Bitte einen Nickname eingeben.');
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test('returns 400 if nickname has umlauts', async () => {
    const event = baseEvent({ nickname: 'Björn', role: 'participant' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('umlauts');
    expect(body.error).toMatch(/Umlaute/i);
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test('returns 400 if nickname contains #', async () => {
    const event = baseEvent({ nickname: 'Max#1', role: 'participant' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).code).toBe('invalid_chars');
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test('returns 400 if role is missing', async () => {
    const event = baseEvent({ nickname: 'Max' });
    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Missing required fields');
    expect(cognitoMockSend).not.toHaveBeenCalled();
  });

  test('returns 403 when instructor tries to create non-participant role', async () => {
    dynamoMockSend.mockResolvedValueOnce({
      Item: {
        tenantId: { S: 'test-tenant' },
        userId: { S: 'trainer-1' },
        role: { S: 'instructor' },
      },
    });

    const event = baseEvent({
      email: 'admin@example.com',
      nickname: 'newadmin',
      role: 'admin',
    });
    event.headers = { 'x-tenant-id': 'test-tenant' };
    event.requestContext = { authorizer: { principalId: 'trainer-1' } } as any;

    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toMatch(/Instructors can only create\/invite participants/i);
    expect(cognitoMockSend).not.toHaveBeenCalled();
    expect(sesMockSend).not.toHaveBeenCalled();
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
    const opaqueUsername = '11111111-2222-4333-8444-555555555555';
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue(opaqueUsername);

    mockNewUserCognitoPrelude(opaqueUsername);
    sesMockSend.mockResolvedValueOnce({});

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
    expect(body.link).toMatch(/nickname=testuser/);
    expect(body.link).toMatch(/token=/);

    expect(cognitoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        UserPoolId: 'test-user-pool-id',
        Username: opaqueUsername,
        UserAttributes: expect.arrayContaining([
          { Name: 'email', Value: 'test@example.com' },
          { Name: 'nickname', Value: 'testuser' },
          { Name: 'custom:role', Value: 'participant' },
        ]),
      }),
    );
    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-participants-table',
        Item: expect.objectContaining({
          userId: { S: 'testuser' },
          cognitoUsername: { S: opaqueUsername },
        }),
      }),
    );
  });

  test('links existing Cognito user by email without AdminCreateUser (#324)', async () => {
    cognitoMockSend
      .mockResolvedValueOnce({
        Users: [
          {
            Username: 'opaque-existing',
            UserStatus: 'CONFIRMED',
            Attributes: [
              { Name: 'sub', Value: 'sub-existing' },
              { Name: 'email', Value: 'shared@example.com' },
            ],
          },
        ],
      }) // ListUsers
      .mockResolvedValueOnce({}) // AdminUpdateUserAttributes
      .mockResolvedValueOnce({}) // AdminAddUserToGroup
      .mockResolvedValueOnce(adminGetUserResponse('opaque-existing', 'sub-existing'));
    sesMockSend.mockResolvedValueOnce({});

    const event = baseEvent({
      email: 'shared@example.com',
      nickname: 'admin_prod',
      displayName: 'Admin Prod',
      role: 'admin',
    });
    event.headers = { 'x-tenant-id': 'studio-b' };

    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.reactivated).toBe(true);
    expect(body.username).toBe('admin_prod');

    const createCalls = cognitoMockSend.mock.calls.filter(
      (call: unknown[]) => call[0] && typeof call[0] === 'object' && 'TemporaryPassword' in (call[0] as object),
    );
    expect(createCalls).toHaveLength(0);

    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-participants-table',
        Item: expect.objectContaining({
          userId: { S: 'admin_prod' },
          cognitoUsername: { S: 'opaque-existing' },
          authUserId: { S: 'sub-existing' },
        }),
      }),
    );
  });

  test('keeps first entered casing as canonical user id', async () => {
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    mockNewUserCognitoPrelude('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
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

    expect(cognitoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Username: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
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
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

    cognitoMockSend
      .mockResolvedValueOnce({ Users: [] })
      .mockRejectedValueOnce(new Error('UserNotFoundException'))
      .mockRejectedValueOnce(usernameExistsError)
      .mockResolvedValueOnce({}) // AdminSetUserPassword
      .mockResolvedValueOnce({}) // AdminUpdateUserAttributes
      .mockResolvedValueOnce({}) // AdminAddUserToGroup
      .mockResolvedValueOnce(adminGetUserResponse('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
    sesMockSend.mockResolvedValueOnce({});

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
    expect(cognitoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Username: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        Permanent: true,
      }),
    );
  });

  test('registered user with authUserId gets token invite resend when AUTH_TOKENS_TABLE is set', async () => {
    const usernameExistsError = new Error('User already exists');
    (usernameExistsError as any).name = 'UsernameExistsException';

    cognitoMockSend
      .mockResolvedValueOnce({ Users: [] })
      .mockResolvedValueOnce(adminGetUserResponse('existinguser', 'sub-123')) // legacy resolve by userId
      .mockResolvedValueOnce({}) // AdminUpdateUserAttributes (linked path / or create path)
      .mockResolvedValueOnce({}) // AdminSetUserPassword
      .mockResolvedValueOnce({}) // AdminAddUserToGroup
      .mockResolvedValueOnce(adminGetUserResponse('existinguser', 'sub-123'));
    sesMockSend.mockResolvedValueOnce({});
    dynamoMockSend.mockResolvedValue({});

    // Profile with authUserId in this tenant → UsernameExists recovery uses hasLoginProfile
    // Force create collision: email not in pool, but username from opaque then exists...
    // Simpler: email list finds nothing, legacy get finds existinguser as cognito username=nickname
    // linkedExistingPoolUser=true with status not CONFIRMED → SetPassword path
    // Actually legacy resolve sets linkedExisting=true. If status undefined, goes to SetPassword.
    // For authUserId resend test - use profile that has cognitoUsername and then UsernameExists on create.

    // Reset and use clearer sequence: stored cognitoUsername on profile
    cognitoMockSend.mockReset();
    dynamoMockSend.mockReset();
    dynamoMockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: 'default-tenant' },
          userId: { S: 'existinguser' },
          authUserId: { S: 'sub-123' },
          cognitoUsername: { S: 'existinguser' },
        },
      })
      .mockResolvedValue({});

    cognitoMockSend
      .mockResolvedValueOnce({ Users: [] }) // email lookup
      // cognitoUsername from profile = existinguser → create with that name
      .mockRejectedValueOnce(usernameExistsError)
      .mockResolvedValueOnce({}) // update attrs
      .mockResolvedValueOnce({}) // set password
      .mockResolvedValueOnce({}) // group
      .mockResolvedValueOnce(adminGetUserResponse('existinguser', 'sub-123'));
    sesMockSend.mockResolvedValueOnce({});

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
  });

  test('returns 500 when AUTH_TOKENS_TABLE is missing for email invite flow', async () => {
    delete process.env.AUTH_TOKENS_TABLE;
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    mockNewUserCognitoPrelude('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

    const event = baseEvent({
      email: 'legacy@example.com',
      nickname: 'legacyuser',
      role: 'participant',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toMatch(/secure invite token|AUTH_TOKENS_TABLE/i);

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
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('dddddddd-dddd-4ddd-8ddd-dddddddddddd');

    cognitoMockSend
      .mockResolvedValueOnce({ Users: [] })
      .mockRejectedValueOnce(new Error('UserNotFoundException'))
      .mockRejectedValueOnce(usernameExistsError)
      .mockRejectedValueOnce(new Error('Password reset failed'));

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
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
    cognitoMockSend
      .mockResolvedValueOnce({ Users: [] })
      .mockRejectedValueOnce(new Error('UserNotFoundException'))
      .mockRejectedValueOnce(new Error('Cognito error'));

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
    const opaqueUsername = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue(opaqueUsername);
    cognitoMockSend
      .mockResolvedValueOnce({ Users: [] })
      .mockRejectedValueOnce(new Error('UserNotFoundException'))
      .mockResolvedValueOnce({}) // AdminCreateUser
      .mockResolvedValueOnce({}) // AdminSetUserPassword
      .mockRejectedValueOnce(groupError)
      .mockResolvedValueOnce(adminGetUserResponse(opaqueUsername));
    sesMockSend.mockResolvedValueOnce({});

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
    const opaqueUsername = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue(opaqueUsername);
    mockNewUserCognitoPrelude(opaqueUsername);
    sesMockSend.mockRejectedValueOnce(new Error('SES error'));

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
    const opaqueUsername = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue(opaqueUsername);
    mockNewUserCognitoPrelude(opaqueUsername);
    sesMockSend.mockResolvedValueOnce({});

    const event = {
      body: {
        email: 'test@example.com',
        nickname: 'testuser',
        displayName: 'Test User',
        role: 'participant',
      },
    } as any;

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  test('returns 400 if displayName is missing for new profile', async () => {
    const rawEvent = {
      body: JSON.stringify({ nickname: 'max', role: 'participant' }),
    } as any;

    const result = await handler(rawEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/Anzeigenamen/i);
  });

  test('returns 400 if displayName is invalid', async () => {
    const event = baseEvent({
      nickname: 'max',
      role: 'participant',
      displayName: 'X',
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBeTruthy();
  });

  test('uses default BASE_URL if not provided', async () => {
    process.env.BASE_URL = '';
    const opaqueUsername = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue(opaqueUsername);
    mockNewUserCognitoPrelude(opaqueUsername);
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
  });

  test('creates invite token with opaque cognitoUsername', async () => {
    const opaqueUsername = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    jest.spyOn(require('crypto'), 'randomUUID').mockReturnValue(opaqueUsername);
    mockNewUserCognitoPrelude(opaqueUsername);
    sesMockSend.mockResolvedValueOnce({});

    const event = baseEvent({
      email: 'test@example.com',
      nickname: 'testuser',
      role: 'participant',
    });

    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    expect(dynamoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-auth-tokens-table',
        Item: expect.objectContaining({
          userId: { S: 'testuser' },
          cognitoUsername: { S: opaqueUsername },
          purpose: { S: 'invite-activation' },
        }),
      }),
    );

    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ['test@example.com'] },
        Message: expect.objectContaining({
          Body: expect.objectContaining({
            Html: expect.objectContaining({
              Data: expect.stringMatching(
                /\/invite\?[^"]*token=[A-Za-z0-9_-]+[^"]*nickname=testuser/,
              ),
            }),
          }),
        }),
      }),
    );
  });
});
