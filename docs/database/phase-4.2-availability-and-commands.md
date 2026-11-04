# Phase 4.2 availability and booking commands

Phase 4.2 is a database/domain slice. It computes availability and exposes four
narrow typed operations from `@zuridesk/db`: `queryBookingAvailability`,
`createBooking`, `confirmBooking`, and `rescheduleBooking`. It does not add HTTP
routes, OpenAPI/client contracts, setup APIs, screens, offline storage, payments,
stock, or customer records. Those boundaries remain with Phases 4.3–4.4 and
later domains.

## Deterministic availability

Availability is calculated on demand for one active location, one local date,
and an ordered list of exact service/staff selections. No generated slot rows
are persisted.

The engine:

- resolves one effective location schedule; a date override replaces the
  recurring weekday;
- fails closed for missing schedules and `unconfigured` staff;
- uses location hours for `inherit_location`, and intersects custom staff hours
  with location hours;
- validates active services, location offerings, staff profiles, live
  memberships, work assignments, and service eligibility;
- subtracts authorized unavailability and the exact buffered line occupancy of
  all confirmed or in-progress bookings across locations;
- treats ranges as half-open, so touching buffered ranges are allowed;
- applies the first offering's grid to the first treatment start, then derives
  ordered later lines without overlapping buffered occupancy; and
- applies each line's advance window and returns stable chronological UTC
  aggregate/line ranges, evaluation time, timezone, guard evidence, and bounded
  non-sensitive reasons.

`@js-temporal/polyfill` is pinned for timezone conversion. A nonexistent wall
time in a daylight-saving gap is rejected. A repeated wall time uses the
earlier occurrence consistently. Nairobi and DST gap/fold conversion behavior
has both direct pure-function and command-level acceptance coverage.

## Authoritative commands

Callers supply identity and intent only. Duration, buffers, service name, quoted
integer KES minor-unit price, line ends, aggregate ranges, timezone, and local
date are derived from current records. `customerId` remains `null`.

- Appointment creation requires an explicit treatment start and named guest.
  Appointment creation and rescheduling require the first treatment start to
  be on the configured offering grid.
- Walk-in creation derives the treatment start from one captured server clock.
  It may use the anonymous label and bypasses only the advance window and the
  first-line grid; later lines always round forward to a grid boundary.
- Creation defaults to confirmed; explicit pending creation validates current
  configuration and availability but does not acquire staff-day capacity locks
  and does not block later capacity.
- Confirmation accepts only pending bookings and revalidates both capacity and
  the immutable commercial snapshot. Configuration drift returns
  `CONFIGURATION_CHANGED`.
- Rescheduling accepts only pending or confirmed bookings, preserves status,
  guest and commercial snapshots, and requires an expected version, bounded
  reason, and idempotency key. Confirmed rescheduling locks the union of old and
  new occupancy. Pending rescheduling remains non-reserving. A reschedule also
  refreshes the booking timezone and local date from the current location.

The command layer re-resolves the actor's active tenant membership inside the
transaction. Owners are tenant-wide. Managers and receptionists require an
active location grant. Stylists cannot perform any of these Phase 4.2
operations, including availability queries.
Complete public permission vocabulary, row filtering, contact masking, and the
remaining lifecycle commands belong to Phase 4.3.

## Concurrency and idempotency

Each capacity command uses one replica-set transaction:

1. Claim or replay the tenant/actor/operation/idempotency receipt using a
   canonical request hash.
2. Acquire sorted location/staff schedule guards with observed-version CAS.
3. For reserving mutations, acquire sorted, deduplicated staff/UTC-day locks for
   every day crossed by old and new buffered ranges.
4. Re-read membership, configuration, schedule, booking version, and exact
   cross-location occupancy.
5. Validate the complete Mongoose booking document, use the private
   command-only raw persistence path, append one immutable event whose sequence
   matches the new booking version, and complete the receipt.

Generic booking update/save/bulk/replace/delete paths remain blocked. Business
conflicts do not leave a booking or event behind. A completed same-hash request
replays the booking; a reused key with a different hash conflicts. Transaction
retries are bounded to transient write/duplicate races.

All currently reachable availability-affecting configuration mutations now
participate in the same guard system: schedules/overrides, staff schedule mode
and archive, assignments, eligibility, offerings, service archive/name,
unavailability, and location timezone/status/archive/restore.
Booking commands, offering changes and eligibility changes also serialize on
their authoritative service records, closing the first-dependent-record race
without a new persisted guard shape or index.

## Persistence and operations

Phase 4.2 adds no persisted shape or index. Migration `0003` is unchanged and
no migration `0004` is required. The actual blocking query continues to win the
existing `tenant_staff_utc_conflicts` index in real MongoDB evidence.

Run a replica-set MongoDB and execute the normal root verification commands.
The integration suite directly covers tenant isolation; owner, granted-manager
and denied-manager/stylist availability; authoritative snapshots; pending
non-blocking and exact-line confirmation; override/unavailability subtraction;
same/different staff sequences; walk-ins with sub-minute server time; strict
appointment grids; cross-midnight UTC-day locks; same-key replay and
different-hash conflict; stale versions and events; deterministic configuration
races; eight-way and cross-location booking races; reschedule old/new lock
unions and timezone refresh; and winning-plan evidence.

Custom staff schedules, explicit unconfigured/closed/effective-version command
cases, advance-window rejection, `in_progress` blocking, and command-level DST
dates now have direct end-to-end command tests in Phase 4.3.

Shared migration execution, deployment, and Phase 4.4 offline/UI work remain
separate approval gates. See
[Phase 4.3 booking API and lifecycle](phase-4.3-booking-api-and-lifecycle.md)
for the public routes and completed lifecycle.
