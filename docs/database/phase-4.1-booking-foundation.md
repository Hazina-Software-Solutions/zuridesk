# Phase 4.1 booking domain foundation

Phase 4.1 adds persistence and tenant-safe repositories for ZuriDesk's dynamic
booking rules. It does not calculate availability, confirm capacity, expose an
HTTP API, or add user interfaces. Those remain Phase 4.2 through 4.4 work.

## Calendar representation

- Locations use their existing IANA timezone and effective-dated weekly
  schedule versions. Each weekday contains zero or more non-overlapping,
  half-open minute intervals. An empty interval list means closed.
- Calendar date overrides replace a recurring day. Editing is append-only: a
  transaction first acquires the observed schedule-guard version, validates the
  schedule version effective on that local date, archives only the observed
  live row, and inserts one immutable replacement. Successors, replacements and
  archives sharing the scope admit one race winner. Overnight work is
  represented on both local dates rather than by an interval that crosses
  midnight.
- Staff profiles start with `scheduleMode=unconfigured`, so availability fails
  closed. A profile must explicitly inherit location hours or use a custom
  schedule. Custom schedules cannot independently reopen a location; that
  intersection belongs to the Phase 4.2 engine.
- Authorized unavailability is stored as UTC instants. No generated slot rows or
  invented opening hours are persisted.

Authorization location grants, staff work-location assignments, and service
eligibility are separate collections. A grant does not imply a work assignment,
and a work assignment does not imply that a staff member may perform a service.
Phase 4.3 will enforce the accepted role and row-level rules at the API/service
boundary while rechecking live membership.

## Booking and concurrency records

The booking schema supports pending, confirmed, in-progress, completed, no-show
and cancelled aggregates. Ordered line snapshots preserve service/staff IDs,
names, duration, buffers, quoted integer KES price and execution state, including
authoritatively skipped lines. Guest and commercial snapshots are immutable;
current execution and scheduled-time fields are reserved for future explicit
commands. All generic booking update, document-save, bulk-save, replacement,
bulk-mutation and hard-delete paths fail closed in Phase 4.1. `customerId` must
remain `null` until Phase 5 owns customer identity.
Booking events use a strict event/transition/reason vocabulary and form an
append-only timeline. Model middleware blocks event update, replacement, bulk
mutation and hard deletion paths.

Phase 4.1 also reserves the storage contracts required by Phase 4.2:

- schedule guards per location or staff profile;
- canonical tenant/staff/UTC-day locks acquired for every UTC day crossed by a
  buffered occupancy range; and
- request-hash/idempotency receipts scoped by tenant, actor and operation.

Weekly schedule changes are the one authoritative Phase 4.1 persistence
command: a transaction writes the schedule guard, closes the current open-ended
version, and inserts one open-ended successor. Concurrent successors resolve to
one winner and a deterministic conflict. Mutation receipts atomically distinguish
first claim, same-hash replay and different-hash conflict.

These records do not themselves prevent booking overlap. Confirmation,
rescheduling, booking snapshot derivation, lock ordering and schedule-version
checks belong to Phase 4.2. Phase 4.1 exposes booking reads/counts only; it does
not accept client-supplied guest, staff, price or service snapshots.

## Migration 0003

`0003_add_booking_domain_foundation` performs a read-only preflight, creates 14
empty tenant-owned collections and their tenant-prefixed indexes, then verifies
all collection and index definitions/options. It deliberately performs no
backfill: existing Phase 3
data cannot safely imply staff projections, eligibility, hours, guests, prices
or bookings. Any pre-existing row in a Phase 4.1 collection fails preflight
before collection or index mutation because there is no legitimate legacy
source for these records.

The migration is additive and compatible with Phase 3 application instances,
which ignore the new collections. Run exactly one migrator before deploying an
application that requires Phase 4.1. Shared migration execution remains an
approval-gated operation.

### Recovery and rollback

The migration is idempotent and can be rerun after a partial collection/index
creation failure. Diagnose invalid pre-existing data rather than fabricating a
tenant owner. Once recorded, never edit migration 0003; repair it with a new
forward migration.

Before production use, rollback is simply application rollback because the new
empty/additive collections are ignored by Phase 3. After Phase 4 data exists,
do not drop the collections. Roll application code back while retaining data,
then use an reviewed forward migration for any schema repair. No Phase 4.1
collection has a TTL because booking/guest/audit retention is still unknown.

## Evidence

Real replica-set integration tests cover migration preflight and rerun behavior,
tenant-scoped configuration create/read/update/archive/count operations,
booking read/count/aggregate isolation, schedule-successor and receipt races,
canonical UTC-day locks, forged cross-tenant identifiers, detached DTOs and
actual winning plans, including the booking status/list repository query.
