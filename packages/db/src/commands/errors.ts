export type DatabaseCommandErrorCode =
  "CONFLICT" | "INVALID_CREDENTIAL" | "NOT_FOUND" | "FORBIDDEN" | "LAST_OWNER" | "RATE_LIMITED";

export class DatabaseCommandError extends Error {
  constructor(readonly code: DatabaseCommandErrorCode) {
    super(code);
    this.name = "DatabaseCommandError";
  }
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export function isWriteConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && (error.code === 112 || error.code === 251)) return true;
  return (
    "errorLabels" in error &&
    Array.isArray(error.errorLabels) &&
    error.errorLabels.some((label) => label === "TransientTransactionError")
  );
}
