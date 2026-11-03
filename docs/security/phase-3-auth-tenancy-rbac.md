# Phase 3 authentication, tenancy, and RBAC

Phase 3 implements the founder-approved local authentication baseline. This is
an implementation record, not a production-readiness or compliance claim.
Production infrastructure, email delivery, host/proxy topology, secret
provisioning, retention, and legal review remain `UNKNOWN`.

## Implemented behavior

- Email/password identities are globally unique by normalized email. User
  profile email and phone fields remain optional profile attributes.
- Passwords use Argon2id with 64 MiB memory, three passes, parallelism one, and
  a 12–128 character / 256 UTF-8 byte input limit. Unknown-user sign-in performs
  a dummy verification; valid older profiles are rehashed on sign-in.
- Owner signup is a two-stage, 30-minute email challenge. Completion creates
  the identity, user, tenant, location, owner membership, directory projection,
  and tenant audit entry in one transaction.
- Challenge rows contain a unique public ID, purpose/version, retained subject
  HMAC key version, subject HMAC, token digest, expiry, and a
  maximum-five-failure lifecycle. They never store the raw email. Completion
  resubmits the normalized email and recomputes the subject HMAC with the
  challenge's retained configured key version before Argon2 work begins, so
  current-key rotation does not invalidate live challenges during overlap.
- Password reset challenges last 15 minutes and revoke every active session on
  successful consumption.
- Access tokens are Ed25519/EdDSA JWTs lasting ten minutes. Verification fixes
  the algorithm, issuer, audience, key ID, claim shape, and lifetime.
- Opaque refresh tokens rotate on every use. Sessions expire after 30 idle days
  or 90 absolute days. Reuse revokes the family. Refresh, challenge,
  invitation, CSRF, and subject digests use separate purpose-bound key rings
  with versioned verification overlap.
- Invitations are email-only, expire after seven days, and store only a token
  digest. The token public ID is the invitation ObjectId, so validation uses
  indexed `_id` plus digest lookup before any password hashing. Resend revokes
  only the pending credential observed at command start; a concurrent loser
  becomes a stable conflict rather than replacing another writer's invite. Existing active
  membership is a conflict. Runtime issuance first revokes an expired pending
  record so the partial unique pending-recipient index can be satisfied.
- The global user/tenant directory is candidate discovery only. Every tenant
  request rechecks the active session, user, tenant, and tenant-owned
  membership.
- Receptionist and stylist membership scope is `membership:self`; it does not
  grant arbitrary membership reads.
- The closed permission matrix lives in `packages/shared/src/auth/permissions.ts`.
  Role unions do not bypass manager target-role ceilings. Competing final-owner
  mutations serialize through `tenants.ownerGuardVersion`.
- No platform-administration endpoints exist. Tenant ownership grants no
  platform authority.

## Transport rules

Web access tokens use `__Host-zd_at` (`Path=/`) and refresh tokens use
`__Secure-zd_rt` (`Path=/v1/auth`). Both are `Secure`, `HttpOnly`,
`SameSite=Lax`, and have no `Domain`. A non-credential `__Host-zd_csrf` cookie
allows startup refresh without local/session storage; unsafe authenticated web
requests require its session-bound value and an exact allowlisted `Origin`.
An allowlisted `Origin` is always treated as web transport, while requests with
no `Origin` must use mobile transport. A refresh cookie always selects the web
CSRF path, even if a body refresh token is also supplied. Refresh rotation also
atomically matches the session's immutable transport; presenting an otherwise
valid token through the other transport neither rotates nor revokes its family.

Mobile access tokens exist only in memory. The refresh token is stored through
Expo SecureStore with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Refresh is coalesced;
network failure preserves the credential, while terminal authentication failure
and logout clear it. A linked invitation is attempted automatically at most
once after session restoration or sign-in; failure exposes deliberate retry and
sign-out actions rather than creating an effect-driven retry loop.

Email secrets are placed only in URL fragments. A GET is inert: only a POST
body consumes the credential. Web moves the fragment credential into memory
and scrubs it from browser history immediately. Signed-in users accept matching
invitations with the current CSRF/bearer session and no new password or display
name; signed-out users can sign in and resume. Request/response validation uses Zod and the
generated OpenAPI client.

## Delivery and logging

`AUTH_DELIVERY_MODE=capture` is accepted only in explicit development/test
environments. The default `unconfigured` provider fails before challenge or
invitation persistence. Capture is forbidden in production. No approved
production provider has been selected.

Logs redact authorization, cookies, passwords, tokens, OTP-like fields, and
database URIs. API errors are generic and include a request ID. Global security
events and tenant audit logs have no TTL because retention remains `UNKNOWN`.

## Current UX boundary

Web and Expo include functional sign-in, owner signup, reset, invitation,
startup refresh, tenant chooser, and protected-shell flows. Universal-link/app
association and representative-device E2E testing are not complete because the
production host and mobile release topology are `UNKNOWN`; the mobile shell
also permits explicit token entry as a recovery path.
