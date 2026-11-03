import { z } from "zod";

const keyMapSchema = z
  .string()
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: "custom", message: "must be valid JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string(), z.string().min(32)));

const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4_000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/, "must contain only letters, numbers, underscores, and hyphens"),
    WEB_ORIGINS: z
      .string()
      .min(1)
      .transform((value) => value.split(",").map((origin) => origin.trim()))
      .pipe(z.array(z.url()).min(1)),
    WEB_BASE_URL: z.url(),
    JWT_ISSUER: z.url(),
    JWT_AUDIENCE: z.string().min(1),
    JWT_CURRENT_KID: z.string().min(1),
    JWT_PRIVATE_KEY_B64: z.string().min(32),
    JWT_PUBLIC_KEYS_B64_JSON: keyMapSchema,
    AUTH_REFRESH_KEY_VERSION: z.string().min(1),
    AUTH_REFRESH_KEYS_JSON: keyMapSchema,
    AUTH_CHALLENGE_KEY_VERSION: z.string().min(1),
    AUTH_CHALLENGE_KEYS_JSON: keyMapSchema,
    AUTH_INVITE_KEY_VERSION: z.string().min(1),
    AUTH_INVITE_KEYS_JSON: keyMapSchema,
    AUTH_CSRF_KEY_VERSION: z.string().min(1),
    AUTH_CSRF_KEYS_JSON: keyMapSchema,
    AUTH_SUBJECT_KEY_VERSION: z.string().min(1),
    AUTH_SUBJECT_KEYS_JSON: keyMapSchema,
    AUTH_DELIVERY_MODE: z.enum(["unconfigured", "capture"]).default("unconfigured")
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && value.AUTH_DELIVERY_MODE === "capture") {
      context.addIssue({
        code: "custom",
        path: ["AUTH_DELIVERY_MODE"],
        message: "capture is forbidden in production"
      });
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function parseApiEnvironment(environment: NodeJS.ProcessEnv): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}
