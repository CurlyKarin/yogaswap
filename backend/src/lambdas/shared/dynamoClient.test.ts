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

  test("verwendet Standard-Region, wenn AWS_REGION nicht gesetzt ist", () => {
    delete process.env.AWS_REGION;
    const { dynamoClient } = require("./dynamoClient");
    return expect(dynamoClient.config.region()).resolves.toBe("eu-central-1");
  });

  test("verwendet AWS_REGION, wenn gesetzt", () => {
    process.env.AWS_REGION = "eu-west-1";
    const { dynamoClient } = require("./dynamoClient");
    return expect(dynamoClient.config.region()).resolves.toBe("eu-west-1");
  });
});
