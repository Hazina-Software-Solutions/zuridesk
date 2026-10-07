# ZuriDesk

ZuriDesk is a proposed multi-tenant operating system for African beauty businesses, launching in Kenya with Nairobi as the initial market.

This repository contains the Phase 1 engineering foundation and the first
Phase 2 data-foundation slice. It does not yet contain business collections,
customer data, or a production deployment.

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
```

The current Phase 2 slice establishes shared persistence primitives, trusted
tenant context, versioned migration tooling, and executable index policy. The
business models and repositories arrive in subsequent reviewable changes.
