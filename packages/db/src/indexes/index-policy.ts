export type IndexDirection = 1 | -1 | "text";
export type IndexKey = readonly [field: string, direction: IndexDirection];
export type IndexKind = "query" | "unique" | "ttl" | "system";

export interface ApplicationIndexDefinition {
  collection: string;
  name: string;
  tenantOwned: boolean;
  kind: IndexKind;
  keys: readonly IndexKey[];
  expireAfterSeconds?: number;
  exception?: "tenant_ttl_index" | "mongodb_builtin_id";
  exceptionReason?: string;
}

export class IndexPolicyError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`Index policy failed:\n${violations.map((violation) => `- ${violation}`).join("\n")}`);
    this.name = "IndexPolicyError";
  }
}

function validateIndex(index: ApplicationIndexDefinition): string[] {
  const label = `${index.collection}.${index.name}`;
  const violations: string[] = [];

  if (index.collection.trim().length === 0 || index.name.trim().length === 0) {
    violations.push(`${label}: collection and index names are required`);
  }

  if (index.keys.length === 0) {
    violations.push(`${label}: at least one index key is required`);
  }

  if (index.kind === "ttl") {
    if (index.keys.length !== 1) {
      violations.push(`${label}: MongoDB TTL indexes must contain exactly one field`);
    }

    if (
      index.expireAfterSeconds === undefined ||
      !Number.isInteger(index.expireAfterSeconds) ||
      index.expireAfterSeconds < 0
    ) {
      violations.push(`${label}: TTL indexes require a non-negative integer expireAfterSeconds`);
    }
  } else if (index.expireAfterSeconds !== undefined) {
    violations.push(`${label}: only TTL indexes may define expireAfterSeconds`);
  }

  if (index.kind === "system") {
    const isMongoIdIndex =
      index.name === "_id_" &&
      index.keys.length === 1 &&
      index.keys[0]?.[0] === "_id" &&
      index.keys[0]?.[1] === 1 &&
      index.exception === "mongodb_builtin_id";

    if (!isMongoIdIndex) {
      violations.push(`${label}: the only permitted system index is MongoDB's built-in _id_ index`);
    }
  }

  if (index.tenantOwned && index.keys[0]?.[0] !== "tenantId") {
    const isDocumentedTtlException =
      index.kind === "ttl" &&
      index.exception === "tenant_ttl_index" &&
      (index.exceptionReason?.trim().length ?? 0) > 0;
    const isMongoIdException = index.kind === "system" && index.exception === "mongodb_builtin_id";

    if (!isDocumentedTtlException && !isMongoIdException) {
      violations.push(
        `${label}: tenant-owned indexes must begin with tenantId unless a required TTL or built-in _id_ exception is documented`
      );
    }
  }

  if (index.exception === "tenant_ttl_index" && index.kind !== "ttl") {
    violations.push(`${label}: tenant_ttl_index is valid only for TTL indexes`);
  }

  if (index.exception === "mongodb_builtin_id" && index.kind !== "system") {
    violations.push(`${label}: mongodb_builtin_id is valid only for the system _id_ index`);
  }

  return violations;
}

export function assertValidIndexManifest(indexes: readonly ApplicationIndexDefinition[]): void {
  const violations = indexes.flatMap(validateIndex);
  const names = new Set<string>();

  for (const index of indexes) {
    const identity = `${index.collection}:${index.name}`;
    if (names.has(identity)) {
      violations.push(`${index.collection}.${index.name}: duplicate index name in collection`);
    }
    names.add(identity);
  }

  if (violations.length > 0) {
    throw new IndexPolicyError(violations);
  }
}
