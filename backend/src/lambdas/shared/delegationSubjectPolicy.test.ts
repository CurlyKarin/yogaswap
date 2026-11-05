import { GetItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import { getDelegationSubjectPolicyErrorResponse } from "./delegationSubjectPolicy";

jest.mock("@aws-sdk/client-dynamodb", () => {
  const mockSend = jest.fn();
  return {
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
    GetItemCommand: jest.fn((input) => ({ ...input, __type: "GetItem" })),
    QueryCommand: jest.fn((input) => ({ ...input, __type: "Query" })),
    mockSend,
  };
});

const { mockSend } = jest.requireMock("@aws-sdk/client-dynamodb");

describe("getDelegationSubjectPolicyErrorResponse", () => {
  const client = { send: mockSend } as never;

  beforeEach(() => {
    mockSend.mockReset();
  });

  it("returns null without actingFor", async () => {
    const result = await getDelegationSubjectPolicyErrorResponse({
      client,
      tenantsTable: "tenants",
      participantsTable: "participants",
      tenantId: "default-tenant",
    });
    expect(result).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("blocks active subjects when studio setting is off", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          settings: {
            M: { delegationCanManageActiveParticipants: { BOOL: false } },
          },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          userId: { S: "maya" },
          authUserId: { S: "cognito-maya" },
          inviteCompletedAt: { S: "2026-01-01T00:00:00.000Z" },
        },
      });

    const result = await getDelegationSubjectPolicyErrorResponse({
      client,
      tenantsTable: "tenants",
      participantsTable: "participants",
      tenantId: "default-tenant",
      actingForUserId: "maya",
    });

    expect(result?.statusCode).toBe(403);
    expect(JSON.parse(result?.body ?? "{}").error).toMatch(/active participants/i);
    expect(GetItemCommand).toHaveBeenCalled();
    expect(QueryCommand).not.toHaveBeenCalled();
  });

  it("allows invited subjects when active management is off", async () => {
    mockSend
      .mockResolvedValueOnce({
        Item: {
          tenantId: { S: "default-tenant" },
          settings: {
            M: { delegationCanManageActiveParticipants: { BOOL: false } },
          },
        },
      })
      .mockResolvedValueOnce({
        Item: {
          userId: { S: "luca" },
          inviteSentAt: { S: "2026-01-01T00:00:00.000Z" },
        },
      });

    const result = await getDelegationSubjectPolicyErrorResponse({
      client,
      tenantsTable: "tenants",
      participantsTable: "participants",
      tenantId: "default-tenant",
      actingForUserId: "luca",
    });

    expect(result).toBeNull();
  });
});
