export type CollectionOwnership = "global" | "tenant";

export const collectionOwnership = {
  schema_migrations: "global",
  tenants: "global",
  users: "global",
  locations: "tenant",
  memberships: "tenant",
  invites: "tenant",
  auth_identities: "global",
  auth_sessions: "global",
  refresh_token_history: "global",
  auth_challenges: "global",
  rate_limit_buckets: "global",
  user_tenant_directory: "global",
  security_events: "global",
  tenant_audit_logs: "tenant",
  services: "tenant",
  staff_booking_profiles: "tenant",
  location_access_grants: "tenant",
  staff_location_assignments: "tenant",
  staff_service_eligibility: "tenant",
  service_location_offerings: "tenant",
  weekly_schedule_versions: "tenant",
  calendar_date_overrides: "tenant",
  staff_unavailability: "tenant",
  bookings: "tenant",
  booking_events: "tenant",
  schedule_guards: "tenant",
  staff_day_locks: "tenant",
  mutation_receipts: "tenant"
} as const satisfies Readonly<Record<string, CollectionOwnership>>;

export type OwnedCollectionName = keyof typeof collectionOwnership;

export function isOwnedCollectionName(value: string): value is OwnedCollectionName {
  return Object.hasOwn(collectionOwnership, value);
}
