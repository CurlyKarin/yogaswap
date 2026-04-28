import { getTenantContext, DEFAULT_TENANT_ID } from "./tenantContext";
import type { APIGatewayProxyEvent } from "aws-lambda";

function makeEvent(partial: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    headers: {},
    queryStringParameters: null,
    requestContext: {} as any,
    ...partial,
  } as APIGatewayProxyEvent;
}

describe("getTenantContext (lambda shared)", () => {
  it("bevorzugt nickname aus JWT-Claims vor principalId und Query-Param", () => {
    const event = makeEvent({
      requestContext: {
        authorizer: {
          jwt: { claims: { nickname: "alice" } },
          principalId: "ignored-principal",
        },
      } as any,
      queryStringParameters: { user: "ignored-query" },
      headers: { "x-tenant-id": "tenant-1" },
    });

    const ctx = getTenantContext(event);

    expect(ctx).toEqual({
      tenantId: "tenant-1",
      userId: "alice",
      actingForUserId: undefined,
    });
  });

  it("behaelt userId aus JWT-Claims in Originalschreibweise", () => {
    const event = makeEvent({
      requestContext: {
        authorizer: {
          jwt: { claims: { nickname: "Maya" } },
        },
      } as any,
    });

    const ctx = getTenantContext(event);
    expect(ctx.userId).toBe("Maya");
  });

  it("verwendet principalId, wenn kein nickname im JWT vorhanden ist", () => {
    const event = makeEvent({
      requestContext: {
        authorizer: {
          principalId: "bob",
        },
      } as any,
      headers: {},
    });

    const ctx = getTenantContext(event);

    expect(ctx.userId).toBe("bob");
    expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("verwendet Query-Param user, wenn weder nickname noch principalId gesetzt sind", () => {
    const event = makeEvent({
      requestContext: {} as any,
      queryStringParameters: { user: "carol" },
    });

    const ctx = getTenantContext(event);

    expect(ctx.userId).toBe("carol");
    expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("verwendet x-actor-user-id Header vor Query-Param user", () => {
    const event = makeEvent({
      headers: { "x-actor-user-id": "actor-header" },
      queryStringParameters: { user: "query-user" },
    });

    const ctx = getTenantContext(event);
    expect(ctx.userId).toBe("actor-header");
  });

  it("setzt userId auf undefined, wenn kein User ermittelt werden kann", () => {
    const event = makeEvent();

    const ctx = getTenantContext(event);

    expect(ctx.userId).toBeUndefined();
    expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("liest tenantId aus x-tenant-id Header (lowercase)", () => {
    const event = makeEvent({
      headers: { "x-tenant-id": "tenant-lower" },
    });

    const ctx = getTenantContext(event);

    expect(ctx.tenantId).toBe("tenant-lower");
  });

  it("liest tenantId aus X-Tenant-ID Header (uppercase)", () => {
    const event = makeEvent({
      headers: { "X-Tenant-ID": "tenant-upper" },
    });

    const ctx = getTenantContext(event);

    expect(ctx.tenantId).toBe("tenant-upper");
  });

  it("fällt auf DEFAULT_TENANT_ID zurück, wenn kein Tenant-Header gesetzt ist", () => {
    const event = makeEvent();

    const ctx = getTenantContext(event);

    expect(ctx.tenantId).toBe(DEFAULT_TENANT_ID);
  });

  it("liest actingForUserId aus Header und Query-Param", () => {
    const byHeader = getTenantContext(
      makeEvent({
        headers: { "x-acting-for-user-id": "target-header" },
      }),
    );
    expect(byHeader.actingForUserId).toBe("target-header");

    const byQuery = getTenantContext(
      makeEvent({
        queryStringParameters: { actingForUserId: "target-query" } as any,
      }),
    );
    expect(byQuery.actingForUserId).toBe("target-query");
  });
});

