# Phase 4.3 booking API and lifecycle

Phase 4.3 exposes the Phase 4.1–4.2 booking foundation through authenticated
`/v1` HTTP routes and completes the operational booking lifecycle. It includes
the service catalogue, booking catalogue, availability, booking reads and
commands. Calendar screens, mobile booking experiences and offline mutation
queues remain Phase 4.4 work.

## HTTP surface

The generated OpenAPI document and `@zuridesk/api-client` are authoritative for
request and response shapes. The Phase 4.3 routes are:

- `GET|POST /v1/services` and `PATCH|DELETE /v1/services/:serviceId`;
- `GET /v1/locations/:locationId/booking-catalogue`;
- `POST /v1/booking-availability/query`;
- `GET|POST /v1/bookings` and `GET /v1/bookings/:bookingId`;
- `POST /v1/bookings/:bookingId/confirm|reschedule|start|complete|no-show|cancel`;
  and
- `POST /v1/bookings/:bookingId/lines/:lineOrder/start|complete|skip`.

Dates cross HTTP as offset ISO-8601 strings. Prices remain integer KES minor
units. Unsafe browser requests use the existing trusted-origin and CSRF
boundary. Availability is a read-only query even though its structured input is
sent with `POST`.

## Permissions and row rules

- Owners can administer services and operate bookings throughout their tenant.
- Managers can administer services, query availability and operate bookings at
  locations covered by a current location grant.
- Receptionists can read services, query availability and operate bookings at
  locations covered by a current location grant; they cannot mutate services.
- Stylists can read services and only read bookings containing their staff
  profile. Guest phone and email are masked in stylist responses. Stylists may
  start an assigned booking and start, complete or skip only their own lines.
  They cannot query availability or confirm, reschedule, cancel, mark no-show,
  or aggregate-complete a booking.

Live membership, role and grant state is re-read at the authorization and
transaction boundaries. Out-of-scope booking identifiers, including other
tenants' identifiers, resolve as not found rather than disclosing existence.

## Lifecycle invariants

The aggregate transitions are:

```text
pending --confirm--> confirmed --start--> in_progress --complete--> completed
   |                      |
   +--cancel------------> cancelled
                          +--cancel------------> cancelled
                          +--no-show-----------> no_show
```

Starting the aggregate also starts its first line. Later lines are processed in
order. A line may be started, completed, or skipped with a bounded reason; the
aggregate can complete only after every line is completed or skipped. Terminal
bookings cannot be mutated.

Every mutation requires an expected booking version and an idempotency key.
The transaction revalidates authorization and state, applies optimistic
versioning, writes through the command-only persistence path, and appends one
immutable event at the new version. Same-key/same-payload retries replay the
result; key reuse with a different payload conflicts.

## Persistence and verification

Phase 4.3 adds no collection shape or index, so migration `0003` remains the
current migration and no migration `0004` is required. Real-Mongo coverage
includes lifecycle order and terminal rules, role/location/staff authorization,
row-filtered reads, contact masking, cross-tenant isolation, custom and closed
schedules, advance windows, in-progress capacity, and deterministic DST
gap/fold behavior. Fastify route tests cover permission enforcement, HTTP
serialization and tenant-scoped service delegation.
