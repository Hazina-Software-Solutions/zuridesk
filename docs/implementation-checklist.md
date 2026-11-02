# ZuriDesk implementation checklist

- **Last verified:** 2026-11-02
- **Product status:** `PROPOSAL` — no production launch, customers, revenue, or
  production readiness is implied by this checklist.
- **Update rule:** Update this file in the same change that completes or changes
  an item.

## How to use this checklist

- `[x]` means the implementation exists in the repository and its current
  automated verification passes.
- `[ ]` means the item is not implemented. A design, scaffold, or interface by
  itself does not count as implementation.
- A phase is complete only when its code, migrations, indexes, tests, and runbook
  are complete.
- Production provisioning, publishing, pricing, and vendor commitments remain
  separate founder approval gates.

## Status at a glance

| Phase                        | Status                            | Current outcome                                                                                                                       |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation                | Complete for local/CI development | Monorepo, applications, API boundary, MongoDB connection, CI, environment and security baselines                                      |
| 2. Data layer                | In progress                       | Shared foundations plus tenant, location, user, membership and invite persistence are complete; later business domains remain pending |
| 3. Auth, tenancy and RBAC    | Not started                       | No sign-up, sessions, memberships API, invites or permission enforcement                                                              |
| 4. Bookings                  | Not started                       | No catalogue, availability engine, appointments or calendar screens                                                                   |
| 5. Staff and customers       | Not started                       | No staff/customer APIs or product screens                                                                                             |
| 6. Stock and POS             | Not started                       | No inventory ledger, checkout or sales reports                                                                                        |
| 7. Subscriptions and billing | Not started                       | No plan enforcement, subscription lifecycle or M-Pesa integration                                                                     |
| 8. Marketplace               | Not started                       | No public listings, search, orders or fulfilment workflow                                                                             |
| 9. Notifications and reports | Not started                       | No queue worker, SMS, WhatsApp, push notifications or business reports                                                                |
| 10. Hardening and release    | Not started                       | No production infrastructure, restore drill, monitoring or store release                                                              |

## Completed implementation slice

**Phase 2.2: tenant identity and locations** is implemented and verified.

- [x] Present the Phase 2.2 implementation plan, files, document shapes,
      indexes, migration and open questions for approval.
- [x] Add `tenants`, `locations`, `users`, `memberships`, and `invites` Mongoose
      schemas.
- [x] Add the first versioned business-schema migration and rollback note.
- [x] Add business-specific global and tenant-scoped repositories.
- [x] Add seed fixtures for two tenants and their memberships.
- [x] Prove tenant isolation across every tenant-owned repository operation.
- [x] Add TTL behavior for expired invites with its documented index-policy
      exception.
- [x] Capture `explain()` output for non-trivial lookup queries.
- [x] Document how to run, migrate, seed, and verify the slice.

The next persistence slice requires a separately approved scope; the remaining
Phase 2 domain collections below are not implied by Phase 2.2 completion.

## Phase 1 — Foundation

### Repository and tooling

- [x] Create the standalone `zuridesk` repository.
- [x] Configure pnpm workspaces and Turborepo.
- [x] Use strict TypeScript across applications and packages.
- [x] Configure Prettier and ESLint.
- [x] Add architecture-boundary validation.
- [x] Add tracked-secret and private-environment-file checks.
- [x] Pin Node.js and pnpm versions.

### Applications and shared packages

- [x] Scaffold the Next.js web application.
- [x] Scaffold the Expo React Native application.
- [x] Scaffold the standalone Fastify API under `/v1`.
- [x] Add API liveness and MongoDB readiness endpoints.
- [x] Generate OpenAPI and the shared typed API client.
- [x] Add shared environment-neutral contracts and ObjectId validation.
- [x] Add initial cross-platform design tokens.

### Local infrastructure and CI

- [x] Add a local MongoDB replica-set Compose service.
- [x] Add the Mongoose connection and transaction smoke tests.
- [x] Add root and public environment validation.
- [x] Provide a secret-free `.env.example`.
- [x] Add API and web Dockerfiles.
- [x] Run format, lint, typecheck, unit tests, integration tests, API drift checks,
      and builds in CI.
- [x] Pass `TEST_MONGODB_URI` through Turborepo so CI executes, rather than
      skips, the real MongoDB integration suite.
- [ ] Select the production application host and compatible Atlas region.
- [ ] Provision production infrastructure. This is a founder approval gate and
      belongs to Phase 10 release work.

## Phase 2 — Data layer

### Completed foundation

- [x] Define branded ObjectId strings at application boundaries.
- [x] Define integer KES minor-unit validation.
- [x] Define integer basis-point validation.
- [x] Define integer stock quantities and `each`, `ml`, and `g` base units.
- [x] Define E.164 phone and normalized email validation.
- [x] Define document schema-version validation.
- [x] Add immutable, runtime-marked `TrustedTenantContext` values.
- [x] Add a tenant-first index manifest policy.
- [x] Restrict tenant index exceptions to MongoDB `_id_` and documented
      single-field TTL indexes.
- [x] Add the `schema_migrations` tracking collection and unique migration ID
      index.
- [x] Add ordered, forward-only migration execution and status commands.
- [x] Detect duplicate IDs, missing applied definitions, and changed applied
      migration checksums.
- [x] Document migration recovery and the single-migrator deployment
      constraint.
- [x] Test migration idempotency, failure recording, checksum drift, and the
      index policy against a replica-set MongoDB.

### Models, indexes and migrations

- [x] `tenants`
- [x] `locations`
- [x] `users`
- [x] `memberships`
- [x] `invites` with a TTL expiry index
- [ ] `staff_profiles`
- [ ] `services`
- [ ] `customers`
- [ ] `bookings` with embedded service-line snapshots
- [ ] Internal staff-day booking lock collection
- [ ] `products`
- [ ] `suppliers`
- [ ] `stock_movements`
- [ ] `sales` with immutable line-item snapshots
- [ ] `marketplace_listings`
- [ ] `marketplace_orders` with immutable order-item snapshots
- [ ] Immutable `plans` and plan versions
- [ ] `subscriptions` with entitlement snapshots
- [ ] `payments`
- [ ] `audit_logs`
- [ ] `notifications`
- [x] Add `schemaVersion`, UTC timestamps and soft-delete fields where required
      for the Phase 2.2 collections.
- [x] Ensure every current tenant-owned index starts with `tenantId`, except approved
      TTL and built-in `_id_` indexes.
- [x] Add supporting indexes for every current repository query.
- [x] Capture and review `explain()` results for every current non-trivial query.

### Repository and test enforcement

- [x] Add business-specific tenant repositories that inject `tenantId` into
      every exposed Phase 2.2 operation.
- [ ] Add safe aggregation helpers covering `$lookup`, nested lookup pipelines,
      `$unionWith`, and `$graphLookup`.
- [x] Add separately named repositories for the current platform-global collections.
- [x] Centralize soft-delete filters and restoration rules for Phase 2.2.
- [x] Prevent model/query/database objects from escaping `packages/db`.
- [x] Add a boundary rule that rejects raw model imports outside approved database
      model and repository modules.
- [x] Add seed data for at least two tenants.
- [x] Add tenant-isolation contract tests for every current tenant-owned
      collection.
- [x] Prove tenant A cannot read, count, aggregate, update, archive, restore, or
      revoke tenant B's Phase 2.2 records.

## Phase 3 — Authentication, tenancy and RBAC

- [ ] Decide the first-release login methods: password, email OTP, phone OTP, or
      an explicitly approved combination.
- [ ] Add password hashing with Argon2 if passwords are enabled.
- [ ] Add OTP issue, verification, expiry and attempt limiting if OTP is enabled.
- [ ] Add short-lived access tokens and rotating refresh-token families.
- [ ] Add secure web token storage and Expo SecureStore mobile storage.
- [ ] Add sign-up that transactionally creates a tenant, default location, user,
      owner membership, and required baseline records.
- [ ] Add active-tenant selection for users with multiple memberships.
- [ ] Add staff invitation, acceptance, expiry, revocation and resend flows.
- [ ] Define the central `resource:action` permission map in `packages/shared`.
- [ ] Document the complete role-permission matrix.
- [ ] Add one automated test for every permission-matrix cell.
- [ ] Enforce permissions in API middleware and services.
- [ ] Add stylist self-only and other approved row-level access rules.
- [ ] Add separate platform-admin authentication and authorization boundaries.
- [ ] Rate-limit authentication and OTP endpoints.
- [ ] Audit role, membership and access-sensitive changes.
- [ ] Add endpoint-level cross-tenant isolation tests.

## Phase 4 — Bookings

- [ ] Implement service catalogue APIs.
- [ ] Implement location, staff schedule, leave, service-duration and existing
      booking availability calculations.
- [ ] Implement per-service-line staff assignment.
- [ ] Implement walk-in and pre-booked appointments.
- [ ] Implement `pending`, `confirmed`, `in_progress`, `completed`, `no_show`,
      and `cancelled` transitions with explicit transition rules.
- [ ] Implement staff-day locks and transactional overlap checks.
- [ ] Add concurrent booking tests proving double-booking is impossible.
- [ ] Add web calendar and booking-management screens.
- [ ] Add owner, manager, receptionist and stylist mobile booking screens.
- [ ] Add an offline booking mutation queue, retry behavior and visible conflict
      resolution on mobile.
- [ ] Add booking API, RBAC, row-level and tenant-isolation tests.

## Phase 5 — Staff and customers

### Staff

- [ ] Implement staff profiles and employment state.
- [ ] Implement working hours and schedule overrides.
- [ ] Implement leave and time-off workflows.
- [ ] Assign services and skill-specific duration/price overrides where
      approved.
- [ ] Implement commission rules and immutable commission calculation inputs.
- [ ] Restrict stylists to their own approved data views.
- [ ] Add web and mobile staff-management screens.

### Customers

- [ ] Implement customer profiles with non-unique normalized contact lookups.
- [ ] Implement visit history.
- [ ] Implement private salon notes with RBAC restrictions.
- [ ] Define and implement the first basic loyalty rules.
- [ ] Record necessary marketing and communication consent evidence.
- [ ] Add customer export and deletion-request workflows.
- [ ] Add web and mobile customer-management screens.
- [ ] Add API, RBAC, tenant-isolation and privacy-workflow tests.

## Phase 6 — Stock and point of sale

- [ ] Implement products and integer base-unit quantities.
- [ ] Implement suppliers and purchase/restock references.
- [ ] Implement the append-only stock-movement ledger.
- [ ] Implement stock-in, stock-out and adjustment workflows.
- [ ] Require reasons and audit entries for manual adjustments.
- [ ] Implement low-stock thresholds and alert candidates.
- [ ] Implement checkout containing services and retail products.
- [ ] Store immutable names, prices, taxes/discounts and quantities on sale
      lines.
- [ ] Atomically decrement stock only when sufficient balance exists.
- [ ] Commit stock movements and the sale in the same transaction.
- [ ] Prove with concurrency tests that stock cannot become negative.
- [ ] Implement receipts, voids and approved refund behavior.
- [ ] Implement web and mobile POS screens.
- [ ] Add offline POS queueing, idempotency keys and visible sync conflicts.
- [ ] Implement stock and sales reports with indexed queries and `explain()`
      evidence.

## Phase 7 — Subscriptions and M-Pesa billing

- [ ] Define Starter, Growth and Pro limits and feature flags. Pricing and exact
      limits require founder approval.
- [ ] Implement immutable plan versions.
- [ ] Implement subscription entitlement snapshots.
- [ ] Implement `trial`, `active`, `past_due` and `suspended` transitions.
- [ ] Implement grace-period rules.
- [ ] Enforce feature access and limits on the server.
- [ ] Add a payment-provider interface.
- [ ] Implement M-Pesa Daraja STK Push behind the provider interface.
- [ ] Verify callbacks according to the provider contract.
- [ ] Add idempotent payment webhook processing and replay tests.
- [ ] Reconcile pending payments and unmatched callbacks.
- [ ] Rate-limit payment initiation and callback endpoints appropriately.
- [ ] Audit refunds, plan changes and subscription overrides.
- [ ] Add owner billing screens and platform-admin billing controls.
- [ ] Add sandbox integration tests; no real-money test is automated without a
      separate human approval gate.

## Phase 8 — Marketplace

- [ ] Implement tenant-controlled product and service listings.
- [ ] Enforce plan and tenant-publication gates server-side.
- [ ] Configure Atlas Search indexes for approved public fields.
- [ ] Implement public browse, search, filter and listing-detail APIs.
- [ ] Build the responsive public storefront.
- [ ] Implement customer carts or the approved direct-order flow.
- [ ] Implement marketplace orders and immutable item snapshots.
- [ ] Implement customer payment through the payment-provider interface.
- [ ] Implement tenant fulfilment states and controls.
- [ ] Prevent unpublished, deleted, suspended or cross-tenant data from leaking.
- [ ] Add marketplace search, order, payment-idempotency and tenant-isolation
      tests.

## Phase 9 — Notifications and reports

- [ ] Add the owned notification-provider interface.
- [ ] Select and configure the production SMS provider.
- [ ] Implement Africa's Talking SMS if it remains the approved provider.
- [ ] Implement WhatsApp through the Meta Cloud API if approved.
- [ ] Implement Expo push notifications for staff.
- [ ] Provision managed Redis only when the first BullMQ worker is introduced.
- [ ] Implement idempotent booking confirmation and reminder jobs.
- [ ] Implement low-stock alert jobs.
- [ ] Implement subscription expiry and grace-period jobs.
- [ ] Add retry, backoff, dead-letter and delivery-status handling.
- [ ] Enforce consent, channel preferences and applicable opt-out behavior.
- [ ] Implement operational, booking, staff, stock, sales and subscription
      reports permitted by each plan.
- [ ] Add indexes and `explain()` evidence for report queries.
- [ ] Add job retry, duplicate-delivery and provider-failure tests.

## Phase 10 — Hardening and release preparation

### Security and privacy

- [ ] Complete a tenant-isolation test inventory for every collection and
      endpoint.
- [ ] Complete the RBAC matrix and row-level-rule test inventory.
- [ ] Review audit coverage for roles, stock, refunds, billing and platform
      changes.
- [ ] Complete rate-limit coverage for auth, OTP, payments and abuse-prone public
      endpoints.
- [ ] Add security headers, dependency review and vulnerability-response
      procedures.
- [ ] Complete data minimization, retention, consent, export and deletion
      workflows.
- [ ] Obtain qualified Kenyan legal review before making compliance claims.

### Reliability and Atlas operations

- [ ] Select the application host and MongoDB Atlas provider/region deliberately.
- [ ] Provision a dedicated production Atlas replica-set tier.
- [ ] Configure continuous backups and tested retention settings.
- [ ] Create least-privilege database users.
- [ ] Configure an IP access list or private networking; never use `0.0.0.0/0`
      in production.
- [ ] Run and document a backup restore drill.
- [ ] Configure Atlas alerts and review Performance Advisor findings.
- [ ] Add application error tracking, structured logs, metrics and alerting.
- [ ] Load-test booking, availability, POS, payment callbacks and marketplace
      search.
- [ ] Verify migration compatibility and recovery in a production-like staging
      environment.

### Product quality and release

- [ ] Complete responsive and accessibility testing for the web application.
- [ ] Test web and mobile behavior on slow and intermittent networks.
- [ ] Test mobile performance on representative mid-range Android devices.
- [ ] Complete offline booking and POS conflict-recovery testing.
- [ ] Complete Expo/EAS build, signing, privacy and store-listing preparation.
- [ ] Complete web deployment, domain, TLS and operational runbooks.
- [ ] Define launch support and incident-response ownership.
- [ ] Obtain founder approval before production deployment or publishing.

## Decisions still required

- [ ] First-release authentication methods.
- [ ] Plan pricing, limits, trial duration and grace period.
- [ ] Production application host and Atlas provider/region.
- [ ] Production Redis provider when queue work begins.
- [ ] SMS and WhatsApp provider rollout and approved message templates.
- [ ] Data retention periods and legally reviewed consent wording.
- [ ] Refund, void, tax and receipt rules.
- [ ] Marketplace customer payment and fulfilment rules.
- [ ] Launch date and release scope.
