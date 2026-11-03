# Phase 3 authentication operations

This runbook covers local and future pre-production operation. It does not
authorize a shared migration, provider configuration, deployment, or production
secret generation.

## Required configuration

Use distinct random key material for refresh, challenge, invitation, CSRF, and
subject-HMAC purposes. Configure an Ed25519 PKCS8 private key, an SPKI public-key
map, issuer, audience, and current key ID. Keep the previous public or HMAC key
in the relevant verification map during an overlap window; issue only with the
current version. Challenge rows retain the subject-HMAC key version used at
issue time, so that version must remain configured until every challenge issued
with it has expired or been consumed. Remove old verification material only
after every possible credential lifetime has elapsed or all affected
credentials have been revoked.

Never put populated values in Git. `.env.example` contains names and inert
placeholders only.

## Migration 0002

Before a future shared migration:

1. Take and verify the environment's approved backup/restore position.
2. Ensure one migrator only.
3. Run `pnpm db:migration:status`, then `pnpm db:migrate`.
4. Confirm `0002_add_auth_tenancy_rbac` is applied.
5. Confirm the partial unique `tenant_recipient_pending_unique` index exists.
6. Run an authenticated smoke test only with synthetic or explicitly approved
   test identities.

Migration 0002 is expand-only relative to Phase 2.2. It creates the auth,
session, history, challenge, rate-limit, directory, security-event, and audit
collections; backfills `ownerGuardVersion`; moves invitations to schema v2;
revokes expired pending invitations; builds the
active-membership directory; and then creates indexes. Its operations and
postflight are safe to rerun after interruption. It does not modify migration 0001.

The migration performs a read-only preflight before any mutation. It stops with
counts when an accepted legacy invitation lacks `acceptedByUserId`, or when
multiple unexpired pending invitations exist for one tenant/recipient. Operators
must resolve those records explicitly; the migration never guesses an accepting
user or silently revokes a live duplicate.

Readers must tolerate invitation schema v1 during the migration window. Phase 3
writers require migration 0002 and write schema v2. Rollback is a new forward
migration; do not edit either applied migration. Dropping auth collections or
indexes is destructive and is not an automated rollback.

## Incident actions

- Suspected refresh reuse: the family is revoked automatically; require sign-in.
- Password compromise: complete password reset, which revokes all sessions.
- Signing-key concern: introduce a new `kid`, issue with it, retain only the
  necessary verification overlap, and separately decide whether session-wide
  revocation is required.
- Delivery outage: keep the provider fail-closed. Do not enable capture outside
  development/test.
- Migration/index failure: stop rollout, inspect partial state, and rerun the
  idempotent migration only after diagnosing the exact failure.

Audit/security-event retention, production alerting, provider escalation,
host/proxy configuration, and recovery ownership remain `UNKNOWN`.
