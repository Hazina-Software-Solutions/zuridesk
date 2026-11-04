import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrustedTenantContext } from "@zuridesk/db";
import { bookingCommandResultSchema } from "@zuridesk/shared";

import { buildApp } from "./app";
import type { AuthService } from "./auth/service";
import type { BookingApplicationService } from "./booking/service";

const tenantId = "507f1f77bcf86cd799439011";
const userId = "507f1f77bcf86cd799439012";
const locationId = "507f1f77bcf86cd799439013";
const serviceId = "507f1f77bcf86cd799439014";
const staffProfileId = "507f1f77bcf86cd799439015";
const bookingId = "507f1f77bcf86cd799439016";
const context = { tenantId, userId, requestId: "route-test" } as unknown as TrustedTenantContext;

const bookingResult = bookingCommandResultSchema.parse({
  replay: false,
  booking: {
    id: bookingId,
    locationId,
    localDate: "2026-11-10",
    timezone: "Africa/Nairobi",
    startsAt: new Date("2026-11-10T05:45:00.000Z"),
    endsAt: new Date("2026-11-10T07:15:00.000Z"),
    status: "confirmed",
    version: 0,
    source: "appointment",
    guest: { kind: "named", displayName: "Demo guest", customerId: null },
    lines: [
      {
        order: 0,
        serviceId,
        serviceName: "Braids",
        assignedStaffProfileId: staffProfileId,
        durationMinutes: 60,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        quotedPriceMinor: 250000,
        startsAt: new Date("2026-11-10T06:00:00.000Z"),
        endsAt: new Date("2026-11-10T07:00:00.000Z"),
        status: "scheduled",
        skippedReasonCode: null
      }
    ]
  }
});

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("booking HTTP routes", () => {
  it("lists only booking locations returned by the live tenant scope", async () => {
    const authorizeTenantContextAny = vi.fn().mockResolvedValue(context);
    const listLocations = vi.fn().mockResolvedValue({
      locations: [{ id: locationId, name: "Demo studio", timezone: "Africa/Nairobi" }]
    });
    const app = await testApp({ authorizeTenantContextAny }, { listLocations });

    const response = await app.inject({
      method: "GET",
      url: "/v1/booking-locations",
      headers: { authorization: "Bearer test-access-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      locations: [{ id: locationId, name: "Demo studio", timezone: "Africa/Nairobi" }]
    });
    expect(authorizeTenantContextAny).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId }),
      ["booking:read", "booking:self"],
      expect.any(String)
    );
    expect(listLocations).toHaveBeenCalledWith(context);
  });

  it("wires row-scoped reads through live tenant authorization", async () => {
    const authorizeTenantContextAny = vi.fn().mockResolvedValue(context);
    const listBookings = vi.fn().mockResolvedValue({ bookings: [] });
    const app = await testApp({ authorizeTenantContextAny }, { listBookings });

    const response = await app.inject({
      method: "GET",
      url: "/v1/bookings?status=confirmed&limit=20",
      headers: { authorization: "Bearer test-access-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ bookings: [] });
    expect(authorizeTenantContextAny).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId }),
      ["booking:read", "booking:self"],
      expect.any(String)
    );
    expect(listBookings).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ status: "confirmed", limit: 20 })
    );
  });

  it("requires web origin and CSRF before invoking a booking mutation", async () => {
    const createBooking = vi.fn().mockResolvedValue(bookingResult);
    const app = await testApp({}, { createBooking });
    const payload = {
      idempotencyKey: "http-booking-create-1",
      locationId,
      source: "appointment",
      guest: { kind: "named", displayName: "Demo guest", customerId: null },
      selections: [{ serviceId, assignedStaffProfileId: staffProfileId }],
      startsAt: "2026-11-10T06:00:00.000Z"
    };

    const denied = await app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: {
        authorization: "Bearer test-access-token",
        origin: "http://localhost:3000"
      },
      payload
    });
    expect(denied.statusCode).toBe(403);
    expect(createBooking).not.toHaveBeenCalled();

    const accepted = await app.inject({
      method: "POST",
      url: "/v1/bookings",
      headers: {
        authorization: "Bearer test-access-token",
        origin: "http://localhost:3000",
        "x-csrf-token": "valid-csrf"
      },
      payload
    });
    expect(accepted.statusCode, accepted.body).toBe(201);
    expect(accepted.json()).toMatchObject({
      replay: false,
      booking: { id: bookingId, status: "confirmed" }
    });
    expect(createBooking).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ startsAt: new Date("2026-11-10T06:00:00.000Z") })
    );
  });

  it("rejects unknown lifecycle reasons at the HTTP contract", async () => {
    const cancelBooking = vi.fn();
    const app = await testApp({}, { cancelBooking });
    const response = await app.inject({
      method: "POST",
      url: `/v1/bookings/${bookingId}/cancel`,
      headers: {
        authorization: "Bearer test-access-token",
        origin: "http://localhost:3000",
        "x-csrf-token": "valid-csrf"
      },
      payload: {
        expectedVersion: 0,
        idempotencyKey: "http-booking-cancel-1",
        reasonCode: "free-form excuse"
      }
    });
    expect(response.statusCode).toBe(400);
    expect(cancelBooking).not.toHaveBeenCalled();
  });
});

async function testApp(
  authOverrides: Partial<AuthService>,
  bookingOverrides: Partial<BookingApplicationService>
) {
  const auth = {
    authenticate: vi.fn().mockResolvedValue({
      userId,
      sessionId: "507f1f77bcf86cd799439017",
      tenantId,
      transport: "web",
      csrfDigest: "expected-csrf"
    }),
    authorizeTenantContextAny: vi.fn().mockResolvedValue(context),
    verifyCsrf: vi.fn((token: string | undefined) => token === "valid-csrf"),
    ...authOverrides
  } as unknown as AuthService;
  const booking = new Proxy(bookingOverrides as BookingApplicationService, {
    get(target, property, receiver) {
      if (property in target) {
        const value: unknown = Reflect.get(target, property, receiver);
        return value;
      }
      return vi.fn(() => Promise.reject(new Error(`Unexpected booking call: ${String(property)}`)));
    }
  });
  const app = await buildApp({
    allowedOrigins: ["http://localhost:3000"],
    checkDatabase: () => Promise.resolve("up"),
    environment: "test",
    logger: false,
    authService: auth,
    bookingService: booking
  });
  apps.push(app);
  return app;
}
