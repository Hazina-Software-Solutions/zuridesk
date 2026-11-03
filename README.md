# ZuriDesk

ZuriDesk is a proposed multi-tenant operating system for African beauty businesses, launching in Kenya with Nairobi as the initial market.

This repository contains the Phase 1 engineering foundation, the Phase 2.1/2.2
data slices, and the locally implemented Phase 3 authentication, tenancy, and
RBAC baseline. Customer, booking, POS, billing, platform administration,
production delivery configuration, and production deployment do not exist.

## Workspace

- `apps/web` — Next.js tenant dashboard and future public storefront
- `apps/mobile` — Expo application for daily salon operations
- `apps/api` — Fastify REST API shared by web and mobile
- `packages/db` — the only package allowed to access Mongoose
- `packages/shared` — environment-neutral Zod contracts and shared types
- `packages/api-client` — typed HTTP client generated from OpenAPI
- `packages/ui` — platform-neutral design tokens

See the [implementation checklist](docs/implementation-checklist.md),
[local development](docs/setup/local-development.md),
[Atlas and hosting](docs/setup/atlas-and-hosting.md), and the
[Phase 1 security baseline](docs/security/phase-1-baseline.md), and
[Phase 3 authentication, tenancy, and RBAC](docs/security/phase-3-auth-tenancy-rbac.md).

## Commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm db:migration:status
pnpm db:migrate
pnpm db:seed
```

See [Phase 2.2 tenant identity and locations](docs/database/phase-2.2-tenant-identity.md)
for the implemented behavior, migration and fail-closed synthetic seed, and
[query-plan evidence](docs/database/phase-2.2-query-plans.md) for the real-Mongo
index assertions.

Phase 3 requires migration `0002_add_auth_tenancy_rbac`; see its
[operations runbook](docs/runbooks/phase-3-auth-operations.md). Development/test
email capture is opt-in. Production delivery remains unconfigured and fails
closed.
