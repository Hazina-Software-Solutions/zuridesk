"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import { createZuriDeskWebApiClient } from "@zuridesk/api-client";

import { publicEnvironment } from "../config/public-env";
import { BookingWorkspace } from "./booking-workspace";

type Tenant = { id: string; name: string; roleKeys: string[] };
type WebSession = {
  csrfToken?: string;
  activeTenantId: string | null;
  user: { id: string; displayName: string };
  tenants: Tenant[];
};

function csrfCookie(): string | undefined {
  const row = document.cookie
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith("__Host-zd_csrf="));
  return row === undefined ? undefined : decodeURIComponent(row.slice(row.indexOf("=") + 1));
}

type TokenFlow = "signup" | "reset" | "invite" | null;

function captureFragment(): { token?: string; flow: TokenFlow } {
  if (typeof window === "undefined") return { flow: null };
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? undefined;
  const flow = window.location.pathname.includes("signup/complete")
    ? "signup"
    : window.location.pathname.includes("reset-password")
      ? "reset"
      : window.location.pathname.includes("invite")
        ? "invite"
        : null;
  if (window.location.hash !== "") {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
  return { ...(token === undefined ? {} : { token }), flow };
}

function formField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function AuthShell() {
  const client = useMemo(
    () => createZuriDeskWebApiClient(publicEnvironment.NEXT_PUBLIC_API_URL),
    []
  );
  const [session, setSession] = useState<WebSession | null>(null);
  const [token, setToken] = useState<string | undefined>(undefined);
  const [flow, setFlow] = useState<TokenFlow>(null);
  const [inviteRegistration, setInviteRegistration] = useState(true);
  const [view, setView] = useState<"sign-in" | "signup" | "forgot">("sign-in");
  const [notice, setNotice] = useState("Loading your workspace…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const captured = captureFragment();
    setToken(captured.token);
    setFlow(captured.flow);
    const csrf = csrfCookie();
    if (csrf === undefined) {
      setNotice("");
      return;
    }
    void client
      .POST("/v1/auth/refresh", { body: {}, headers: { "x-csrf-token": csrf } })
      .then(async ({ data }) => {
        if (data !== undefined && captured.flow === "invite" && captured.token !== undefined) {
          const accepted = await client.POST("/v1/auth/invitations/accept", {
            body: { token: captured.token, transport: "web" },
            headers: { "x-csrf-token": data.csrfToken ?? csrf }
          });
          if (accepted.data !== undefined) {
            setSession(accepted.data);
            setToken(undefined);
            setFlow(null);
            history.replaceState(null, "", "/");
          } else {
            setNotice("This invitation does not match this account or is no longer valid.");
            return;
          }
        } else if (data !== undefined) setSession(data);
        setNotice("");
      })
      .catch(() => setNotice("Your session could not be restored. Please sign in."));
  }, [client]);

  async function submitSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const { data, error } = await client.POST("/v1/auth/sign-in", {
      body: {
        email: formField(form, "email"),
        password: formField(form, "password"),
        transport: "web"
      }
    });
    setBusy(false);
    if (error !== undefined || data === undefined) {
      setNotice("We could not sign you in with those details.");
      return;
    }
    if (flow === "invite" && token !== undefined) {
      const accepted = await client.POST("/v1/auth/invitations/accept", {
        body: { token, transport: "web" },
        headers: { "x-csrf-token": data.csrfToken ?? csrfCookie() ?? "" }
      });
      if (accepted.data === undefined) {
        setNotice("This invitation does not match this account or is no longer valid.");
        return;
      }
      setSession(accepted.data);
      setToken(undefined);
      setFlow(null);
      history.replaceState(null, "", "/");
      setNotice("");
      return;
    }
    setSession(data);
    setNotice("");
  }

  async function requestLink(event: FormEvent<HTMLFormElement>, kind: "signup" | "forgot") {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = formField(form, "email");
    const response =
      kind === "signup"
        ? await client.POST("/v1/auth/signup/request", { body: { email } })
        : await client.POST("/v1/auth/password/forgot", { body: { email } });
    setBusy(false);
    setNotice(
      response.error === undefined
        ? "If that address can continue, an email link is on its way."
        : "We could not process the request. Please try again shortly."
    );
  }

  async function completeTokenFlow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (token === undefined) {
      setNotice("This link is incomplete. Request a fresh email link.");
      return;
    }
    setBusy(true);
    const form = new FormData(event.currentTarget);
    if (flow === "reset") {
      const { error } = await client.POST("/v1/auth/password/reset", {
        body: {
          token,
          email: formField(form, "email"),
          password: formField(form, "password")
        }
      });
      setNotice(
        error === undefined
          ? "Password updated. You can now sign in."
          : "This reset link is invalid or expired."
      );
      setBusy(false);
      return;
    }
    const response =
      flow === "invite"
        ? await client.POST("/v1/auth/invitations/accept", {
            body: {
              token,
              displayName: formField(form, "displayName"),
              password: formField(form, "password"),
              transport: "web"
            }
          })
        : await client.POST("/v1/auth/signup/complete", {
            body: {
              token,
              email: formField(form, "email"),
              displayName: formField(form, "displayName"),
              password: formField(form, "password"),
              tenantName: formField(form, "tenantName"),
              locationName: formField(form, "locationName"),
              timezone: "Africa/Nairobi",
              transport: "web"
            }
          });
    setBusy(false);
    if (response.data === undefined) {
      setNotice("This link is invalid, expired, or has already been used.");
      return;
    }
    history.replaceState(null, "", "/");
    setFlow(null);
    setToken(undefined);
    setSession(response.data);
    setNotice("");
  }

  async function selectTenant(tenantId: string) {
    const csrf = csrfCookie();
    if (csrf === undefined) return setNotice("Please sign in again.");
    const { data } = await client.POST("/v1/tenants/select", {
      body: { tenantId },
      headers: { "x-csrf-token": csrf }
    });
    if (data !== undefined) setSession(data);
  }

  async function logout() {
    const csrf = csrfCookie();
    if (csrf !== undefined) {
      await client.POST("/v1/auth/logout", { headers: { "x-csrf-token": csrf } });
    }
    setSession(null);
    setNotice("Signed out.");
  }

  if (session !== null) {
    const active = session.tenants.find(({ id }) => id === session.activeTenantId);
    if (active !== undefined) {
      return (
        <BookingWorkspace
          businessName={active.name}
          userName={session.user.displayName}
          roleKeys={active.roleKeys}
          onLogout={logout}
        />
      );
    }
    return (
      <main className="auth-page">
        <section className="auth-card">
          <p className="eyebrow">ZuriDesk</p>
          <h1>Welcome, {session.user.displayName}</h1>
          <div className="stack">
            <p>Choose the business workspace you want to open.</p>
            {session.tenants.map((tenant) => (
              <button
                key={tenant.id}
                className="tenant-button"
                onClick={() => void selectTenant(tenant.id)}
              >
                <span>{tenant.name}</span>
                <small>{tenant.roleKeys.join(", ")}</small>
              </button>
            ))}
          </div>
          <button className="text-button" onClick={() => void logout()}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

  const isTokenFlow =
    flow === "signup" || flow === "reset" || (flow === "invite" && inviteRegistration);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">ZuriDesk</p>
        <h1>{isTokenFlow ? "Finish securely" : "Run your beauty business with clarity."}</h1>
        {isTokenFlow ? (
          <form className="stack" onSubmit={(event) => void completeTokenFlow(event)}>
            {flow === "signup" || flow === "reset" ? (
              <input name="email" type="email" placeholder="Email" required />
            ) : null}
            {flow !== "reset" && <input name="displayName" placeholder="Your name" required />}
            {flow === "signup" && <input name="tenantName" placeholder="Business name" required />}
            {flow === "signup" && (
              <input name="locationName" placeholder="First location" required />
            )}
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              placeholder="Password (12+ characters)"
              required
            />
            <button disabled={busy}>
              {busy ? "Working…" : flow === "reset" ? "Set new password" : "Continue"}
            </button>
            {flow === "invite" ? (
              <button
                className="text-button"
                type="button"
                onClick={() => setInviteRegistration(false)}
              >
                Already have an account? Sign in to accept
              </button>
            ) : null}
          </form>
        ) : view === "sign-in" ? (
          <form className="stack" onSubmit={(event) => void submitSignIn(event)}>
            <input name="email" type="email" placeholder="Email" required />
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              placeholder="Password"
              required
            />
            <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <form className="stack" onSubmit={(event) => void requestLink(event, view)}>
            <input name="email" type="email" placeholder="Email" required />
            <button disabled={busy}>{busy ? "Sending…" : "Email me a secure link"}</button>
          </form>
        )}
        {!isTokenFlow && (
          <nav className="auth-nav" aria-label="Authentication options">
            <button className="text-button" onClick={() => setView("sign-in")}>
              Sign in
            </button>
            <button className="text-button" onClick={() => setView("signup")}>
              Create owner account
            </button>
            <button className="text-button" onClick={() => setView("forgot")}>
              Reset password
            </button>
          </nav>
        )}
        {notice !== "" && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
      </section>
    </main>
  );
}
