import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  forgotPasswordSchema,
  genericAcceptedSchema,
  inviteAcceptSchema,
  mobileSessionResponseSchema,
  ownerSignupCompleteSchema,
  ownerSignupRequestSchema,
  refreshSchema,
  resetPasswordSchema,
  signInSchema,
  webSessionResponseSchema,
  type SessionResponse
} from "@zuridesk/shared";

import { AuthServiceError } from "../auth/service";
import type { AuthService } from "../auth/service";

const sessionResponse = z.union([webSessionResponseSchema, mobileSessionResponseSchema]);
const noContent = z.null();

export interface AuthRoutesOptions {
  auth: AuthService;
  allowedOrigins: readonly string[];
}

export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  transport: "web" | "mobile";
  csrfDigest: string;
}

function exactOrigin(request: FastifyRequest, allowedOrigins: readonly string[]): boolean {
  const origin = request.headers.origin;
  return typeof origin === "string" && allowedOrigins.includes(origin);
}

function allowedPublicTransportOrigin(
  request: FastifyRequest,
  allowedOrigins: readonly string[]
): boolean {
  return request.headers.origin === undefined || exactOrigin(request, allowedOrigins);
}

function deriveTransport(
  request: FastifyRequest,
  claimed: "web" | "mobile",
  allowedOrigins: readonly string[]
): "web" | "mobile" {
  if (request.headers.origin !== undefined) {
    if (!exactOrigin(request, allowedOrigins) || claimed !== "web") {
      throw new AuthServiceError("FORBIDDEN", 403);
    }
    return "web";
  }
  if (claimed !== "mobile") throw new AuthServiceError("FORBIDDEN", 403);
  return "mobile";
}

function credentialPublicId(token: string): string {
  const id = token.split(".")[1];
  return id !== undefined && id.length <= 64 && /^[0-9a-f-]+$/.test(id) ? id : "invalid";
}

function setWebCookies(reply: FastifyReply, result: SessionResponse): void {
  reply.setCookie("__Host-zd_at", result.accessToken, {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600
  });
  if (result.refreshToken !== undefined) {
    reply.setCookie("__Secure-zd_rt", result.refreshToken, {
      path: "/v1/auth",
      secure: true,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 90 * 24 * 60 * 60
    });
  }
  if (result.csrfToken !== undefined) {
    reply.setCookie("__Host-zd_csrf", result.csrfToken, {
      path: "/",
      secure: true,
      httpOnly: false,
      sameSite: "strict",
      maxAge: 90 * 24 * 60 * 60
    });
  }
}

function publicSession(result: SessionResponse, transport: "web" | "mobile") {
  if (transport === "mobile") return result;
  return {
    ...(result.csrfToken === undefined ? {} : { csrfToken: result.csrfToken }),
    expiresInSeconds: result.expiresInSeconds,
    user: result.user,
    activeTenantId: result.activeTenantId,
    tenants: result.tenants
  };
}

export async function authenticateRequest(
  request: FastifyRequest,
  auth: AuthService
): Promise<AuthPrincipal> {
  const authorization = request.headers.authorization;
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  const accessToken = bearer ?? request.cookies["__Host-zd_at"];
  if (accessToken === undefined) throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
  return auth.authenticate(accessToken);
}

export function assertUnsafeRequest(
  request: FastifyRequest,
  principal: AuthPrincipal,
  auth: AuthService,
  allowedOrigins: readonly string[]
): void {
  if (principal.transport === "mobile") return;
  if (
    !exactOrigin(request, allowedOrigins) ||
    !auth.verifyCsrf(request.headers["x-csrf-token"] as string | undefined, principal.csrfDigest)
  ) {
    throw new AuthServiceError("FORBIDDEN", 403);
  }
}

export function authRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const { auth, allowedOrigins } = options;

  app.post(
    "/signup/request",
    {
      schema: { body: ownerSignupRequestSchema, response: { 202: genericAcceptedSchema } }
    },
    async (request, reply) => {
      if (!allowedPublicTransportOrigin(request, allowedOrigins))
        throw new AuthServiceError("FORBIDDEN", 403);
      const body = ownerSignupRequestSchema.parse(request.body);
      await auth.checkRateLimit("signup-request-ip", request.ip, 20);
      await auth.checkRateLimit("signup-request-email", body.email, 5);
      await auth.requestOwnerSignup(body.email);
      return reply.code(202).send({ accepted: true });
    }
  );

  app.post(
    "/signup/complete",
    {
      schema: { body: ownerSignupCompleteSchema, response: { 200: sessionResponse } }
    },
    async (request, reply) => {
      const body = ownerSignupCompleteSchema.parse(request.body);
      const transport = deriveTransport(request, body.transport, allowedOrigins);
      await auth.checkRateLimit("signup-complete-ip", request.ip, 10);
      await auth.checkRateLimit("signup-complete-token", credentialPublicId(body.token), 5);
      const result = await auth.completeOwnerSignup({ ...body, transport });
      if (transport === "web") setWebCookies(reply, result);
      return reply.send(publicSession(result, transport));
    }
  );

  app.post(
    "/sign-in",
    {
      schema: { body: signInSchema, response: { 200: sessionResponse } }
    },
    async (request, reply) => {
      const body = signInSchema.parse(request.body);
      const transport = deriveTransport(request, body.transport, allowedOrigins);
      await auth.checkRateLimit("signin-ip", request.ip, 30);
      await auth.checkRateLimit("signin-email", body.email, 10);
      const result = await auth.signIn({ ...body, transport, requestId: request.id });
      if (transport === "web") setWebCookies(reply, result);
      return reply.send(publicSession(result, transport));
    }
  );

  app.post(
    "/refresh",
    {
      schema: { body: refreshSchema, response: { 200: sessionResponse } }
    },
    async (request, reply) => {
      const body = refreshSchema.parse(request.body);
      const cookieRefresh = request.cookies["__Secure-zd_rt"];
      const web = cookieRefresh !== undefined;
      if (web && body.refreshToken !== undefined) throw new AuthServiceError("FORBIDDEN", 403);
      if (!web && request.headers.origin !== undefined)
        throw new AuthServiceError("FORBIDDEN", 403);
      const refreshToken = web ? cookieRefresh : body.refreshToken;
      if (refreshToken === undefined) throw new AuthServiceError("AUTHENTICATION_FAILED", 401);
      if (
        web &&
        (!exactOrigin(request, allowedOrigins) ||
          !(await auth.verifyRefreshCsrf(
            refreshToken,
            request.headers["x-csrf-token"] as string | undefined
          )))
      )
        throw new AuthServiceError("FORBIDDEN", 403);
      await auth.checkRateLimit("refresh-ip", request.ip, 60);
      await auth.checkRateLimit("refresh-family", credentialPublicId(refreshToken), 20);
      const transport = web ? "web" : "mobile";
      const result = await auth.refresh(refreshToken, transport);
      if (web) setWebCookies(reply, result);
      return reply.send(publicSession(result, transport));
    }
  );

  app.post(
    "/password/forgot",
    {
      schema: { body: forgotPasswordSchema, response: { 202: genericAcceptedSchema } }
    },
    async (request, reply) => {
      if (!allowedPublicTransportOrigin(request, allowedOrigins))
        throw new AuthServiceError("FORBIDDEN", 403);
      const body = forgotPasswordSchema.parse(request.body);
      await auth.checkRateLimit("password-request-ip", request.ip, 20);
      await auth.checkRateLimit("password-request-email", body.email, 5);
      await auth.requestPasswordReset(body.email);
      return reply.code(202).send({ accepted: true });
    }
  );

  app.post(
    "/password/reset",
    {
      schema: { body: resetPasswordSchema, response: { 204: noContent } }
    },
    async (request, reply) => {
      if (!allowedPublicTransportOrigin(request, allowedOrigins))
        throw new AuthServiceError("FORBIDDEN", 403);
      const body = resetPasswordSchema.parse(request.body);
      await auth.checkRateLimit("password-complete-ip", request.ip, 10);
      await auth.checkRateLimit("password-complete-email", body.email, 5);
      await auth.checkRateLimit("password-complete-token", credentialPublicId(body.token), 5);
      await auth.resetPassword(body.token, body.email, body.password);
      return reply.code(204).send();
    }
  );

  app.post(
    "/invitations/accept",
    {
      schema: { body: inviteAcceptSchema, response: { 200: sessionResponse } }
    },
    async (request, reply) => {
      const body = inviteAcceptSchema.parse(request.body);
      const transport = deriveTransport(request, body.transport, allowedOrigins);
      await auth.checkRateLimit("invite-accept-ip", request.ip, 20);
      await auth.checkRateLimit("invite-accept-token", credentialPublicId(body.token), 5);
      let principal: AuthPrincipal | undefined;
      if (
        request.headers.authorization !== undefined ||
        request.cookies["__Host-zd_at"] !== undefined
      ) {
        principal = await authenticateRequest(request, auth);
        if (principal.transport !== transport) throw new AuthServiceError("FORBIDDEN", 403);
        assertUnsafeRequest(request, principal, auth, allowedOrigins);
      }
      const result = await auth.acceptInvite({
        token: body.token,
        transport,
        ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
        ...(body.password === undefined ? {} : { password: body.password }),
        ...(principal === undefined ? {} : { principal })
      });
      if (transport === "web") setWebCookies(reply, result);
      return reply.send(publicSession(result, transport));
    }
  );

  app.post("/logout", { schema: { response: { 204: noContent } } }, async (request, reply) => {
    const principal = await authenticateRequest(request, auth);
    assertUnsafeRequest(request, principal, auth, allowedOrigins);
    await auth.logout(principal.sessionId, principal.userId);
    reply.clearCookie("__Host-zd_at", { path: "/" });
    reply.clearCookie("__Secure-zd_rt", { path: "/v1/auth" });
    reply.clearCookie("__Host-zd_csrf", { path: "/" });
    return reply.code(204).send();
  });
}
