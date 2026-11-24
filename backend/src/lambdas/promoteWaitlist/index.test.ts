import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.COURSES_TABLE = "courses";
  process.env.OVERRIDES_TABLE = "overrides";
  process.env.SWAPS_TABLE = "swaps";
  process.env.MEMBERSHIPS_TABLE = "memberships";
  process.env.TENANTS_TABLE = "tenants";
  delete process.env.COURSE_ENROLLMENTS_TABLE;
});

function eventFor(params: {
  courseId?: string;
  date?: string;
  body?: unknown;
  userId?: string;
}): APIGatewayProxyEvent {
  return {
    pathParameters: {
      courseId: params.courseId ?? "1",
      date: params.date ?? "2099-06-16",
    },
    body: JSON.stringify(params.body ?? { participantId: "carol" }),
    requestContext: {
      authorizer: {
        jwt: { claims: { nickname: params.userId ?? "admin" } },
      },
    },
    headers: {},
  } as unknown as APIGatewayProxyEvent;
}

describe("promoteWaitlist Lambda", () => {
  it("returns 403 when actor has no membership", async () => {
    dynamoMock.on(GetItemCommand).resolves({ Item: undefined });
    const result = await handler(eventFor({}));
    expect(result.statusCode).toBe(403);
  });

  it("returns 400 when participantId missing", async () => {
    const result = await handler(
      eventFor({
        body: {},
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/participantId/);
  });
});
