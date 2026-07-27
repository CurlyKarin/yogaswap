import type { CognitoCustomMessageEvent } from "./index";
import { handler } from "./index";

function baseEvent(
  triggerSource: CognitoCustomMessageEvent["triggerSource"],
  overrides?: Partial<CognitoCustomMessageEvent["request"]>,
): CognitoCustomMessageEvent {
  return {
    version: "1",
    region: "eu-central-1",
    userPoolId: "eu-central-1_test",
    userName: "luna",
    triggerSource,
    callerContext: {
      awsSdkVersion: "aws-sdk-unknown-version",
      clientId: "client",
    },
    request: {
      userAttributes: {
        email: "luna@example.com",
        nickname: "Luna",
      },
      codeParameter: "{####}",
      linkParameter: "{##Click Here##}",
      usernameParameter: "luna",
      ...overrides,
    },
    response: {
      smsMessage: null,
      emailMessage: null,
      emailSubject: null,
    },
  } as CognitoCustomMessageEvent;
}

describe("cognitoCustomMessage (#107)", () => {
  test("customizes AdminResetUserPassword with German subject and code placeholder", async () => {
    const event = baseEvent("CustomMessage_AdminResetUserPassword");
    const result = await handler(event);

    expect(result.response.emailSubject).toBe("YogaSwap Bestaetigungscode");
    expect(result.response.emailMessage).toContain("Hallo Luna");
    expect(result.response.emailMessage).toContain("{####}");
    expect(result.response.emailMessage).toContain("Bestaetigungscode");
  });

  test("customizes ForgotPassword the same way", async () => {
    const event = baseEvent("CustomMessage_ForgotPassword");
    const result = await handler(event);

    expect(result.response.emailSubject).toBe("YogaSwap Bestaetigungscode");
    expect(result.response.emailMessage).toContain("{####}");
  });

  test("leaves unrelated triggers unchanged", async () => {
    const event = baseEvent("CustomMessage_SignUp");
    event.response.emailSubject = "keep";
    event.response.emailMessage = "keep-body";
    const result = await handler(event);

    expect(result.response.emailSubject).toBe("keep");
    expect(result.response.emailMessage).toBe("keep-body");
  });

  test("falls back to userName when nickname missing", async () => {
    const event = baseEvent("CustomMessage_AdminResetUserPassword", {
      userAttributes: { email: "x@y.de" },
    });
    event.userName = "karin";
    const result = await handler(event);

    expect(result.response.emailMessage).toContain("Hallo karin");
  });
});
