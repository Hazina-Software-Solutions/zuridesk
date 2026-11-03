import { Linking } from "react-native";
import renderer, { act } from "react-test-renderer";

import App, { AuthApp, type AuthClient } from "./App";
import type { MobileSession } from "./src/auth/mobile-auth";

const session: MobileSession = {
  accessToken: "access",
  refreshToken: "refresh",
  activeTenantId: null,
  user: { id: "507f1f77bcf86cd799439011", displayName: "Existing user" },
  tenants: []
};

function authClient(acceptInvite: AuthClient["acceptInvite"]): AuthClient {
  return {
    restore: jest.fn(() => Promise.resolve(session)),
    signIn: jest.fn(),
    requestOwnerSignup: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    completeOwnerSignup: jest.fn(),
    acceptInvite,
    selectTenant: jest.fn(),
    logout: jest.fn(() => Promise.resolve())
  };
}

async function flushEffects(): Promise<void> {
  for (let index = 0; index < 6; index += 1) {
    await act(() => Promise.resolve());
  }
}

beforeEach(() => {
  jest
    .spyOn(Linking, "getInitialURL")
    .mockResolvedValue("zuridesk://app/invite#token=v1.invite.secret");
});

afterEach(() => {
  jest.restoreAllMocks();
});

it("renders the mobile authentication shell", async () => {
  let tree: renderer.ReactTestRenderer | undefined;

  act(() => {
    tree = renderer.create(<App />);
  });
  await act(() => Promise.resolve());

  expect(tree?.root.findByProps({ children: "ZURIDESK" })).toBeDefined();
});

it("automatically accepts a linked invitation once", async () => {
  const accepted = { ...session, activeTenantId: "507f191e810c19729de860ea" };
  const acceptInvite = jest.fn(() => Promise.resolve(accepted));
  let tree: renderer.ReactTestRenderer | undefined;

  act(() => {
    tree = renderer.create(<AuthApp authClient={authClient(acceptInvite)} />);
  });
  await flushEffects();

  expect(acceptInvite).toHaveBeenCalledTimes(1);
  expect(acceptInvite).toHaveBeenCalledWith({ token: "v1.invite.secret" });
  expect(tree?.root.findByProps({ children: "Invitation accepted." })).toBeDefined();
});

it.each([
  ["recipient mismatch", Object.assign(new Error("mismatch"), { status: 403 })],
  ["active membership conflict", Object.assign(new Error("conflict"), { status: 409 })],
  ["expired token", Object.assign(new Error("expired"), { status: 400 })],
  ["network failure", new Error("network")]
])("does not loop automatic invitation acceptance after %s", async (_label, failure) => {
  const acceptInvite = jest.fn(() => Promise.reject(failure));
  let tree: renderer.ReactTestRenderer | undefined;

  act(() => {
    tree = renderer.create(<AuthApp authClient={authClient(acceptInvite)} />);
  });
  await flushEffects();
  await flushEffects();

  expect(acceptInvite).toHaveBeenCalledTimes(1);
  expect(tree?.root.findByProps({ children: "Retry invitation" })).toBeDefined();
  expect(tree?.root.findByProps({ children: "Sign out" })).toBeDefined();
});
