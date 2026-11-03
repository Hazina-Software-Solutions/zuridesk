import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, spacing } from "@zuridesk/ui/tokens";

import { MobileAuthClient, type MobileSession } from "./src/auth/mobile-auth";
import { getPublicEnvironment } from "./src/config/public-env";

type ViewKey = "sign-in" | "signup" | "forgot" | "complete-signup" | "reset" | "invite";
type InviteAttemptState = "none" | "pending" | "attempting" | "failed";

export interface AuthClient {
  restore(): Promise<MobileSession | null>;
  signIn(email: string, password: string): Promise<MobileSession>;
  requestOwnerSignup(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, email: string, password: string): Promise<void>;
  completeOwnerSignup(input: {
    token: string;
    email: string;
    password: string;
    displayName: string;
    tenantName: string;
    locationName: string;
  }): Promise<MobileSession>;
  acceptInvite(input: {
    token: string;
    password?: string;
    displayName?: string;
  }): Promise<MobileSession>;
  selectTenant(tenantId: string): Promise<MobileSession>;
  logout(): Promise<void>;
}

export function AuthApp({ authClient }: { authClient?: AuthClient }) {
  const apiUrl = getPublicEnvironment().EXPO_PUBLIC_API_URL;
  const auth = useMemo<AuthClient>(
    () => authClient ?? new MobileAuthClient(apiUrl),
    [apiUrl, authClient]
  );
  const [session, setSession] = useState<MobileSession | null | undefined>(undefined);
  const [view, setView] = useState<ViewKey>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [inviteAttempt, setInviteAttempt] = useState<InviteAttemptState>("none");
  const [displayName, setDisplayName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void auth
      .restore()
      .then(setSession)
      .catch(() => {
        setSession(null);
        setMessage("You appear to be offline. Your saved session was kept for the next retry.");
      });
  }, [auth]);

  useEffect(() => {
    const applyLink = (url: string) => {
      const parsed = new URL(url);
      const nextToken = new URLSearchParams(parsed.hash.slice(1)).get("token");
      if (nextToken === null) return;
      setToken(nextToken);
      if (parsed.pathname.includes("reset-password")) setView("reset");
      else if (parsed.pathname.includes("invite")) {
        setInviteAttempt("pending");
        setView("invite");
      } else setView("complete-signup");
    };
    void Linking.getInitialURL().then((url) => {
      if (typeof url === "string") applyLink(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) => applyLink(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (session == null || inviteAttempt !== "pending" || token === "") return;
    setInviteAttempt("attempting");
    setBusy(true);
    void auth
      .acceptInvite({ token })
      .then((next) => {
        setToken("");
        setInviteAttempt("none");
        setSession(next);
        setMessage("Invitation accepted.");
      })
      .catch(() => {
        setInviteAttempt("failed");
        setMessage("This invitation does not match the signed-in account or is no longer valid.");
      })
      .finally(() => setBusy(false));
  }, [auth, inviteAttempt, session, token]);

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      if (view === "sign-in") setSession(await auth.signIn(email, password));
      if (view === "signup") {
        await auth.requestOwnerSignup(email);
        setMessage("If that address can continue, an email link is on its way.");
      }
      if (view === "forgot") {
        await auth.requestPasswordReset(email);
        setMessage("If that address can continue, a reset link is on its way.");
      }
      if (view === "complete-signup") {
        setSession(
          await auth.completeOwnerSignup({
            token,
            email,
            password,
            displayName,
            tenantName,
            locationName
          })
        );
      }
      if (view === "reset") {
        await auth.resetPassword(token, email, password);
        setView("sign-in");
        setMessage("Password updated. Sign in with the new password.");
      }
      if (view === "invite") {
        const next = await auth.acceptInvite({ token, password, displayName });
        setInviteAttempt("none");
        setToken("");
        setSession(next);
      }
    } catch {
      setMessage("The request could not be completed. Check the details or request a fresh link.");
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.plum} />
        <Text>Restoring your session…</Text>
      </SafeAreaView>
    );
  }

  if (session !== null) {
    const active = session.tenants.find(({ id }) => id === session.activeTenantId);
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>ZURIDESK</Text>
          <Text style={styles.title}>Welcome, {session.user.displayName}</Text>
          {active === undefined ? (
            <View style={styles.stack}>
              <Text style={styles.body}>Choose a business workspace.</Text>
              {session.tenants.map((tenant) => (
                <Pressable
                  key={tenant.id}
                  style={styles.button}
                  onPress={() => void auth.selectTenant(tenant.id).then(setSession)}
                >
                  <Text style={styles.buttonText}>
                    {tenant.name} · {tenant.roleKeys.join(", ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>PROTECTED WORKSPACE</Text>
              <Text style={styles.body}>{active.name} is ready.</Text>
            </View>
          )}
          {inviteAttempt === "failed" ? (
            <View style={styles.panel}>
              <Text style={styles.body}>{message}</Text>
              <Pressable
                disabled={busy}
                style={styles.button}
                onPress={() => {
                  setMessage("");
                  setInviteAttempt("pending");
                }}
              >
                <Text style={styles.buttonText}>Retry invitation</Text>
              </Pressable>
            </View>
          ) : null}
          {inviteAttempt === "attempting" ? (
            <Text style={styles.body}>Checking invitation…</Text>
          ) : null}
          {message !== "" && inviteAttempt !== "failed" ? (
            <Text style={styles.message}>{message}</Text>
          ) : null}
          <Pressable
            onPress={() =>
              void auth.logout().then(() => {
                if (inviteAttempt === "failed") setView("invite");
                setSession(null);
              })
            }
          >
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const needsEmail = ["sign-in", "signup", "forgot", "complete-signup", "reset"].includes(view);
  const needsToken = ["complete-signup", "reset", "invite"].includes(view);
  const needsPassword = ["sign-in", "complete-signup", "reset", "invite"].includes(view);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.eyebrow}>ZURIDESK</Text>
          <Text style={styles.title}>Your day, beautifully organized.</Text>
          <View style={styles.stack}>
            {needsEmail ? (
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
              />
            ) : null}
            {needsToken ? (
              <TextInput
                autoCapitalize="none"
                placeholder="Token from email link"
                value={token}
                onChangeText={setToken}
                style={styles.input}
              />
            ) : null}
            {["complete-signup", "invite"].includes(view) ? (
              <TextInput
                placeholder="Your name"
                value={displayName}
                onChangeText={setDisplayName}
                style={styles.input}
              />
            ) : null}
            {view === "complete-signup" ? (
              <TextInput
                placeholder="Business name"
                value={tenantName}
                onChangeText={setTenantName}
                style={styles.input}
              />
            ) : null}
            {view === "complete-signup" ? (
              <TextInput
                placeholder="First location"
                value={locationName}
                onChangeText={setLocationName}
                style={styles.input}
              />
            ) : null}
            {needsPassword ? (
              <TextInput
                secureTextEntry
                placeholder="Password (12+ characters)"
                value={password}
                onChangeText={setPassword}
                style={styles.input}
              />
            ) : null}
            <Pressable disabled={busy} style={styles.button} onPress={() => void submit()}>
              <Text style={styles.buttonText}>{busy ? "Working…" : "Continue"}</Text>
            </Pressable>
          </View>
          <View style={styles.nav}>
            {(["sign-in", "signup", "forgot", "complete-signup", "reset", "invite"] as const).map(
              (key) => (
                <Pressable key={key} onPress={() => setView(key)}>
                  <Text style={styles.link}>{key.replaceAll("-", " ")}</Text>
                </Pressable>
              )
            )}
          </View>
          {message !== "" ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.paper
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.white,
    boxShadow: "0 12px 30px rgba(24,20,17,0.10)"
  },
  stack: { gap: spacing.md },
  nav: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  eyebrow: { color: colors.plum, fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 36, fontWeight: "600", lineHeight: 40 },
  body: { color: "#6f645e", fontSize: 16, lineHeight: 24 },
  input: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: "#d8cbc4",
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.white
  },
  button: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.plum
  },
  buttonText: { color: colors.white, fontWeight: "600", textAlign: "center" },
  link: { color: colors.plum, fontWeight: "600", textTransform: "capitalize" },
  panel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: "#f7f0eb"
  },
  message: {
    color: "#6f4e37",
    padding: spacing.md,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: "#f7f0eb"
  }
});
