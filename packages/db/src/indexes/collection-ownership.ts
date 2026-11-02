export type CollectionOwnership = "global" | "tenant";

export const collectionOwnership = {
  schema_migrations: "global",
  tenants: "global",
  users: "global",
  locations: "tenant",
  memberships: "tenant",
  invites: "tenant"
} as const satisfies Readonly<Record<string, CollectionOwnership>>;

export type OwnedCollectionName = keyof typeof collectionOwnership;

export function isOwnedCollectionName(value: string): value is OwnedCollectionName {
  return Object.hasOwn(collectionOwnership, value);
}
