export const ROLE_KEYS = ["owner", "manager", "receptionist", "stylist"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const RESOURCES = [
  "tenant",
  "location",
  "membership",
  "invite",
  "profile",
  "session"
] as const;
export type Resource = (typeof RESOURCES)[number];

export const ACTIONS = ["read", "create", "update", "suspend", "revoke", "self"] as const;
export type Action = (typeof ACTIONS)[number];
export type Permission = `${Resource}:${Action}`;

const all = (resource: Resource, actions: readonly Action[]): readonly Permission[] =>
  actions.map((action) => `${resource}:${action}` as const);

export const ROLE_PERMISSIONS = {
  owner: [
    ...all("tenant", ["read", "update"]),
    ...all("location", ["read", "create", "update", "suspend"]),
    ...all("membership", ["read", "create", "update", "suspend", "revoke"]),
    ...all("invite", ["read", "create", "revoke"]),
    "profile:self",
    "session:self"
  ],
  manager: [
    "tenant:read",
    ...all("location", ["read", "create", "update", "suspend"]),
    ...all("membership", ["read", "create", "update", "suspend", "revoke"]),
    ...all("invite", ["read", "create", "revoke"]),
    "profile:self",
    "session:self"
  ],
  receptionist: ["tenant:read", "location:read", "membership:self", "profile:self", "session:self"],
  stylist: ["tenant:read", "location:read", "membership:self", "profile:self", "session:self"]
} as const satisfies Readonly<Record<RoleKey, readonly Permission[]>>;

export const MANAGER_ASSIGNABLE_ROLES = ["receptionist", "stylist"] as const;

export function permissionsForRoles(roleKeys: readonly RoleKey[]): ReadonlySet<Permission> {
  return new Set(roleKeys.flatMap((role) => ROLE_PERMISSIONS[role]));
}

export function hasPermission(roleKeys: readonly RoleKey[], permission: Permission): boolean {
  return permissionsForRoles(roleKeys).has(permission);
}

export function mayManageTargetRoles(
  actorRoles: readonly RoleKey[],
  targetRoles: readonly RoleKey[]
): boolean {
  if (actorRoles.includes("owner")) return true;
  if (!actorRoles.includes("manager")) return false;
  return targetRoles.every((role) =>
    (MANAGER_ASSIGNABLE_ROLES as readonly RoleKey[]).includes(role)
  );
}
