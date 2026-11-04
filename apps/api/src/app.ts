import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider
} from "fastify-type-provider-zod";

import { healthRoutes } from "./routes/health";
import type { AuthService } from "./auth/service";
import { authRoutes } from "./routes/auth";
import { tenancyRoutes } from "./routes/tenancy";
import { bookingRoutes } from "./routes/bookings";
import type { BookingApplicationService } from "./booking/service";

export interface BuildAppOptions {
  allowedOrigins: readonly string[];
  checkDatabase: () => Promise<"up" | "down">;
  environment: "development" | "test" | "production";
  logger?: boolean | Record<string, unknown>;
  authService?: AuthService;
  bookingService?: BookingApplicationService;
}

interface HttpError extends FastifyError {
  statusCode?: number;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: options.logger ?? options.environment !== "test",
    requestIdHeader: "x-request-id",
    trustProxy: false
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "ZuriDesk API",
        description: "Shared API for ZuriDesk web and mobile clients",
        version: "0.1.0"
      }
    },
    transform: jsonSchemaTransform
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (origin === undefined || options.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      const error = Object.assign(new Error("Origin is not allowed"), {
        code: "CORS_ORIGIN_DENIED",
        statusCode: 403
      });
      callback(error, false);
    }
  });

  app.setErrorHandler((error: HttpError, request, reply) => {
    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;
    const code = error.code ?? (statusCode === 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_REJECTED");

    request.log.error({ errorType: error.name, code, requestId: request.id }, "request failed");

    return reply.code(statusCode).send({
      error: {
        code,
        message: statusCode >= 500 ? "Service unavailable" : "Request rejected",
        requestId: request.id
      }
    });
  });

  await app.register(healthRoutes, {
    prefix: "/health",
    checkDatabase: options.checkDatabase
  });

  if (
    (options.authService === undefined || options.bookingService === undefined) &&
    options.environment === "production"
  ) {
    throw new Error("Authentication and booking service configuration is required in production");
  }
  const authService =
    options.authService ??
    (new Proxy(
      {},
      {
        get() {
          return () => {
            throw Object.assign(new Error("Authentication unavailable"), {
              code: "AUTHENTICATION_UNAVAILABLE",
              statusCode: 503
            });
          };
        }
      }
    ) as AuthService);
  await app.register(authRoutes, {
    prefix: "/v1/auth",
    auth: authService,
    allowedOrigins: options.allowedOrigins
  });
  await app.register(tenancyRoutes, {
    prefix: "/v1",
    auth: authService,
    allowedOrigins: options.allowedOrigins
  });
  const bookingService =
    options.bookingService ??
    (new Proxy(
      {},
      {
        get() {
          return () => {
            throw Object.assign(new Error("Booking service unavailable"), {
              code: "BOOKING_SERVICE_UNAVAILABLE",
              statusCode: 503
            });
          };
        }
      }
    ) as BookingApplicationService);
  await app.register(bookingRoutes, {
    prefix: "/v1",
    auth: authService,
    booking: bookingService,
    allowedOrigins: options.allowedOrigins
  });

  return app;
}
