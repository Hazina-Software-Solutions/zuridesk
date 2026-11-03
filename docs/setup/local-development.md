# Local development

This guide describes the local foundation through Phase 3. Keep commands
aligned with the root `package.json` as the implementation evolves.

## Prerequisites

- The repository's pinned Node.js version
- The repository's pinned pnpm version, installed through Corepack where available or the official standalone pnpm installer
- Git
- Docker-compatible runtime for replica-set integration tests, unless an
  explicitly approved test Atlas cluster is used
- Access to a development-only Atlas project when exercising Atlas connectivity

Use synthetic data only. Never download production data or reuse production,
staging, or another developer's credentials.

## First setup

```bash
corepack enable # when Corepack is available
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Populate local values from an approved secret-sharing channel. `.env.example`
contains names and safe placeholders only. Local `.env*` files must remain
ignored by Git. Never prefix server secrets with `NEXT_PUBLIC_` or Expo public
environment prefixes.

Phase 3 requires separate versioned key maps for each token purpose and an
Ed25519 signing key pair. `AUTH_DELIVERY_MODE=capture` is an explicit local/test
mode only. `unconfigured` is the safe default and rejects delivery-dependent
flows before persistence. Production rejects capture.

The API's MongoDB URI must point to a replica set. Transactions are a product
requirement, so a standalone `mongod` is not a valid integration environment.
When using Atlas, allowlist only the developer's current IP or use the approved
private path; never open `0.0.0.0/0`.

## Run the workspace

The root scripts are the supported entry points:

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

For reusable local login personas and salon configuration, run the development
demo seed after migrations:

```bash
pnpm db:migrate
pnpm db:seed:demo
```

See [development demo data](development-demo-data.md) for the required safety
flags, local password handling, persona emails and extension rules.

Target a workspace only when debugging:

```bash
pnpm --filter @zuridesk/api dev
pnpm --filter @zuridesk/web dev
pnpm --filter @zuridesk/mobile dev
```

Do not import application internals across workspaces. Use shared contracts,
the generated API client, or an explicitly exported package entry point.

## Health behavior

- `/health/live` answers when the API process can serve requests. It does not
  prove MongoDB is available.
- `/health/ready` succeeds only when required dependencies are ready. Failure
  must not reveal hosts, usernames, connection strings, or stack traces.

## Integration-test database

CI and local integration tests use an ephemeral MongoDB replica set where
possible. Tests must create unique databases, use synthetic fixtures, and clean
up only databases they created. Never point test cleanup at a development,
staging, or production database.

The suite proves transaction commit/rollback, tenant isolation, Phase 3
migration/backfill behavior, refresh/invitation/owner concurrency, cookies,
CSRF, session revocation, RBAC, and enumeration resistance. Booking and stock
concurrency arrive with their domain phases.

Start the local replica set and run the integration test with:

```bash
docker compose -f infra/compose.mongo.yml up -d --wait
TEST_MONGODB_URI='mongodb://127.0.0.1:27018/zuridesk_test?replicaSet=rs0&directConnection=true' pnpm test:integration
docker compose -f infra/compose.mongo.yml down
```

The named Docker volume intentionally preserves local development data between
runs. Integration tests still create and remove only their own unique test
database. The default host port is `27018` to avoid colliding with a separately
installed MongoDB; set `ZURIDESK_MONGO_PORT` when another port is required.

## Before opening a review

Run the six root verification commands above and confirm:

- no generated API artifacts drifted;
- no secret, connection string, or populated `.env` file is staged;
- no application imports Mongoose directly;
- documentation reflects any changed environment variable or command.

If dependency installation or Atlas access fails, do not disable TLS, weaken
network access, or commit credentials as a workaround.
