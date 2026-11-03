import * as SecureStore from "expo-secure-store";

import { createZuriDeskApiClient } from "@zuridesk/api-client";

const REFRESH_KEY = "zuridesk.refresh.v1";

export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  activeTenantId: string | null;
  user: { id: string; displayName: string };
  tenants: Array<{ id: string; name: string; roleKeys: string[] }>;
};

export class MobileAuthClient {
  private readonly client;
  private accessToken: string | undefined;
  private refreshPromise: Promise<MobileSession | null> | undefined;

  constructor(baseUrl: string) {
    this.client = createZuriDeskApiClient(baseUrl);
  }

  async restore(): Promise<MobileSession | null> {
    this.refreshPromise ??= this.refresh().finally(() => {
      this.refreshPromise = undefined;
    });
    return this.refreshPromise;
  }

  async signIn(email: string, password: string): Promise<MobileSession> {
    const { data } = await this.client.POST("/v1/auth/sign-in", {
      body: { email, password, transport: "mobile" }
    });
    return this.requireSession(data);
  }

  async requestOwnerSignup(email: string): Promise<void> {
    const { error } = await this.client.POST("/v1/auth/signup/request", { body: { email } });
    if (error !== undefined) throw new Error("REQUEST_FAILED");
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.POST("/v1/auth/password/forgot", { body: { email } });
    if (error !== undefined) throw new Error("REQUEST_FAILED");
  }

  async resetPassword(token: string, email: string, password: string): Promise<void> {
    const { error } = await this.client.POST("/v1/auth/password/reset", {
      body: { token, email, password }
    });
    if (error !== undefined) throw new Error("TOKEN_INVALID");
  }

  async completeOwnerSignup(input: {
    token: string;
    email: string;
    password: string;
    displayName: string;
    tenantName: string;
    locationName: string;
  }): Promise<MobileSession> {
    const { data } = await this.client.POST("/v1/auth/signup/complete", {
      body: { ...input, timezone: "Africa/Nairobi", transport: "mobile" }
    });
    return this.requireSession(data);
  }

  async acceptInvite(input: {
    token: string;
    password?: string;
    displayName?: string;
  }): Promise<MobileSession> {
    const existingUser = this.accessToken !== undefined;
    const { data } = await this.client.POST("/v1/auth/invitations/accept", {
      body: { ...input, transport: "mobile" },
      ...(this.accessToken === undefined
        ? {}
        : { headers: { authorization: `Bearer ${this.accessToken}` } })
    });
    return this.requireSession(data, !existingUser);
  }

  async selectTenant(tenantId: string): Promise<MobileSession> {
    if (this.accessToken === undefined) throw new Error("AUTHENTICATION_FAILED");
    const { data } = await this.client.POST("/v1/tenants/select", {
      body: { tenantId },
      headers: { authorization: `Bearer ${this.accessToken}` }
    });
    return this.requireSession(data, false);
  }

  async logout(): Promise<void> {
    try {
      if (this.accessToken !== undefined) {
        await this.client.POST("/v1/auth/logout", {
          headers: { authorization: `Bearer ${this.accessToken}` }
        });
      }
    } finally {
      await this.clear();
    }
  }

  private async refresh(): Promise<MobileSession | null> {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (refreshToken === null) return null;
    // A rejected network request is deliberately allowed to escape without clearing SecureStore.
    const { data, response } = await this.client.POST("/v1/auth/refresh", {
      body: { refreshToken }
    });
    if (data !== undefined) return this.requireSession(data);
    if ([400, 401, 403].includes(response.status)) await this.clear();
    return null;
  }

  private async requireSession(value: unknown, persistRefresh = true): Promise<MobileSession> {
    if (
      typeof value !== "object" ||
      value === null ||
      !("accessToken" in value) ||
      typeof value.accessToken !== "string"
    ) {
      throw new Error("AUTHENTICATION_FAILED");
    }
    const next = value as MobileSession;
    this.accessToken = next.accessToken;
    if (persistRefresh) {
      if (typeof next.refreshToken !== "string") throw new Error("AUTHENTICATION_FAILED");
      await SecureStore.setItemAsync(REFRESH_KEY, next.refreshToken, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      });
    }
    return next;
  }

  private async clear(): Promise<void> {
    this.accessToken = undefined;
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}
