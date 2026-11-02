import {
  e164PhoneNumberSchema,
  normalizedEmailSchema,
  objectIdSchema,
  type ObjectIdString
} from "@zuridesk/shared";
import { Types } from "mongoose";

import { ROLE_KEYS, type RoleKey } from "../models/identity-models";

export function toObjectId(value: unknown, label = "id"): Types.ObjectId {
  if (typeof value !== "string") throw new Error(`${label} must be an ObjectId string`);
  return new Types.ObjectId(objectIdSchema.parse(value));
}

export function toObjectIdString(value: Types.ObjectId): ObjectIdString {
  return objectIdSchema.parse(value.toHexString());
}

export function requiredName(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new Error(`${label} must contain between 1 and 120 characters`);
  }
  return normalized;
}

export function roleKeys(value: readonly string[]): RoleKey[] {
  if (value.length === 0 || new Set(value).size !== value.length) {
    throw new Error("roleKeys must be nonempty and deduplicated");
  }
  for (const role of value) {
    if (!(ROLE_KEYS as readonly string[]).includes(role)) {
      throw new Error(`Unsupported role key: ${role}`);
    }
  }
  return [...value] as RoleKey[];
}

export function normalizeRecipient(recipient: { kind: "email" | "phone"; value: string }): {
  kind: "email" | "phone";
  value: string;
} {
  return recipient.kind === "email"
    ? { kind: "email", value: normalizedEmailSchema.parse(recipient.value) }
    : { kind: "phone", value: e164PhoneNumberSchema.parse(recipient.value) };
}

export function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

export function cloneNullableDate(value: Date | null): Date | null {
  return value === null ? null : cloneDate(value);
}

export function boundedLimit(value: number | undefined): number {
  const limit = value ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  return limit;
}
