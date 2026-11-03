import { checkDatabaseHealth, connectDatabase, disconnectDatabase } from "@zuridesk/db";

import { buildApp } from "./app";
import { AccessTokenKeys, PurposeKeyRing } from "./auth/crypto";
import { CaptureDelivery, UnconfiguredDelivery } from "./auth/delivery";
import { AuthService } from "./auth/service";
import { parseApiEnvironment } from "./config/env";

const environment = parseApiEnvironment(process.env);

const publicKeyPems = Object.fromEntries(
  Object.entries(environment.JWT_PUBLIC_KEYS_B64_JSON).map(([kid, value]) => [
    kid,
    Buffer.from(value, "base64").toString("utf8")
  ])
);
const authService = new AuthService(
  {
    access: new AccessTokenKeys(
      environment.JWT_ISSUER,
      environment.JWT_AUDIENCE,
      environment.JWT_CURRENT_KID,
      Buffer.from(environment.JWT_PRIVATE_KEY_B64, "base64").toString("utf8"),
      publicKeyPems
    ),
    refresh: new PurposeKeyRing(
      "refresh",
      environment.AUTH_REFRESH_KEY_VERSION,
      environment.AUTH_REFRESH_KEYS_JSON
    ),
    challenge: new PurposeKeyRing(
      "challenge",
      environment.AUTH_CHALLENGE_KEY_VERSION,
      environment.AUTH_CHALLENGE_KEYS_JSON
    ),
    invite: new PurposeKeyRing(
      "invite",
      environment.AUTH_INVITE_KEY_VERSION,
      environment.AUTH_INVITE_KEYS_JSON
    ),
    csrf: new PurposeKeyRing(
      "csrf",
      environment.AUTH_CSRF_KEY_VERSION,
      environment.AUTH_CSRF_KEYS_JSON
    ),
    subject: new PurposeKeyRing(
      "subject",
      environment.AUTH_SUBJECT_KEY_VERSION,
      environment.AUTH_SUBJECT_KEYS_JSON
    )
  },
  environment.AUTH_DELIVERY_MODE === "capture" ? new CaptureDelivery() : new UnconfiguredDelivery(),
  environment.WEB_BASE_URL
);

await connectDatabase({
  uri: environment.MONGODB_URI,
  databaseName: environment.MONGODB_DB_NAME
});

const app = await buildApp({
  allowedOrigins: environment.WEB_ORIGINS,
  checkDatabase: checkDatabaseHealth,
  environment: environment.NODE_ENV,
  authService,
  logger: {
    level: environment.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "*.password",
        "*.token",
        "*.otp",
        "*.uri"
      ],
      censor: "[REDACTED]"
    }
  }
});

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, "graceful shutdown started");
  await app.close();
  await disconnectDatabase();
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}

await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
