# Database index policy

Every application-defined index on a tenant-owned collection starts with
`tenantId`. This keeps common query plans aligned with the mandatory tenant
predicate and makes an omitted tenant dimension visible during review.

There are exactly two exceptions:

1. MongoDB's built-in `_id_` index.
2. A required TTL index. MongoDB TTL indexes are single-field indexes, so a TTL
   expiry field cannot be combined with `tenantId`. Each tenant TTL exception
   must be named and include an explicit reason in the index manifest.

The executable policy lives in
`packages/db/src/indexes/index-policy.ts`. Every model change must add its index
definitions to the manifest and exercise the policy test. Duplicate index names,
compound TTL definitions, missing expiry settings, and unapproved tenant-prefix
exceptions fail validation.

The policy is an architectural guardrail, not a substitute for repository
scoping. MongoDB does not provide row-level security; tenant repositories must
still inject `tenantId` into every operation.

References:

- [MongoDB TTL indexes](https://www.mongodb.com/docs/manual/core/index-ttl/)
- [MongoDB index creation](https://www.mongodb.com/docs/manual/reference/method/db.collection.createIndex/)

Phase 4.1 query/index mappings and winning-plan evidence are described in
[Phase 4.1 booking domain foundation](phase-4.1-booking-foundation.md). Schedule
versions and date overrides use tenant-prefixed partial unique indexes over live
records so archived history cannot block a deliberate replacement. Booking
status reads use the `tenantId,status,deletedAt` prefix, and staff lock identity
uses canonical `tenantId,staffProfileId,utcDate` keys.
