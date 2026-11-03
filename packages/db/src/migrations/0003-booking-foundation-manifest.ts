import type { ApplicationIndexDefinition } from "../indexes/index-policy";

export const phase41CollectionNames = [
  "services",
  "staff_booking_profiles",
  "location_access_grants",
  "staff_location_assignments",
  "staff_service_eligibility",
  "service_location_offerings",
  "weekly_schedule_versions",
  "calendar_date_overrides",
  "staff_unavailability",
  "bookings",
  "booking_events",
  "schedule_guards",
  "staff_day_locks",
  "mutation_receipts"
] as const;

const phase41SystemIndexManifest = phase41CollectionNames.map((collection) => ({
  collection,
  name: "_id_",
  tenantOwned: true,
  kind: "system" as const,
  keys: [["_id", 1]] as const,
  exception: "mongodb_builtin_id" as const
}));

export const phase41IndexManifest = [
  ...phase41SystemIndexManifest,
  query("services", "tenant_status_name", [
    ["status", 1],
    ["name", 1],
    ["_id", 1]
  ]),
  unique("staff_booking_profiles", "tenant_membership_unique", [["membershipId", 1]]),
  query("staff_booking_profiles", "tenant_staff_status", [
    ["status", 1],
    ["displayName", 1]
  ]),
  unique("location_access_grants", "tenant_target_location_unique", [
    ["targetMembershipId", 1],
    ["locationId", 1]
  ]),
  query("location_access_grants", "tenant_location_active_grants", [
    ["locationId", 1],
    ["status", 1],
    ["targetMembershipId", 1]
  ]),
  unique("staff_location_assignments", "tenant_staff_location_unique", [
    ["staffProfileId", 1],
    ["locationId", 1]
  ]),
  query("staff_location_assignments", "tenant_location_active_staff", [
    ["locationId", 1],
    ["status", 1],
    ["staffProfileId", 1]
  ]),
  unique("staff_service_eligibility", "tenant_staff_service_unique", [
    ["staffProfileId", 1],
    ["serviceId", 1]
  ]),
  query("staff_service_eligibility", "tenant_service_active_staff", [
    ["serviceId", 1],
    ["status", 1],
    ["staffProfileId", 1]
  ]),
  unique("service_location_offerings", "tenant_location_service_unique", [
    ["locationId", 1],
    ["serviceId", 1]
  ]),
  query("service_location_offerings", "tenant_location_active_offerings", [
    ["locationId", 1],
    ["status", 1],
    ["serviceId", 1]
  ]),
  {
    ...unique("weekly_schedule_versions", "tenant_schedule_effective_unique", [
      ["ownerType", 1],
      ["ownerId", 1],
      ["effectiveFrom", 1]
    ]),
    partialFilterExpression: { archivedAt: null }
  },
  {
    ...unique("weekly_schedule_versions", "tenant_schedule_open_unique", [
      ["ownerType", 1],
      ["ownerId", 1]
    ]),
    partialFilterExpression: { archivedAt: null, effectiveTo: null }
  },
  query("weekly_schedule_versions", "tenant_schedule_effective_lookup", [
    ["ownerType", 1],
    ["ownerId", 1],
    ["effectiveFrom", -1],
    ["effectiveTo", 1]
  ]),
  {
    ...unique("calendar_date_overrides", "tenant_override_date_unique", [
      ["ownerType", 1],
      ["ownerId", 1],
      ["localDate", 1]
    ]),
    partialFilterExpression: { archivedAt: null }
  },
  query("staff_unavailability", "tenant_staff_unavailability_range", [
    ["staffProfileId", 1],
    ["startsAt", 1],
    ["endsAt", 1]
  ]),
  query("bookings", "tenant_location_day_calendar", [
    ["locationId", 1],
    ["localDate", 1],
    ["status", 1],
    ["startsAt", 1],
    ["_id", 1]
  ]),
  query("bookings", "tenant_booking_status_live", [
    ["status", 1],
    ["deletedAt", 1],
    ["startsAt", 1],
    ["_id", 1]
  ]),
  query("bookings", "tenant_staff_utc_conflicts", [
    ["lines.assignedStaffProfileId", 1],
    ["status", 1],
    ["startsAt", 1],
    ["endsAt", 1]
  ]),
  unique("booking_events", "tenant_booking_event_sequence_unique", [
    ["bookingId", 1],
    ["sequence", 1]
  ]),
  unique("schedule_guards", "tenant_schedule_guard_unique", [
    ["scopeType", 1],
    ["scopeId", 1]
  ]),
  unique("staff_day_locks", "tenant_staff_day_lock_unique", [
    ["staffProfileId", 1],
    ["utcDate", 1]
  ]),
  unique("mutation_receipts", "tenant_actor_operation_key_unique", [
    ["actorUserId", 1],
    ["operation", 1],
    ["idempotencyKey", 1]
  ]),
  query("mutation_receipts", "tenant_receipt_created", [
    ["createdAt", -1],
    ["_id", 1]
  ])
] as const satisfies readonly ApplicationIndexDefinition[];

type TailKey = readonly [string, 1 | -1];
function query(collection: string, name: string, tail: readonly TailKey[]) {
  return {
    collection,
    name,
    tenantOwned: true,
    kind: "query" as const,
    keys: [["tenantId", 1] as const, ...tail]
  };
}
function unique(collection: string, name: string, tail: readonly TailKey[]) {
  return { ...query(collection, name, tail), kind: "unique" as const };
}

export const phase41DocumentShape = {
  services: ["tenantId", "name", "description", "status", "archivedAt"],
  staffProfiles: ["tenantId", "membershipId", "displayName", "scheduleMode", "status"],
  authorizationGrants: ["tenantId", "targetMembershipId", "locationId", "grantedByUserId"],
  workAssignments: ["tenantId", "staffProfileId", "locationId", "status"],
  eligibility: ["tenantId", "staffProfileId", "serviceId", "status"],
  offerings: ["durationMinutes", "buffers", "quotedPriceMinor", "bookingWindow", "grid"],
  schedules: ["ownerType", "ownerId", "timezone", "effectiveDates", "week"],
  overrides: ["ownerType", "ownerId", "timezone", "localDate", "intervals"],
  unavailability: ["staffProfileId", "utcRange", "reasonCode", "authorizedByUserId"],
  bookings: [
    "immutableGuestAndCommercialSnapshots",
    "orderedLines",
    "status",
    "version",
    "utcRange"
  ],
  events: ["bookingId", "sequence", "actor", "reason", "statusChange", "version"],
  concurrency: ["scheduleGuards", "staffUtcDayLocks", "mutationReceipts"]
} as const;
