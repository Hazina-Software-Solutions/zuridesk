import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

import {
  availabilityQuerySchema,
  availabilityLineSchema,
  availabilityResultSchema,
  availabilitySlotSchema,
  bookingCatalogueResultSchema,
  bookingCatalogueOfferingSchema,
  bookingCatalogueServiceSchema,
  bookingCommandResultSchema,
  bookingDtoSchema,
  bookingLineSnapshotSchema,
  bookingLineMutationCommandSchema,
  bookingListQuerySchema,
  bookingListResultSchema,
  bookingLocationListResultSchema,
  cancelBookingCommandSchema,
  confirmBookingCommandSchema,
  createBookingCommandSchema,
  markBookingNoShowCommandSchema,
  objectIdSchema,
  rescheduleBookingCommandSchema,
  serviceCreateInputSchema,
  serviceDtoSchema,
  serviceUpdateInputSchema,
  skipBookingLineCommandSchema,
  startBookingCommandSchema,
  type Permission
} from "@zuridesk/shared";

import type { AuthService } from "../auth/service";
import type { BookingApplicationService } from "../booking/service";
import { assertUnsafeRequest, authenticateRequest, type AuthPrincipal } from "./auth";

const bookingParamsSchema = z.object({ bookingId: objectIdSchema }).strict();
const serviceParamsSchema = z.object({ serviceId: objectIdSchema }).strict();
const locationParamsSchema = z.object({ locationId: objectIdSchema }).strict();
const bookingLineParamsSchema = z
  .object({
    bookingId: objectIdSchema,
    lineOrder: z.coerce.number().int().min(0).max(99)
  })
  .strict();
const servicesResponseSchema = z.object({ services: z.array(serviceDtoSchema).max(500) }).strict();
const createServiceBodySchema = serviceCreateInputSchema.omit({ id: true });
const confirmBodySchema = confirmBookingCommandSchema.omit({ bookingId: true });
const rescheduleBodySchema = rescheduleBookingCommandSchema.omit({ bookingId: true });
const lifecycleBodySchema = startBookingCommandSchema.omit({ bookingId: true });
const lineLifecycleBodySchema = bookingLineMutationCommandSchema.omit({
  bookingId: true,
  lineOrder: true
});
const skipLineBodySchema = skipBookingLineCommandSchema.omit({ bookingId: true, lineOrder: true });
const noShowBodySchema = markBookingNoShowCommandSchema.omit({ bookingId: true });
const cancelBodySchema = cancelBookingCommandSchema.omit({ bookingId: true });
const noContentSchema = z.null();
const isoInstantSchema = z.iso.datetime({ offset: true });
const httpMoneyMinorSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const httpBookingLineSchema = z
  .object({
    ...bookingLineSnapshotSchema.shape,
    startsAt: isoInstantSchema,
    endsAt: isoInstantSchema,
    quotedPriceMinor: httpMoneyMinorSchema
  })
  .strict();
const httpBookingDtoSchema = bookingDtoSchema.extend({
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  lines: z.array(httpBookingLineSchema).min(1).max(100)
});
const httpBookingCommandResultSchema = bookingCommandResultSchema.extend({
  booking: httpBookingDtoSchema
});
const httpBookingListResultSchema = bookingListResultSchema.extend({
  bookings: z.array(httpBookingDtoSchema).max(200)
});
const httpAvailabilityLineSchema = availabilityLineSchema.extend({
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  bufferedStartsAt: isoInstantSchema,
  bufferedEndsAt: isoInstantSchema
});
const httpAvailabilitySlotSchema = availabilitySlotSchema.extend({
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  lines: z.array(httpAvailabilityLineSchema).min(1).max(100)
});
const httpAvailabilityResultSchema = availabilityResultSchema.extend({
  evaluatedAt: isoInstantSchema,
  slots: z.array(httpAvailabilitySlotSchema).max(500)
});
const httpBookingCatalogueOfferingSchema = bookingCatalogueOfferingSchema.extend({
  quotedPriceMinor: httpMoneyMinorSchema
});
const httpBookingCatalogueServiceSchema = bookingCatalogueServiceSchema.extend({
  offering: httpBookingCatalogueOfferingSchema
});
const httpBookingCatalogueResultSchema = bookingCatalogueResultSchema.extend({
  services: z.array(httpBookingCatalogueServiceSchema).max(500)
});

export interface BookingRoutesOptions {
  readonly auth: AuthService;
  readonly booking: BookingApplicationService;
  readonly allowedOrigins: readonly string[];
}

export function bookingRoutes(app: FastifyInstance, options: BookingRoutesOptions): void {
  app.get(
    "/booking-locations",
    { schema: { response: { 200: bookingLocationListResultSchema } } },
    async (request) => {
      const { context } = await authorize(request, options, ["booking:read", "booking:self"]);
      return options.booking.listLocations(context);
    }
  );

  app.get(
    "/services",
    { schema: { response: { 200: servicesResponseSchema } } },
    async (request) => {
      const { context } = await authorize(request, options, ["service:read"]);
      return { services: await options.booking.listServices(context) };
    }
  );

  app.post(
    "/services",
    {
      schema: { body: createServiceBodySchema, response: { 201: serviceDtoSchema } }
    },
    async (request, reply) => {
      const { context } = await authorizeUnsafe(request, options, ["service:create"]);
      const body = createServiceBodySchema.parse(request.body);
      return reply.code(201).send(await options.booking.createService(context, body));
    }
  );

  app.patch(
    "/services/:serviceId",
    {
      schema: {
        params: serviceParamsSchema,
        body: serviceUpdateInputSchema,
        response: { 200: serviceDtoSchema }
      }
    },
    async (request) => {
      const { context } = await authorizeUnsafe(request, options, ["service:update"]);
      const { serviceId } = serviceParamsSchema.parse(request.params);
      return options.booking.updateService(
        context,
        serviceId,
        serviceUpdateInputSchema.parse(request.body)
      );
    }
  );

  app.delete(
    "/services/:serviceId",
    {
      schema: { params: serviceParamsSchema, response: { 204: noContentSchema } }
    },
    async (request, reply) => {
      const { context } = await authorizeUnsafe(request, options, ["service:suspend"]);
      const { serviceId } = serviceParamsSchema.parse(request.params);
      await options.booking.archiveService(context, serviceId);
      return reply.code(204).send();
    }
  );

  app.get(
    "/locations/:locationId/booking-catalogue",
    {
      schema: {
        params: locationParamsSchema,
        response: { 200: httpBookingCatalogueResultSchema }
      }
    },
    async (request) => {
      const { context } = await authorize(request, options, ["service:read"]);
      const { locationId } = locationParamsSchema.parse(request.params);
      return httpResponse(
        httpBookingCatalogueResultSchema,
        await options.booking.getCatalogue(context, locationId)
      );
    }
  );

  app.post(
    "/booking-availability/query",
    {
      schema: { body: availabilityQuerySchema, response: { 200: httpAvailabilityResultSchema } }
    },
    async (request) => {
      const { context } = await authorize(request, options, ["availability:read"]);
      return httpResponse(
        httpAvailabilityResultSchema,
        await options.booking.availability(context, availabilityQuerySchema.parse(request.body))
      );
    }
  );

  app.get(
    "/bookings",
    {
      schema: {
        querystring: bookingListQuerySchema,
        response: { 200: httpBookingListResultSchema }
      }
    },
    async (request) => {
      const { context } = await authorize(request, options, ["booking:read", "booking:self"]);
      return httpResponse(
        httpBookingListResultSchema,
        await options.booking.listBookings(context, bookingListQuerySchema.parse(request.query))
      );
    }
  );

  app.get(
    "/bookings/:bookingId",
    {
      schema: { params: bookingParamsSchema, response: { 200: httpBookingDtoSchema } }
    },
    async (request) => {
      const { context } = await authorize(request, options, ["booking:read", "booking:self"]);
      const { bookingId } = bookingParamsSchema.parse(request.params);
      return httpResponse(
        httpBookingDtoSchema,
        await options.booking.getBooking(context, bookingId)
      );
    }
  );

  app.post(
    "/bookings",
    {
      schema: {
        body: createBookingCommandSchema,
        response: { 201: httpBookingCommandResultSchema }
      }
    },
    async (request, reply) => {
      const { context } = await authorizeUnsafe(request, options, ["booking:create"]);
      const result = await options.booking.createBooking(
        context,
        createBookingCommandSchema.parse(request.body)
      );
      return reply.code(201).send(httpResponse(httpBookingCommandResultSchema, result));
    }
  );

  app.post(
    "/bookings/:bookingId/confirm",
    {
      schema: {
        params: bookingParamsSchema,
        body: confirmBodySchema,
        response: { 200: httpBookingCommandResultSchema }
      }
    },
    async (request) => {
      const { context } = await authorizeUnsafe(request, options, ["booking:update"]);
      const { bookingId } = bookingParamsSchema.parse(request.params);
      return httpResponse(
        httpBookingCommandResultSchema,
        await options.booking.confirmBooking(context, {
          bookingId,
          ...confirmBodySchema.parse(request.body)
        })
      );
    }
  );

  app.post(
    "/bookings/:bookingId/reschedule",
    {
      schema: {
        params: bookingParamsSchema,
        body: rescheduleBodySchema,
        response: { 200: httpBookingCommandResultSchema }
      }
    },
    async (request) => {
      const { context } = await authorizeUnsafe(request, options, ["booking:update"]);
      const { bookingId } = bookingParamsSchema.parse(request.params);
      return httpResponse(
        httpBookingCommandResultSchema,
        await options.booking.rescheduleBooking(context, {
          bookingId,
          ...rescheduleBodySchema.parse(request.body)
        })
      );
    }
  );

  lifecycleRoute(app, options, "/bookings/:bookingId/start", "startBooking", [
    "booking:update",
    "booking:self"
  ]);
  lifecycleRoute(app, options, "/bookings/:bookingId/complete", "completeBooking", [
    "booking:update"
  ]);
  lifecycleRoute(app, options, "/bookings/:bookingId/no-show", "markBookingNoShow", [
    "booking:update"
  ]);
  lifecycleRoute(app, options, "/bookings/:bookingId/cancel", "cancelBooking", ["booking:update"]);

  lineLifecycleRoute(app, options, "/bookings/:bookingId/lines/:lineOrder/start", "start");
  lineLifecycleRoute(app, options, "/bookings/:bookingId/lines/:lineOrder/complete", "complete");
  lineLifecycleRoute(app, options, "/bookings/:bookingId/lines/:lineOrder/skip", "skip");
}

function lifecycleRoute(
  app: FastifyInstance,
  options: BookingRoutesOptions,
  url: string,
  action: "startBooking" | "completeBooking" | "markBookingNoShow" | "cancelBooking",
  permissions: readonly Permission[]
): void {
  const bodySchema =
    action === "markBookingNoShow"
      ? noShowBodySchema
      : action === "cancelBooking"
        ? cancelBodySchema
        : lifecycleBodySchema;
  app.post(
    url,
    {
      schema: {
        params: bookingParamsSchema,
        body: bodySchema,
        response: { 200: httpBookingCommandResultSchema }
      }
    },
    async (request) => {
      const { context } = await authorizeUnsafe(request, options, permissions);
      const { bookingId } = bookingParamsSchema.parse(request.params);
      if (action === "markBookingNoShow") {
        return httpResponse(
          httpBookingCommandResultSchema,
          await options.booking.markBookingNoShow(context, {
            bookingId,
            ...noShowBodySchema.parse(request.body)
          })
        );
      }
      if (action === "cancelBooking") {
        return httpResponse(
          httpBookingCommandResultSchema,
          await options.booking.cancelBooking(context, {
            bookingId,
            ...cancelBodySchema.parse(request.body)
          })
        );
      }
      const body = lifecycleBodySchema.parse(request.body);
      const result =
        action === "startBooking"
          ? await options.booking.startBooking(context, { bookingId, ...body })
          : await options.booking.completeBooking(context, { bookingId, ...body });
      return httpResponse(httpBookingCommandResultSchema, result);
    }
  );
}

function lineLifecycleRoute(
  app: FastifyInstance,
  options: BookingRoutesOptions,
  url: string,
  action: "start" | "complete" | "skip"
): void {
  const bodySchema = action === "skip" ? skipLineBodySchema : lineLifecycleBodySchema;
  app.post(
    url,
    {
      schema: {
        params: bookingLineParamsSchema,
        body: bodySchema,
        response: { 200: httpBookingCommandResultSchema }
      }
    },
    async (request) => {
      const { context } = await authorizeUnsafe(request, options, [
        "booking:update",
        "booking:self"
      ]);
      const params = bookingLineParamsSchema.parse(request.params);
      if (action === "skip") {
        return httpResponse(
          httpBookingCommandResultSchema,
          await options.booking.skipBookingLine(context, {
            ...params,
            ...skipLineBodySchema.parse(request.body)
          })
        );
      }
      const input = { ...params, ...lineLifecycleBodySchema.parse(request.body) };
      const result =
        action === "start"
          ? await options.booking.startBookingLine(context, input)
          : await options.booking.completeBookingLine(context, input);
      return httpResponse(httpBookingCommandResultSchema, result);
    }
  );
}

async function authorize(
  request: FastifyRequest,
  options: BookingRoutesOptions,
  permissions: readonly Permission[]
): Promise<{
  principal: AuthPrincipal;
  context: Awaited<ReturnType<AuthService["authorizeTenantContextAny"]>>;
}> {
  const principal = await authenticateRequest(request, options.auth);
  const context = await options.auth.authorizeTenantContextAny(principal, permissions, request.id);
  return { principal, context };
}

async function authorizeUnsafe(
  request: FastifyRequest,
  options: BookingRoutesOptions,
  permissions: readonly Permission[]
): ReturnType<typeof authorize> {
  const authorized = await authorize(request, options, permissions);
  assertUnsafeRequest(request, authorized.principal, options.auth, options.allowedOrigins);
  return authorized;
}

function httpResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(JSON.parse(JSON.stringify(value)));
}
