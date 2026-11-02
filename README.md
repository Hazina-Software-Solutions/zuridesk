# ZuriDesk

ZuriDesk is a proposed multi-tenant operating system for African beauty businesses, launching in Kenya with Nairobi as the initial market.

This repository contains the Phase 1 engineering foundation and the Phase 2.1
and 2.2 data slices. Tenant identity, locations, memberships, and invitation
persistence now exist; customer/booking/POS data, authentication, RBAC, public
business APIs, and production deployment do not.

## Workspace

- `apps/web` — Next.js dashboard, superadmin, and future public storefront
- `apps/mobile` — Expo application for daily salon operations
- `apps/api` — Fastify REST API shared by web and mobile
- `packages/db` — the only package allowed to access Mongoose
- `packages/shared` — environment-neutral Zod contracts and shared types
- `packages/api-client` — typed HTTP client generated from OpenAPI
- `packages/ui` — platform-neutral design tokens

See the [implementation checklist](docs/implementation-checklist.md),
[local development](docs/setup/local-development.md),
[Atlas and hosting](docs/setup/atlas-and-hosting.md), and the
[Phase 1 security baseline](docs/security/phase-1-baseline.md).

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
