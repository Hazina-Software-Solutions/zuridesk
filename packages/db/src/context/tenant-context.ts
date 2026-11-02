import { objectIdSchema, type ObjectIdString } from "@zuridesk/shared";

const tenantContextMarker: unique symbol = Symbol("zuridesk.tenant-context");
const issuedTenantContexts = new WeakSet<object>();

export interface TrustedTenantContext {
  readonly tenantId: ObjectIdString;
  readonly userId: ObjectIdString;
  readonly requestId: string;
  readonly [tenantContextMarker]: true;
}

interface TrustedTenantContextInput {
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
export function createInternalTrustedTenantContext(
  input: TrustedTenantContextInput
): TrustedTenantContext {
  const requestId = input.requestId.trim();

  if (requestId.length === 0 || requestId.length > 128) {
    throw new Error("requestId must contain between 1 and 128 characters");
  }

  const context: TrustedTenantContext = {
    tenantId: objectIdSchema.parse(input.tenantId),
    userId: objectIdSchema.parse(input.userId),
    requestId,
    [tenantContextMarker]: true as const
  };
  issuedTenantContexts.add(context);
  return Object.freeze(context);
}

export function isTrustedTenantContext(value: unknown): value is TrustedTenantContext {
  return (
    typeof value === "object" &&
    value !== null &&
    issuedTenantContexts.has(value) &&
    tenantContextMarker in value &&
    value[tenantContextMarker] === true
  );
}

export function assertTrustedTenantContext(value: unknown): asserts value is TrustedTenantContext {
  if (!isTrustedTenantContext(value)) {
    throw new Error("A membership-verified trusted tenant context is required");
  }
}
