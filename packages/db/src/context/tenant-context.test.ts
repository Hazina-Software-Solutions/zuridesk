import { describe, expect, it } from "vitest";

import { createInternalTrustedTenantContext, isTrustedTenantContext } from "./tenant-context";

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f191e810c19729de860ea";

describe("trusted tenant context", () => {
  it("creates an immutable context from server-verified identifiers", () => {
    const context = createInternalTrustedTenantContext({
      tenantId,
      userId,
      requestId: " request-123 "
    });

    expect(context).toMatchObject({ tenantId, userId, requestId: "request-123" });
    expect(Object.isFrozen(context)).toBe(true);
    expect(isTrustedTenantContext(context)).toBe(true);
  });

  it("rejects malformed identifiers and request IDs", () => {
    expect(() =>
      createInternalTrustedTenantContext({
        tenantId: "not-an-object-id",
        userId,
        requestId: "request"
      })
    ).toThrow();
    expect(() => createInternalTrustedTenantContext({ tenantId, userId, requestId: " " })).toThrow(
      "requestId"
    );
  });

  it("does not trust a structurally similar client object", () => {
    expect(isTrustedTenantContext({ tenantId, userId, requestId: "request-123" })).toBe(false);
  });

  it("does not trust a spread clone that copies the symbol marker", () => {
    const context = createInternalTrustedTenantContext({
      tenantId,
      userId,
      requestId: "request-123"
    });

    expect(isTrustedTenantContext({ ...context, tenantId: "507f1f77bcf86cd799439012" })).toBe(
      false
    );
  });
});
