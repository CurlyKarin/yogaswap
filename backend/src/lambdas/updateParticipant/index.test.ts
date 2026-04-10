import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

jest.mock("@aws-sdk/client-dynamodb", () => {
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

jest.mock("@aws-sdk/client-cognito-identity-provider", () => {
  const mockSend = jest.fn();
  return {
    CognitoIdentityProviderClient: jest.fn(() => ({ send: mockSend })),
    AdminUpdateUserAttributesCommand: jest.fn((input) => input),
    AdminUserGlobalSignOutCommand: jest.fn((input) => input),
    AdminSetUserPasswordCommand: jest.fn((input) => input),
    mockSend,
  };
});

jest.mock("@aws-sdk/client-ses", () => {
  const mockSend = jest.fn();
  return {
    SESClient: jest.fn(() => ({ send: mockSend })),
    SendEmailCommand: jest.fn((input) => input),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");
const { mockSend: cognitoMockSend } = jest.requireMock("@aws-sdk/client-cognito-identity-provider");
const { mockSend: sesMockSend } = jest.requireMock("@aws-sdk/client-ses");

describe("updateParticipant Lambda", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PARTICIPANTS_TABLE: "test-participants",
      MEMBERSHIPS_TABLE: "test-memberships",
      TENANTS_TABLE: "test-tenants",
      USER_POOL_ID: "test-user-pool-id",
      BASE_URL: "https://yogaswap.example.com",
      SES_SOURCE_EMAIL: "support@yogaswap.de",
      AUTH_TOKENS_TABLE: "test-auth-tokens",
      AUTH_TOKEN_TTL_SECONDS: "3600",
    };
    mockSend.mockReset();
    cognitoMockSend.mockReset();
    sesMockSend.mockReset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  const makeEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent =>
    ({
      headers: {},
      pathParameters: { userId: "alice" },
      body: JSON.stringify({ email: "alice+new@example.com" }),
      requestContext: { authorizer: { principalId: "admin" } } as any,
      ...overrides,
    } as any);

  test("updates participant profile successfully", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.email).toBe("alice+new@example.com");
    expect(body.userId).toBe("alice");
    expect(body.status).toBe("no_login");
    expect(mockSend).toHaveBeenCalledTimes(5);
  });

  test("updates participant role when actor is admin", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // actor role check
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          authUserId: { S: "sub-123" },
        },
      }) // target participant
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          role: { S: "participant" },
        },
      }) // target membership (current role)
      .mockResolvedValueOnce({}) // memberships PutItem (role change)
      .mockResolvedValueOnce({}); // participants PutItem
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        body: JSON.stringify({ role: "instructor" }),
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.roleChanged).toBe(true);
    expect(body.roleChangedEmailSent).toBe(true);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "test-memberships",
        Item: expect.objectContaining({
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          role: { S: "instructor" },
        }),
      }),
    );
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ["alice@example.com"] },
      }),
    );
  });

  test("returns 403 when non-admin tries to change role", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }); // actor role check

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "instructor-1" } } as any,
        body: JSON.stringify({ role: "participant" }),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toMatch(/Only admins can change roles/);
  });

  test("returns 404 if participant does not exist", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({ Item: undefined })
      .mockResolvedValueOnce({ Items: [] })
      .mockResolvedValueOnce({ Items: [] });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe("Participant not found");
  });

  test("returns 400 for invalid settings payload", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // actor role check for forced reset
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
        },
      });

    const result = await handler(
      makeEvent({
        body: JSON.stringify({ settings: "not-an-object" }),
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/settings must be an object/);
  });

  test("derives invited/active status when inviteSentAt/authUserId are set", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
        },
      })
      .mockResolvedValueOnce({});

    const resultInvited = await handler(
      makeEvent({
        body: JSON.stringify({ inviteSentAt: "2026-01-01T12:00:00.000Z" }),
      }),
    );

    expect(resultInvited.statusCode).toBe(200);
    expect(JSON.parse(resultInvited.body).status).toBe("invited");

    mockSend.mockReset();
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          inviteSentAt: { S: "2026-01-01T12:00:00.000Z" },
        },
      })
      .mockResolvedValueOnce({});

    const resultActive = await handler(
      makeEvent({
        body: JSON.stringify({
          authUserId: "cognito-sub-123",
          inviteCompletedAt: "2026-01-02T12:00:00.000Z",
        }),
      }),
    );

    expect(resultActive.statusCode).toBe(200);
    expect(JSON.parse(resultActive.body).status).toBe("active");

    mockSend.mockReset();
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          inviteSentAt: { S: "2026-01-01T12:00:00.000Z" },
        },
      })
      .mockResolvedValueOnce({});

    const resultStuckSub = await handler(
      makeEvent({
        body: JSON.stringify({ authUserId: "cognito-sub-only" }),
      }),
    );

    expect(resultStuckSub.statusCode).toBe(200);
    expect(JSON.parse(resultStuckSub.body).status).toBe("invited");
  });

  test("returns 403 when membership is missing", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });
    const result = await handler(makeEvent());
    expect(result.statusCode).toBe(403);
  });

  test("returns 403 when instructor is disabled by tenant setting", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          settings: {
            M: {
              instructorCanManageParticipants: { BOOL: false },
            },
          },
        },
      });

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "instructor-1" } } as any,
      }),
    );
    expect(result.statusCode).toBe(403);
  });

  test("allows self-linking authUserId when participant links their own sub", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          inviteSentAt: { S: "2026-01-01T12:00:00.000Z" },
        },
      })
      .mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "alice" } } as any,
        body: JSON.stringify({ authUserId: "cognito-sub-123" }),
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).status).toBe("active");
    // Only: 1) existing participant lookup + 2) PutItem
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test("syncs email to Cognito for users with login profile", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          authUserId: { S: "sub-123" },
          cognitoUsername: { S: "Alice" },
        },
      })
      .mockResolvedValueOnce({});
    cognitoMockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        body: JSON.stringify({ email: "alice.new@example.com" }),
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(cognitoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        UserPoolId: "test-user-pool-id",
        Username: "Alice",
        UserAttributes: expect.arrayContaining([
          { Name: "email", Value: "alice.new@example.com" },
          { Name: "email_verified", Value: "true" },
        ]),
      }),
    );
    expect(cognitoMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        UserPoolId: "test-user-pool-id",
        Username: "Alice",
      }),
    );
  });

  test("returns 502 when Cognito email sync fails", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          name: { S: "Demo" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          authUserId: { S: "sub-123" },
        },
      });
    cognitoMockSend.mockRejectedValueOnce(new Error("cognito down"));

    const result = await handler(
      makeEvent({
        body: JSON.stringify({ email: "alice.new@example.com" }),
      }),
    );

    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body).error).toMatch(/sync email/i);
  });

  test("forces password reset on email change when requested", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "admin" },
          role: { S: "admin" },
        },
      }) // actor role check for forced reset
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "alice@example.com" },
          authUserId: { S: "sub-123" },
          cognitoUsername: { S: "Alice" },
        },
      }) // existing participant
      .mockResolvedValueOnce({}); // participants PutItem
    cognitoMockSend.mockResolvedValue({});
    sesMockSend.mockResolvedValueOnce({});

    const result = await handler(
      makeEvent({
        body: JSON.stringify({
          email: "alice.new@example.com",
          forcePasswordResetOnEmailChange: true,
        }),
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.passwordResetTriggered).toBe(true);
    expect(body.passwordResetEmailSent).toBe(true);
    expect(sesMockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Destination: { ToAddresses: ["alice.new@example.com"] },
      }),
    );
  });

  test("returns 403 when non-admin requests forced password reset on email change", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }); // actor role check for forced reset

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "instructor-1" } } as any,
        body: JSON.stringify({
          email: "alice.new@example.com",
          forcePasswordResetOnEmailChange: true,
        }),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toMatch(/Only admins can force password reset/i);
  });

  test("allows instructor to update email for invited participant", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // actor role check (email change)
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "old@example.com" },
          inviteSentAt: { S: "2026-01-01T12:00:00.000Z" },
        },
      })
      .mockResolvedValueOnce({});
    cognitoMockSend.mockResolvedValue({});

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "instructor-1" } } as any,
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    );

    expect(result.statusCode).toBe(200);
  });

  test("returns 403 when instructor tries to change email of active participant", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // canManage membership lookup
      .mockResolvedValueOnce({
        Item: { tenantId: { S: "default-tenant" }, name: { S: "Demo" } },
      }) // canManage tenant lookup
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "instructor-1" },
          role: { S: "instructor" },
        },
      }) // actor role check (email change)
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          userId: { S: "alice" },
          email: { S: "old@example.com" },
          authUserId: { S: "sub-123" },
        },
      });

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "instructor-1" } } as any,
        body: JSON.stringify({ email: "new@example.com" }),
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toMatch(/Only admins can change email of registered participants/i);
  });

  test("rejects self-linking when other fields are present", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined }); // membership lookup -> forbidden

    const result = await handler(
      makeEvent({
        requestContext: { authorizer: { principalId: "alice" } } as any,
        body: JSON.stringify({ authUserId: "cognito-sub-123", email: "x@example.com" }),
      }),
    );

    expect(result.statusCode).toBe(403);
  });
});

