import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  genericAcceptedSchema,
  inviteIssueSchema,
  inviteRevokeParamsSchema,
  membershipAdminSchema,
  mobileSessionResponseSchema,
  objectIdSchema,
  tenantSelectSchema,
  webSessionResponseSchema,
  mayManageTargetRoles
} from "@zuridesk/shared";

import type { AuthService } from "../auth/service";
import { assertUnsafeRequest, authenticateRequest } from "./auth";

export function tenancyRoutes(
  app: FastifyInstance,
  options: { auth: AuthService; allowedOrigins: readonly string[] }
): void {
  app.post(
    "/tenants/select",
    {
      schema: {
        body: tenantSelectSchema,
        response: { 200: z.union([webSessionResponseSchema, mobileSessionResponseSchema]) }
      }
    },
    async (request, reply) => {
      const principal = await authenticateRequest(request, options.auth);
      assertUnsafeRequest(request, principal, options.auth, options.allowedOrigins);
      const body = tenantSelectSchema.parse(request.body);
      const result = await options.auth.selectTenant(
        principal.sessionId,
        principal.userId,
        body.tenantId
      );
      if (principal.transport === "web") {
        reply.setCookie("__Host-zd_at", result.accessToken, {
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "lax",
          maxAge: 600
        });
        return reply.send({
          ...(result.csrfToken === undefined ? {} : { csrfToken: result.csrfToken }),
          expiresInSeconds: result.expiresInSeconds,
          user: result.user,
          activeTenantId: result.activeTenantId,
          tenants: result.tenants
        });
      }
      return reply.send(result);
    }
  );

  app.delete(
    "/invitations/:inviteId",
    {
      schema: {
        params: inviteRevokeParamsSchema,
        response: { 204: z.null() }
      }
    },
    async (request, reply) => {
      const principal = await authenticateRequest(request, options.auth);
      assertUnsafeRequest(request, principal, options.auth, options.allowedOrigins);
      await options.auth.authorizeTenant(principal, "invite:revoke");
      const { inviteId } = inviteRevokeParamsSchema.parse(request.params);
      await options.auth.revokeInvite({
        tenantId: principal.tenantId!,
        actorUserId: principal.userId,
        inviteId
      });
      return reply.code(204).send();
    }
  );

  app.post(
    "/invitations",
    {
      schema: { body: inviteIssueSchema, response: { 202: genericAcceptedSchema } }
    },
    async (request, reply) => {
      const principal = await authenticateRequest(request, options.auth);
      assertUnsafeRequest(request, principal, options.auth, options.allowedOrigins);
      const actorRoles = await options.auth.authorizeTenant(principal, "invite:create");
      const body = inviteIssueSchema.parse(request.body);
      if (!mayManageTargetRoles(actorRoles, body.roleKeys)) {
        const error = Object.assign(new Error("Forbidden"), { code: "FORBIDDEN", statusCode: 403 });
        throw error;
      }
      await options.auth.issueInvite({
        tenantId: principal.tenantId!,
        actorUserId: principal.userId,
        email: body.email,
        roleKeys: [...body.roleKeys],
        resend: body.resend
      });
      return reply.code(202).send({ accepted: true });
    }
  );

  app.patch(
    "/memberships/:membershipId",
    {
      schema: {
        params: z.object({ membershipId: objectIdSchema }).strict(),
        body: membershipAdminSchema,
        response: { 204: z.null() }
      }
    },
    async (request, reply) => {
      const principal = await authenticateRequest(request, options.auth);
      assertUnsafeRequest(request, principal, options.auth, options.allowedOrigins);
      const params = z.object({ membershipId: objectIdSchema }).parse(request.params);
      const body = membershipAdminSchema.parse(request.body);
      await options.auth.administerMembership({
        principal,
        membershipId: params.membershipId,
        ...(body.roleKeys === undefined ? {} : { roleKeys: [...body.roleKeys] }),
        ...(body.status === undefined ? {} : { status: body.status })
      });
      return reply.code(204).send();
    }
  );
}
