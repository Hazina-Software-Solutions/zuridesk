# Phase 4.4 booking experiences

Phase 4.4 is split internally so each client experience remains testable and
reviewable.

## Phase 4.4a: responsive web diary

The authenticated web workspace now opens a live daily diary. Owners see all
active tenant locations. Managers and receptionists see only locations covered
by their current grants. Stylists see assigned locations and only bookings that
contain one of their staff profiles.

The diary provides:

- location and local-date selection;
- chronological booking rows with operational status;
- booking detail and ordered service-line state;
- role-authorized confirm, start, line-complete, complete, no-show and cancel
  actions;
- service, staff and authoritative availability-slot selection; and
- confirmed appointment creation with visible empty, loading, error and
  conflict states.

Dates are queried as location-local dates and displayed in the location IANA
timezone. Creation uses an availability result's UTC instant rather than
converting a browser-local wall time. Every unsafe mutation supplies the web
CSRF token, expected booking version and a fresh idempotency key.

The layout collapses to one column below tablet width. Its compact density is
intentional for front-desk work, with one plum accent, 8/14-pixel radii and
motion limited to direct interaction feedback.

## Phase 4.4b: mobile and offline

The owner, manager, receptionist and stylist mobile agenda plus the bounded
offline mutation queue remain the next internal slice. The queue must preserve
idempotency keys, retry network failures, stop on authorization/version
conflicts, and show the user which booking needs reconciliation.
