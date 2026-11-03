export interface AuthDelivery {
  readonly configured: boolean;
  sendEmailLink(input: {
    to: string;
    purpose: "owner_signup" | "password_reset" | "staff_invite";
    fragmentUrl: string;
  }): Promise<void>;
}

export class UnconfiguredDelivery implements AuthDelivery {
  readonly configured = false;
  sendEmailLink(): Promise<void> {
    return Promise.reject(new Error("No approved authentication delivery provider is configured"));
  }
}

export class CaptureDelivery implements AuthDelivery {
  readonly configured = true;
  readonly messages: Array<{
    to: string;
    purpose: "owner_signup" | "password_reset" | "staff_invite";
    fragmentUrl: string;
  }> = [];

  sendEmailLink(message: (typeof this.messages)[number]): Promise<void> {
    this.messages.push({ ...message });
    return Promise.resolve();
  }
}
