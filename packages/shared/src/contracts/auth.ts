import { z } from "zod";

import { normalizedEmailSchema } from "../domain/contact";
import { objectIdSchema } from "../ids";

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (value) => new TextEncoder().encode(value).byteLength <= 256,
    "Password exceeds 256 UTF-8 bytes"
  );

export const genericAcceptedSchema = z.object({ accepted: z.literal(true) }).strict();

export const ownerSignupRequestSchema = z.object({ email: normalizedEmailSchema }).strict();
export const ownerSignupCompleteSchema = z
  .object({
    token: z.string().min(32).max(1024),
    email: normalizedEmailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(120),
    tenantName: z.string().trim().min(1).max(120),
    locationName: z.string().trim().min(1).max(120),
    timezone: z.string().min(1).max(80).default("Africa/Nairobi"),
    transport: z.enum(["web", "mobile"])
  })
  .strict();
export const signInSchema = z
  .object({
    email: normalizedEmailSchema,
    password: passwordSchema,
    transport: z.enum(["web", "mobile"])
  })
  .strict();
export const refreshSchema = z
  .object({ refreshToken: z.string().min(32).max(1024).optional() })
  .strict();
export const forgotPasswordSchema = z.object({ email: normalizedEmailSchema }).strict();
export const resetPasswordSchema = z
  .object({
    token: z.string().min(32).max(1024),
    email: normalizedEmailSchema,
    password: passwordSchema
  })
  .strict();
export const inviteAcceptSchema = z
  .object({
    token: z.string().min(32).max(1024),
    displayName: z.string().trim().min(1).max(120).optional(),
    password: passwordSchema.optional(),
    transport: z.enum(["web", "mobile"])
  })
  .strict();
export const tenantSelectSchema = z.object({ tenantId: objectIdSchema }).strict();

export const tenantSummarySchema = z
  .object({
    id: objectIdSchema,
    name: z.string(),
    roleKeys: z.array(z.enum(["owner", "manager", "receptionist", "stylist"]))
  })
  .strict();

export const sessionResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    csrfToken: z.string().optional(),
    expiresInSeconds: z.literal(600),
    user: z.object({ id: objectIdSchema, displayName: z.string() }).strict(),
    activeTenantId: objectIdSchema.nullable(),
    tenants: z.array(tenantSummarySchema)
  })
  .strict();

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

export const webSessionResponseSchema = sessionResponseSchema.omit({
  accessToken: true,
  refreshToken: true
});
export const mobileSessionResponseSchema = sessionResponseSchema;

export const inviteIssueSchema = z
  .object({
    email: normalizedEmailSchema,
    roleKeys: z
      .array(z.enum(["owner", "manager", "receptionist", "stylist"]))
      .min(1)
      .max(4),
    resend: z.boolean().default(false)
  })
  .strict();

export const inviteRevokeParamsSchema = z.object({ inviteId: objectIdSchema }).strict();

export const membershipAdminSchema = z
  .object({
    roleKeys: z
      .array(z.enum(["owner", "manager", "receptionist", "stylist"]))
      .min(1)
      .optional(),
    status: z.enum(["active", "suspended", "revoked"]).optional()
  })
  .strict()
  .refine((value) => value.roleKeys !== undefined || value.status !== undefined);
