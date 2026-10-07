import { z } from "zod";

export const INITIAL_SCHEMA_VERSION = 1 as const;

export const schemaVersionSchema = z.number().int().positive();
export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
