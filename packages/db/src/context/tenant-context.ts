import { objectIdSchema, type ObjectIdString } from "@zuridesk/shared";

const tenantContextMarker: unique symbol = Symbol("zuridesk.tenant-context");

export interface TrustedTenantContext {
  readonly tenantId: ObjectIdString;
  readonly userId: ObjectIdString;
  readonly requestId: string;
  readonly [tenantContextMarker]: true;
}

export interface TrustedTenantContextInput {
  tenantId: string;
  userId: string;
  requestId: string;
}

/**
 * Creates the opaque context accepted by tenant repositories.
 *
 * Only authenticated server middleware may call this factory. The tenant ID
 * must come from a verified membership, never from a client-controlled body,
 * query string, or header.
 */
export function createTrustedTenantContext(input: TrustedTenantContextInput): TrustedTenantContext {
  const requestId = input.requestId.trim();

  if (requestId.length === 0 || requestId.length > 128) {
    throw new Error("requestId must contain between 1 and 128 characters");
  }

  return Object.freeze({
    tenantId: objectIdSchema.parse(input.tenantId),
    userId: objectIdSchema.parse(input.userId),
    requestId,
    [tenantContextMarker]: true as const
  });
}

export function isTrustedTenantContext(value: unknown): value is TrustedTenantContext {
  return (
    typeof value === "object" &&
    value !== null &&
    tenantContextMarker in value &&
    value[tenantContextMarker] === true
  );
}
