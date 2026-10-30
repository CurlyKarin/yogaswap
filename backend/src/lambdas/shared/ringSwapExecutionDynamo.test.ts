import { DynamoDBClient, TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { executeRingCyclePlan } from "./ringSwapExecutionDynamo";
import type { RingCyclePlan } from "./ringSwapExecution";

const ddbMock = mockClient(DynamoDBClient);

beforeEach(() => {
  ddbMock.reset();
});

test("persists cancelledParticipants on override create and update", async () => {
  ddbMock.on(TransactWriteItemsCommand).resolves({});

  const plan: RingCyclePlan = {
    cycle: { nodes: [], edges: [] },
    swapActivations: [
      {
        participantId: "Alice",
        fromCourseId: 1,
        fromDate: "2099-06-01",
        toCourseId: 2,
        toDate: "2099-06-02",
        status: "pending",
      },
    ],
    swapDeletions: [],
    overrideWrites: [
      {
        mode: "create",
        override: {
          courseId: 1,
          date: "2099-06-01",
          participants: [],
          cancelledParticipants: ["Alice"],
          swapped: [],
          waitlist: [],
          shortNoticeCancellations: [],
        },
      },
      {
        mode: "update",
        override: {
          courseId: 2,
          date: "2099-06-02",
          participants: [],
          cancelledParticipants: ["Bob"],
          swapped: ["Alice"],
          waitlist: [],
          shortNoticeCancellations: [],
        },
      },
    ],
  };

  await executeRingCyclePlan({
    client: new DynamoDBClient({}),
    tenantId: "tenant-a",
    plan,
    swapsTable: "swaps",
    overridesTable: "overrides",
  });

  const calls = ddbMock.commandCalls(TransactWriteItemsCommand);
  expect(calls).toHaveLength(1);
  const items = calls[0].args[0].input.TransactItems ?? [];

  const put = items.find((item) => item.Put?.TableName === "overrides");
  expect(put?.Put?.Item?.cancelledParticipants).toEqual({ L: [{ S: "Alice" }] });

  const update = items.find((item) => item.Update?.TableName === "overrides");
  expect(update?.Update?.UpdateExpression).toContain("#cancelledParticipants");
  expect(update?.Update?.ExpressionAttributeValues?.[":cancelledParticipants"]).toEqual({
    L: [{ S: "Bob" }],
  });
  expect(update?.Update?.ExpressionAttributeValues?.[":swapped"]).toEqual({
    L: [{ S: "Alice" }],
  });
});
