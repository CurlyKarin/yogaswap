import { jest } from "@jest/globals";

describe("dynamoClient", () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  test("verwendet Standard-Region, wenn AWS_REGION nicht gesetzt ist", async () => {
    delete process.env.AWS_REGION;
    const { dynamoClient } = await import("./dynamoClient");
    await expect(dynamoClient.config.region()).resolves.toBe("eu-central-1");
  });

  test("verwendet AWS_REGION, wenn gesetzt", async () => {
    process.env.AWS_REGION = "eu-west-1";
    const { dynamoClient } = await import("./dynamoClient");
    await expect(dynamoClient.config.region()).resolves.toBe("eu-west-1");
  });
});

