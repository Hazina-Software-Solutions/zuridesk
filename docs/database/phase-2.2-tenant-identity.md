# Phase 2.2 tenant identity and locations

## Status and boundary

Phase 2.2 implements the persistence boundary for tenant identity, locations,
users, memberships, and invitations. It does not add API routes, sign-in,
sessions, role enforcement, invite delivery or redemption, or production
infrastructure. Those remain later approved work.

The global collections are `tenants` and `users`. The tenant-owned collections
are `locations`, `memberships`, and `invites`; every repository operation for
those collections receives an opaque `TrustedTenantContext` and injects the
tenant predicate internally.

## Data behavior

- Every document has `schemaVersion: 1` and UTC `createdAt`/`updatedAt` values.
- Ownership and identity ObjectId references are immutable. API-facing DTOs use
  lowercase branded ObjectId strings and contain no Mongoose values.
- Tenant bootstrapping preallocates the tenant, default-location, and owner-
  membership IDs and writes all three in one replica-set transaction.
- A default location must be active, not deleted, and owned by the current
  tenant. The current default cannot be archived until another default is set.
  Default selection and archiving both write the tenant record so transaction
  conflict detection preserves the invariant under races.
- Membership roles are a nonempty, deduplicated subset of `owner`, `manager`,
  `receptionist`, and `stylist`. Permissions are deferred to Phase 3.
- Candidate-tenant verification checks an active global user, active tenant,
  and active membership before issuing a context. The user ID supplied to that
  verifier must already come from authenticated server state when Phase 3 adds
  authentication. Cross-tenant membership discovery is deliberately absent.
- Invite recipients are normalized email or E.164 phone values. Invite token
  digests are lowercase SHA-256 values with `select: false` and never appear in
  DTOs. A future token will have the form `<inviteId>.<32-byte random secret>`;
  redemption is not implemented here.
- Invite validity is checked against `expiresAt` in repository queries rather
  than relying on asynchronous TTL deletion. Pending, accepted, and revoked
  invitations retain their original expiry and are eligible for deletion at
  that time.

## Repository surface

The public `@zuridesk/db` package exports fixed repositories for:

- current-tenant lookup and transactional default-location selection;
- location create, scoped lookup/list/count/update, archive, and restore;
- membership create, candidate-tenant verification, scoped lookup/list/count,
  user join, role/status update, revoke, and restore; and
- invite create, scoped lookup/list/count, pending-recipient lookup, and revoke.

Global user mutation and transactional tenant bootstrap remain internal until
Phase 3 introduces a trusted onboarding/platform capability. No public export
returns a connection, model, document, query, session, or invite digest. The
raw context factory is private. Architecture verification also limits raw model
imports to database models, repositories, seeds, and tests.

## Migration, seed, and verification

Start the local replica set, then use the pinned workspace commands:

```bash
docker compose -f infra/compose.mongo.yml up --detach --wait
pnpm db:migration:status
pnpm db:migrate
```

Migration `0001_create_tenant_identity_collections` creates missing collections
and named application indexes. It is idempotent after partial collection or
index creation. Its checksum includes immutable collection/index material as
well as the migration implementation.

Synthetic fixtures are restricted to explicit development/test use:

```bash
ZURIDESK_ALLOW_SYNTHETIC_SEED=true \
MONGODB_DB_NAME=zuridesk_dev \
pnpm db:seed
```

The seed refuses production mode, rejects database names outside the
`zuridesk_dev*`/`zuridesk_test*` allowlist, requires every registered migration
to be applied, is idempotent, and prints only safe record counts. It creates two
synthetic tenants, a default location and owner membership per tenant, one
global user shared across both tenants, and one pending digest-only `.example`
invite per tenant.

Run the proof suite with a real replica-set URI:

```bash
TEST_MONGODB_URI='mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true' \
pnpm test:integration
```

The integration command fails when `TEST_MONGODB_URI` is absent; skipped tests
cannot be mistaken for isolation proof. Tests use unique databases and remove
them after completion.

## Recovery and rollback

This migration is additive: older application code ignores the new
collections, while Phase 2.2 readers require the migration before use. If it
stops partway through, inspect the failed operation and rerun the same idempotent
migration. Do not edit a recorded migration or manually remove a production
collection/index to roll back. Repair or rollback is a new forward migration.
Production migration execution and restore operations remain separate approval
gates.
