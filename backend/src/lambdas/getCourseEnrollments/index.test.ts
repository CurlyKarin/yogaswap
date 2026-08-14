import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import type { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "./index";

const dynamoMock = mockClient(DynamoDBClient);

beforeEach(() => {
  dynamoMock.reset();
  process.env.COURSE_ENROLLMENTS_TABLE = "test-courseEnrollments-table";
});

describe("getCourseEnrollments Lambda", () => {
  it("returns mapped enrollments for tenant", async () => {
    dynamoMock.on(QueryCommand).resolves({
      Items: [
        {
          tenantId: { S: "default-tenant" },
          courseId_userId_validFrom: { S: "1#luna#2026-03-10" },
          courseId: { S: "1" },
          courseIdNumeric: { N: "1" },
          userId: { S: "luna" },
          validFrom: { S: "2026-03-10" },
          source: { S: "seed" },
        },
      ],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {},
    };
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    expect(result.headers).toEqual(
      expect.objectContaining({ "Cache-Control": "no-store" }),
    );
    expect(JSON.parse(result.body)).toEqual([
      {
        tenantId: "default-tenant",
        courseId: 1,
        userId: "luna",
        validFrom: "2026-03-10",
        source: "seed",
      },
    ]);
  });

  it("rejects non-numeric courseId filter", async () => {
    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: { courseId: "abc" },
    };
    const result = await handler(event as APIGatewayProxyEvent);
    expect(result.statusCode).toBe(400);
  });
});
