# Phase 2.2 query-plan evidence

- **Verified:** 2026-11-02
- **Engine:** local MongoDB 8.0.12 replica set
- **Evidence:**
  `packages/db/src/repositories/identity-repositories.integration.test.ts`

The integration suite executes real `explain("executionStats")` calls without
forced hints. It inspects only `queryPlanner.winningPlan` (not rejected plans)
and asserts the winning plans contain the intended named indexes:

| Repository query            | Predicate and ordering                                                             | Winning index asserted     |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------- |
| Location list               | `tenantId`, `deletedAt`, `status`; sort `name`, `_id`                              | `tenant_location_list`     |
| Membership list             | `tenantId`, `deletedAt`, `status`; sort `createdAt` descending, `_id`              | `tenant_membership_list`   |
| Pending invite by recipient | `tenantId`, recipient kind/value, `status`; sort `createdAt`, `_id`; expiry filter | `tenant_recipient_pending` |
| Membership/user aggregation | tenant-scoped membership match and ordering before global user lookup              | `tenant_membership_list`   |

Scoped ID lookups use MongoDB's built-in `_id_` index and verify `tenantId` on
the selected row. The membership-with-user aggregation begins with the same
tenant/deletion/status match as the membership list, then joins the global
`users` collection only by `_id`; its isolation result is asserted with tenant A
and tenant B fixtures.

These assertions run on every real-Mongo integration execution, so query-plan
drift in the verified query shapes fails CI rather than leaving this document
as stale point-in-time output.
No claim is made about production Atlas performance until production topology
and representative data volumes exist.
