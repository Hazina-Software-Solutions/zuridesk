"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { createZuriDeskWebApiClient } from "@zuridesk/api-client";

import { publicEnvironment } from "../config/public-env";

type Location = { id: string; name: string; timezone: string };
type Staff = { id: string; displayName: string };
type CatalogueService = {
  id: string;
  name: string;
  offering: { quotedPriceMinor: number; durationMinutes: number };
  eligibleStaff: Staff[];
};
type BookingLine = {
  order: number;
  serviceName: string;
  assignedStaffProfileId: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "in_progress" | "completed" | "skipped";
};
type Booking = {
  id: string;
  locationId: string;
  localDate: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "no_show" | "cancelled";
  version: number;
  source: "appointment" | "walk_in";
  guest: { displayName: string; phone?: string; email?: string };
  lines: BookingLine[];
};

function csrfCookie(): string {
  const row = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("__Host-zd_csrf="));
  return row === undefined ? "" : decodeURIComponent(row.slice(row.indexOf("=") + 1));
}

function localDate(timezone: string, date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function timeLabel(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function money(value: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES" }).format(value / 100);
}

export function BookingWorkspace({
  businessName,
  userName,
  roleKeys,
  onLogout
}: {
  businessName: string;
  userName: string;
  roleKeys: string[];
  onLogout: () => Promise<void>;
}) {
  const client = useMemo(
    () => createZuriDeskWebApiClient(publicEnvironment.NEXT_PUBLIC_API_URL),
    []
  );
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueService[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [notice, setNotice] = useState("Loading today's diary...");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const location = locations.find((item) => item.id === locationId);

  const refresh = useCallback(async () => {
    if (locationId === "" || date === "") return;
    const { data, error } = await client.GET("/v1/bookings", {
      params: { query: { locationId, localDateFrom: date, localDateTo: date, limit: 200 } }
    });
    if (error !== undefined || data === undefined) {
      setNotice("The diary could not be loaded. Check your connection and retry.");
      return;
    }
    const next = data.bookings as Booking[];
    setBookings(next);
    setSelected((current) => next.find(({ id }) => id === current?.id) ?? null);
    setNotice("");
  }, [client, date, locationId]);

  useEffect(() => {
    void client.GET("/v1/booking-locations").then(({ data }) => {
      const next = (data?.locations ?? []) as Location[];
      setLocations(next);
      if (next[0] !== undefined) {
        setLocationId(next[0].id);
        setDate(localDate(next[0].timezone));
      } else setNotice("No booking location is assigned to this account.");
    });
  }, [client]);

  useEffect(() => {
    if (locationId === "") return;
    void client
      .GET("/v1/locations/{locationId}/booking-catalogue", {
        params: { path: { locationId } }
      })
      .then(({ data }) => setCatalogue((data?.services ?? []) as CatalogueService[]));
  }, [client, locationId]);

  useEffect(() => void refresh(), [refresh]);

  async function mutate(action: string, booking: Booking, lineOrder?: number) {
    setBusy(true);
    const body = { expectedVersion: booking.version, idempotencyKey: crypto.randomUUID() };
    const path = { bookingId: booking.id };
    const headers = { "x-csrf-token": csrfCookie() };
    let response: { error?: unknown };
    if (action === "confirm")
      response = await client.POST("/v1/bookings/{bookingId}/confirm", {
        params: { path },
        body,
        headers
      });
    else if (action === "start")
      response = await client.POST("/v1/bookings/{bookingId}/start", {
        params: { path },
        body,
        headers
      });
    else if (action === "complete")
      response = await client.POST("/v1/bookings/{bookingId}/complete", {
        params: { path },
        body,
        headers
      });
    else if (action === "no-show")
      response = await client.POST("/v1/bookings/{bookingId}/no-show", {
        params: { path },
        body: { ...body, reasonCode: "guest_absent" },
        headers
      });
    else if (action === "cancel")
      response = await client.POST("/v1/bookings/{bookingId}/cancel", {
        params: { path },
        body: { ...body, reasonCode: "guest_request" },
        headers
      });
    else {
      const linePath = { ...path, lineOrder: lineOrder ?? 0 };
      response =
        action === "line-start"
          ? await client.POST("/v1/bookings/{bookingId}/lines/{lineOrder}/start", {
              params: { path: linePath },
              body,
              headers
            })
          : await client.POST("/v1/bookings/{bookingId}/lines/{lineOrder}/complete", {
              params: { path: linePath },
              body,
              headers
            });
    }
    setBusy(false);
    if (response.error !== undefined)
      setNotice("That change conflicted with newer diary data. The diary has been refreshed.");
    await refresh();
  }

  return (
    <main className="desk-shell">
      <header className="desk-header">
        <div>
          <strong>ZuriDesk</strong>
          <span>{businessName}</span>
        </div>
        <nav aria-label="Workspace">
          <button className="nav-active">Diary</button>
          <button disabled>Customers</button>
          <button disabled>Reports</button>
        </nav>
        <div className="account">
          <span>
            {userName}
            <small>{roleKeys.join(", ")}</small>
          </span>
          <button onClick={() => void onLogout()}>Sign out</button>
        </div>
      </header>

      <section className="diary-toolbar" aria-label="Diary controls">
        <div>
          <p className="section-label">Daily diary</p>
          <h1>Appointments</h1>
        </div>
        <label>
          Location
          <select
            value={locationId}
            onChange={(event) => {
              const id = event.target.value;
              setLocationId(id);
              const next = locations.find((item) => item.id === id);
              if (next !== undefined) setDate(localDate(next.timezone));
            }}
          >
            {locations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <button
          className="primary-action"
          onClick={() => setShowCreate(true)}
          disabled={locationId === ""}
        >
          New booking
        </button>
      </section>

      {notice !== "" ? (
        <p className="desk-notice" role="status">
          {notice}
        </p>
      ) : null}
      <section className="diary-layout">
        <div className="agenda" aria-label={`Bookings for ${date}`}>
          <div className="agenda-summary">
            <span>{bookings.length} appointments</span>
            <span>{bookings.filter(({ status }) => status === "confirmed").length} confirmed</span>
            <button onClick={() => void refresh()}>Refresh</button>
          </div>
          {bookings.length === 0 && notice === "" ? (
            <div className="empty-diary">
              <h2>The diary is clear</h2>
              <p>Create an appointment or switch location and date.</p>
            </div>
          ) : null}
          {bookings.map((booking) => (
            <button
              key={booking.id}
              className={`booking-row status-${booking.status}`}
              onClick={() => setSelected(booking)}
            >
              <time>{timeLabel(booking.startsAt, booking.timezone)}</time>
              <span className="booking-main">
                <strong>{booking.guest.displayName}</strong>
                <small>{booking.lines.map(({ serviceName }) => serviceName).join(", ")}</small>
              </span>
              <span>
                {booking.lines.map((line) => line.serviceName).length} service
                {booking.lines.length === 1 ? "" : "s"}
              </span>
              <span className="status-label">{booking.status.replace("_", " ")}</span>
            </button>
          ))}
        </div>

        <aside className="booking-detail" aria-live="polite">
          {selected === null ? (
            <div className="detail-empty">
              <h2>Select an appointment</h2>
              <p>Open a diary row to manage its visit and service lines.</p>
            </div>
          ) : (
            <>
              <div className="detail-heading">
                <div>
                  <p className="section-label">{selected.source.replace("_", " ")}</p>
                  <h2>{selected.guest.displayName}</h2>
                </div>
                <button aria-label="Close appointment details" onClick={() => setSelected(null)}>
                  Close
                </button>
              </div>
              <dl>
                <div>
                  <dt>Time</dt>
                  <dd>
                    {timeLabel(selected.startsAt, selected.timezone)} -{" "}
                    {timeLabel(selected.endsAt, selected.timezone)}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selected.status.replace("_", " ")}</dd>
                </div>
                {selected.guest.phone !== undefined ? (
                  <div>
                    <dt>Phone</dt>
                    <dd>{selected.guest.phone}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="service-lines">
                {selected.lines.map((line) => (
                  <article key={line.order}>
                    <div>
                      <strong>{line.serviceName}</strong>
                      <small>
                        {timeLabel(line.startsAt, selected.timezone)} -{" "}
                        {timeLabel(line.endsAt, selected.timezone)}
                      </small>
                    </div>
                    <span>{line.status.replace("_", " ")}</span>
                    {selected.status === "in_progress" && line.status === "scheduled" ? (
                      <button
                        disabled={busy}
                        onClick={() => void mutate("line-start", selected, line.order)}
                      >
                        Start
                      </button>
                    ) : null}
                    {line.status === "in_progress" ? (
                      <button
                        disabled={busy}
                        onClick={() => void mutate("line-complete", selected, line.order)}
                      >
                        Complete
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
              <div className="detail-actions">
                {selected.status === "pending" ? (
                  <button onClick={() => void mutate("confirm", selected)}>Confirm</button>
                ) : null}
                {selected.status === "confirmed" ? (
                  <button onClick={() => void mutate("start", selected)}>Start visit</button>
                ) : null}
                {selected.status === "in_progress" &&
                selected.lines.every(
                  ({ status }) => status === "completed" || status === "skipped"
                ) ? (
                  <button onClick={() => void mutate("complete", selected)}>Complete visit</button>
                ) : null}
                {selected.status === "confirmed" ? (
                  <button
                    className="secondary-action"
                    onClick={() => void mutate("no-show", selected)}
                  >
                    No-show
                  </button>
                ) : null}
                {["pending", "confirmed"].includes(selected.status) ? (
                  <button className="danger-action" onClick={() => void mutate("cancel", selected)}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </>
          )}
        </aside>
      </section>
      {showCreate && location !== undefined ? (
        <CreateBookingDialog
          client={client}
          location={location}
          date={date}
          catalogue={catalogue}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refresh();
          }}
        />
      ) : null}
    </main>
  );
}

function CreateBookingDialog({
  client,
  location,
  date,
  catalogue,
  onClose,
  onCreated
}: {
  client: ReturnType<typeof createZuriDeskWebApiClient>;
  location: Location;
  date: string;
  catalogue: CatalogueService[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [serviceId, setServiceId] = useState(catalogue[0]?.id ?? "");
  const service = catalogue.find(({ id }) => id === serviceId);
  const [staffId, setStaffId] = useState(service?.eligibleStaff[0]?.id ?? "");
  const [slots, setSlots] = useState<Array<{ startsAt: string; endsAt: string }>>([]);
  const [slot, setSlot] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setStaffId(service?.eligibleStaff[0]?.id ?? "");
  }, [service]);
  useEffect(() => {
    if (serviceId === "" || staffId === "") return;
    setMessage("Checking availability...");
    void client
      .POST("/v1/booking-availability/query", {
        body: {
          locationId: location.id,
          localDate: date,
          selections: [{ serviceId, assignedStaffProfileId: staffId }],
          limit: 80
        }
      })
      .then(({ data }) => {
        const next = (data?.slots ?? []) as Array<{ startsAt: string; endsAt: string }>;
        setSlots(next);
        setSlot(next[0]?.startsAt ?? "");
        setMessage(next.length === 0 ? "No open times match this service and staff member." : "");
      });
  }, [client, date, location.id, serviceId, staffId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const guestValue = form.get("guest");
    const guest = typeof guestValue === "string" ? guestValue.trim() : "";
    if (slot === "" || guest === "") return;
    const { error } = await client.POST("/v1/bookings", {
      headers: { "x-csrf-token": csrfCookie() },
      body: {
        idempotencyKey: crypto.randomUUID(),
        locationId: location.id,
        source: "appointment",
        status: "confirmed",
        guest: { kind: "named", displayName: guest, customerId: null as never },
        selections: [{ serviceId, assignedStaffProfileId: staffId }],
        startsAt: slot
      }
    });
    if (error !== undefined)
      setMessage("The selected time is no longer available. Choose another slot.");
    else await onCreated();
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="booking-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-booking-title"
      >
        <div className="detail-heading">
          <div>
            <p className="section-label">{location.name}</p>
            <h2 id="new-booking-title">New booking</h2>
          </div>
          <button onClick={onClose}>Close</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Guest name
            <input name="guest" autoFocus required />
          </label>
          <label>
            Service
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              {catalogue.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({money(item.offering.quotedPriceMinor)})
                </option>
              ))}
            </select>
          </label>
          <label>
            Staff
            <select value={staffId} onChange={(event) => setStaffId(event.target.value)}>
              {service?.eligibleStaff.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.displayName}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>Available times</legend>
            <div className="slot-grid">
              {slots.map((item) => (
                <button
                  key={item.startsAt}
                  type="button"
                  className={slot === item.startsAt ? "slot-selected" : ""}
                  onClick={() => setSlot(item.startsAt)}
                >
                  {timeLabel(item.startsAt, location.timezone)}
                </button>
              ))}
            </div>
          </fieldset>
          {message !== "" ? (
            <p className="form-message" role="status">
              {message}
            </p>
          ) : null}
          <button className="primary-action" disabled={slot === ""}>
            Create booking
          </button>
        </form>
      </section>
    </div>
  );
}
