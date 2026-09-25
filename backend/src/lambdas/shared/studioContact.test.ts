import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  formatStudioContactHtml,
  formatStudioContactText,
  loadStudioMailContext,
} from "./studioContact";

describe("studioContact", () => {
  const send = jest.fn();
  const client = { send } as unknown as DynamoDBClient;

  beforeEach(() => {
    send.mockReset();
  });

  test("formatters return null without email", () => {
    expect(formatStudioContactHtml(undefined)).toBeNull();
    expect(formatStudioContactHtml({ email: "" })).toBeNull();
    expect(formatStudioContactText(undefined)).toBeNull();
  });

  test("formatters render with and without name", () => {
    expect(formatStudioContactHtml({ email: "info@studio.de", name: "Beharmony" })).toBe(
      "Bei Fragen wende Dich an Dein Studio: <strong>Beharmony</strong> (info@studio.de)",
    );
    expect(formatStudioContactText({ email: "info@studio.de" })).toBe(
      "Bei Fragen wende Dich an Dein Studio: info@studio.de",
    );
  });

  test("formatStudioContactHtml escapes HTML in names", () => {
    expect(
      formatStudioContactHtml({ email: "a@b.de", name: 'A <b>"Team"' }),
    ).toContain("<strong>A &lt;b&gt;&quot;Team&quot;</strong>");
  });

  test("loadStudioMailContext returns contact from tenant settings", async () => {
    send.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "t1" },
        name: { S: "Beharmony" },
        settings: {
          M: {
            contactEmail: { S: "info@beharmony.yoga" },
            contactName: { S: "Studio-Team" },
          },
        },
      },
    });

    const ctx = await loadStudioMailContext(client, "tenants", "t1");
    expect(ctx).toEqual({
      studioName: "Beharmony",
      studioContact: { email: "info@beharmony.yoga", name: "Studio-Team" },
    });
  });

  test("loadStudioMailContext falls back contact name to tenant name", async () => {
    send.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "t1" },
        name: { S: "Beharmony" },
        settings: {
          M: {
            contactEmail: { S: "info@beharmony.yoga" },
          },
        },
      },
    });

    const ctx = await loadStudioMailContext(client, "tenants", "t1");
    expect(ctx.studioContact).toEqual({
      email: "info@beharmony.yoga",
      name: "Beharmony",
    });
  });

  test("loadStudioMailContext omits contact without email", async () => {
    send.mockResolvedValueOnce({
      Item: {
        tenantId: { S: "t1" },
        name: { S: "Beharmony" },
        settings: { M: {} },
      },
    });
    const ctx = await loadStudioMailContext(client, "tenants", "t1");
    expect(ctx).toEqual({ studioName: "Beharmony" });
  });

  test("loadStudioMailContext returns {} on missing table or errors", async () => {
    expect(await loadStudioMailContext(client, undefined, "t")).toEqual({});
    send.mockRejectedValueOnce(new Error("boom"));
    expect(await loadStudioMailContext(client, "tenants", "t")).toEqual({});
  });
});
