import { describe, expect, it } from "vitest";

import {
  ACTIONS,
  RESOURCES,
  ROLE_KEYS,
  ROLE_PERMISSIONS,
  hasPermission,
  mayManageTargetRoles,
  permissionsForRoles,
  type Permission,
  type RoleKey
} from "./permissions";

const expected: Readonly<Record<RoleKey, readonly Permission[]>> = ROLE_PERMISSIONS;

describe("permission matrix", () => {
  for (const role of ROLE_KEYS) {
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        const permission: Permission = `${resource}:${action}`;
        it(`${role} ${permission}`, () => {
          expect(hasPermission([role], permission)).toBe(expected[role].includes(permission));
        });
      }
    }
  }

  it("unions permissions for multiple roles", () => {
    const permissions = permissionsForRoles(["stylist", "manager"]);
    expect(permissions.has("location:create")).toBe(true);
    expect(permissions.has("profile:self")).toBe(true);
  });

  it.each(["receptionist", "stylist"] as const)(
    "%s can read only its own membership scope",
    (role) => {
      expect(hasPermission([role], "membership:self")).toBe(true);
      expect(hasPermission([role], "membership:read")).toBe(false);
    }
  );

  it("keeps booking operations broad for front desk and row-scoped for stylists", () => {
    expect(hasPermission(["receptionist"], "booking:create")).toBe(true);
    expect(hasPermission(["receptionist"], "booking:update")).toBe(true);
    expect(hasPermission(["stylist"], "booking:self")).toBe(true);
    expect(hasPermission(["stylist"], "booking:read")).toBe(false);
    expect(hasPermission(["stylist"], "availability:read")).toBe(false);
  });

  it.each([
    [["manager"], ["receptionist"], true],
    [["manager"], ["stylist"], true],
    [["manager"], ["receptionist", "stylist"], true],
    [["manager"], ["manager"], false],
    [["manager"], ["owner"], false],
    [["receptionist"], ["stylist"], false],
    [["owner"], ["owner"], true]
  ] as const)("applies target-role ceilings to %j -> %j", (actor, target, allowed) => {
    expect(mayManageTargetRoles(actor, target)).toBe(allowed);
  });
});
