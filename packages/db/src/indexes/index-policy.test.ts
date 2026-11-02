import { describe, expect, it } from "vitest";

import {
  assertValidIndexManifest,
  IndexPolicyError,
  type ApplicationIndexDefinition
} from "./index-policy";
import { applicationIndexManifest } from "./index-manifest";

describe("index policy", () => {
  it("accepts the complete application manifest and its ownership classifications", () => {
    expect(() => assertValidIndexManifest(applicationIndexManifest)).not.toThrow();
  });
  it("accepts tenant-first query and unique indexes", () => {
    expect(() =>
      assertValidIndexManifest([
        {
          collection: "locations",
          name: "tenant_phone_lookup",
          tenantOwned: true,
          kind: "query",
          keys: [
            ["tenantId", 1],
            ["phone", 1]
          ]
        },
        {
          collection: "memberships",
          name: "tenant_user_unique",
          tenantOwned: true,
          kind: "unique",
          keys: [
            ["tenantId", 1],
            ["userId", 1]
          ]
        }
      ])
    ).not.toThrow();
  });

  it("rejects a tenant index that does not begin with tenantId", () => {
    expect(() =>
      assertValidIndexManifest([
        {
          collection: "locations",
          name: "staff_time",
          tenantOwned: true,
          kind: "query",
          keys: [
            ["staffId", 1],
            ["startsAt", 1]
          ]
        }
      ])
    ).toThrow(IndexPolicyError);
  });

  it("allows only documented single-field tenant TTL exceptions", () => {
    const ttlIndex: ApplicationIndexDefinition = {
      collection: "invites",
      name: "expires_at_ttl",
      tenantOwned: true,
      kind: "ttl",
      keys: [["expiresAt", 1]],
      expireAfterSeconds: 0,
      exception: "tenant_ttl_index",
      exceptionReason: "MongoDB TTL indexes must be single-field indexes."
    };

    expect(() => assertValidIndexManifest([ttlIndex])).not.toThrow();
    expect(() =>
      assertValidIndexManifest([
        {
          ...ttlIndex,
          keys: [
            ["tenantId", 1],
            ["expiresAt", 1]
          ]
        }
      ])
    ).toThrow("exactly one field");
    expect(() => assertValidIndexManifest([{ ...ttlIndex, exceptionReason: "" }])).toThrow(
      IndexPolicyError
    );
  });

  it("recognizes only MongoDB's built-in _id_ system exception", () => {
    expect(() =>
      assertValidIndexManifest([
        {
          collection: "locations",
          name: "_id_",
          tenantOwned: true,
          kind: "system",
          keys: [["_id", 1]],
          exception: "mongodb_builtin_id"
        }
      ])
    ).not.toThrow();

    expect(() =>
      assertValidIndexManifest([
        {
          collection: "locations",
          name: "unapproved_system_index",
          tenantOwned: true,
          kind: "system",
          keys: [["other", 1]],
          exception: "mongodb_builtin_id"
        }
      ])
    ).toThrow(IndexPolicyError);
  });
});
