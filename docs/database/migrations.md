# Database migrations

ZuriDesk uses owned, forward-only MongoDB migrations in `packages/db`. Applied
migrations are stored in the global `schema_migrations` collection with an
immutable ID, name, checksum, application time, duration, and runner version.
The runner refuses duplicate or unordered IDs, changed applied migrations, and
database records whose definitions have disappeared from the registry.

## Authoring a migration

1. Add a file under `packages/db/src/migrations/` with an ID formatted as
   `NNNN_lowercase_description`.
2. Make `up` idempotent. MongoDB index and collection changes cannot be treated
   as one portable multi-document transaction, and a process can stop after an
   operation succeeds but before its migration record is written.
3. Register it in ascending order in `registry.ts`.
4. Update the central index manifest for every index it creates.
5. Add integration tests against the replica-set MongoDB test service.
6. Add a rollback note. Rollback is normally a new forward migration; never
   edit or delete an applied migration.

Migration checksums include the ID, name, migration-owned immutable document-shape/index
material, and migration function. Migration commands therefore run the pinned
TypeScript source through the workspace's pinned `tsx` version rather than
through an independently transformed copy. A closed-over schema or index change
must change the checksum material and will be rejected after application.

## Commands

With `MONGODB_URI` and `MONGODB_DB_NAME` set directly or in the gitignored root
`.env.local`:

```bash
pnpm db:migration:status
pnpm db:migrate
```

Both commands avoid printing connection strings. Status initializes only the
migration tracking collection and its unique index if they do not exist.

Phase 2.2 operational details, seed safety, and compatibility guidance are in
[Phase 2.2 tenant identity and locations](phase-2.2-tenant-identity.md).
Phase 3 migration order, partial-rerun behavior, compatibility, and operational
checks are in the
[Phase 3 authentication runbook](../runbooks/phase-3-auth-operations.md).
Phase 4.1's additive, no-backfill migration, compatibility boundary and recovery
guidance are documented in
[Phase 4.1 booking domain foundation](phase-4.1-booking-foundation.md).

## Deployment and recovery

- Run migrations as a single CI/CD job before application instances requiring
  the new schema are released. The current runner does not coordinate concurrent
  executors, so deployment orchestration must allow exactly one migrator.
- Keep expand-and-contract compatibility: add fields and indexes first, deploy
  compatible readers/writers, backfill in bounded batches, then remove obsolete
  behavior in a later release.
- Before a high-risk production migration, confirm continuous backups and test
  restore procedures in the selected Atlas environment.
- If an operation fails, diagnose the partial state, make the existing `up`
  operation safely idempotent before it is applied anywhere, and rerun it. Once
  a migration has a recorded checksum, repair it only with a new migration.

Production execution and restore actions remain separately approved operational
changes.
