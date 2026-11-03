# Trusted tenant repository context

Tenant-owned repository methods accept a `TrustedTenantContext`; they never
accept a caller-supplied `tenantId` argument. The context carries the
authenticated user, active tenant, and request identifier. Phase 3 API services
revalidate the live session, user, tenant, and membership before tenant
authorization. Generic membership and invitation mutators are internal to the
database package; public consumers receive narrow invariant-preserving commands.

```ts
const context = await verifyCandidateTenantMembership({
  tenantId: selectedTenantId,
  authenticatedUserId: authenticatedSession.userId,
  requestId
});

if (context !== null) await locationRepository.findById(context, locationId);
```

The raw factory is private to `packages/db`. Candidate verification checks the
active global user, tenant, and tenant/user membership before it returns a
frozen, runtime-marked context. A plain object with the same visible properties
is not trusted. This is a defense-in-depth boundary: the API must still ensure
the authenticated user ID comes from server state and not from request bodies,
query strings, route parameters, or client-controlled headers.

Repository implementations must:

- inject `tenantId` into every query and write internally;
- expose business-specific operations rather than arbitrary filters;
- validate join and aggregation scope explicitly;
- centralize soft-delete behavior; and
- return plain domain data rather than Mongoose models or queries.

Platform-global administration remains fail-closed and has no endpoints. Tenant
context is never an escape hatch for global access.
