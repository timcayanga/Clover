import { WindowPane, WindowPaneProvider } from "../src/window-pane";
import { AccessibilityPreferences, useAccessibilityPreferences } from "../src/accessibility-preferences";
import { RouteReveal } from "../src/route-reveal";
import { GlassNavigationProvider } from "../src/glass-backdrop";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { NativeAnalytics } from "../src/analytics-provider";
import { identifyNativeAnalytics } from "../src/analytics";
import { Text } from "../src/app-text";
import { resourceCache } from "@clerk/expo/resource-cache";
import { disconnectStoreAccount } from "../src/store-billing";
import { DisplayPreferences } from "../src/display-preferences";
import { ClerkProvider, useAuth, useClerk } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import { hasVisitedClover, rememberCloverVisit, launchDestination, nativeEntryAccess, type LaunchStorage } from "../src/launch-history";
import { authTokenCache } from "../src/auth-token-cache";
import { Stack, usePathname, router } from "expo-router";
import { useFonts } from "expo-font";
import { allowLayoutPreview } from "../src/layout-preview";
import { StatusBar } from "expo-status-bar";
import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Platform, StyleSheet, View } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccessContext, useAccess } from "../src/access";
import { useSessionRecovery } from "../src/use-session-recovery";
import { SessionProvider, useSession } from "../src/session";
import { ImportActivity } from "../src/import-activity";
import { useTheme, AppHeader, Button, Notice } from "../src/ui";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function PrivacyShield({ children }: { children: ReactNode }) {
  const { colors, styles, dark } = useTheme();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setHidden(state !== "active"),
    );
    return () => listener.remove();
  }, []);
  return (
    <View style={{ flex: 1 }}>
      {children}
      {hidden && Platform.OS !== "web" && (
        <View
          accessibilityViewIsModal
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: colors.bg,
              justifyContent: "center",
              alignItems: "center",
              zIndex: 100,
            },
          ]}
        >
          <Image
            source={Platform.OS === "android" ? require("../assets/welcome-clover.png") : require("../assets/splash-brand.png")}
            contentFit="contain"
            style={Platform.OS === "android" ? { width: 106, height: 106 } : { width: 220, height: 184 }}
            accessibilityLabel="Clover"
          />
        </View>
      )}
    </View>
  );
}
function Routes() {
  const { reduceMotion } = useAccessibilityPreferences();
  const { colors, styles, dark } = useTheme();
  const { active, authEntry, accountDeleted, recovering } = useAccess();
  const path = usePathname();
  const session = useSession();
  const entry = nativeEntryAccess(active, session.data?.needsOnboarding, authEntry, accountDeleted);
  const landed = useRef(false);
  useEffect(() => {
    // Cold restored sessions stay under the native launch image until bootstrap.
    // New signups can choose onboarding preferences while bootstrap finishes.
    if (!entry.coldStart || session.error) void SplashScreen.hideAsync().catch(() => {});
  }, [entry.coldStart, session.error]);
  useEffect(() => {
    if (!active) {
      landed.current = false;
      return;
    }
    if (landed.current || !session.data || session.data.needsOnboarding) return;
    landed.current = true;
    if (!["/", "/welcome", "/auth"].includes(path)) return;
    const page = session.data.preferences?.defaults.defaultLandingPage;
    if (page === "transactions") router.replace("/(tabs)/transactions");
    else if (page === "reports") router.replace("/reports");
    else if (page === "accounts") router.replace("/(tabs)/accounts");
  }, [active, session.data, path]);
  if (entry.coldStart) return session.error ? <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}><Notice>{session.error}</Notice><Button title="Try again" onPress={session.refresh} /><Button title="Sign out" secondary onPress={() => void session.signOut()} /></View> : null;
  return (
    <RouteReveal><PrivacyShield>
      <GlassNavigationProvider>
        <StatusBar style={active && dark ? "light" : "dark"} />
          <View style={{ flex: 1 }} accessibilityElementsHidden={!active && recovering} importantForAccessibility={!active && recovering ? "no-hide-descendants" : "auto"}>
          <Stack
            screenOptions={{
              animation: reduceMotion ? "none" : "slide_from_right",
              animationDuration: 220,
              headerTintColor: colors.teal,
              headerTitleStyle: { color: colors.ink },
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.white },
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: "minimal",
            }}
          >
            <Stack.Protected guard={accountDeleted}>
              <Stack.Screen name="account-deleted" options={{ headerShown: false, animation: reduceMotion ? "none" : "fade" }} />
            </Stack.Protected>
            <Stack.Protected guard={entry.welcome}>
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={entry.auth}>
              <Stack.Screen name="auth" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={entry.app}>

              <Stack.Screen
                name="(tabs)"
                options={{ headerShown: false, title: "Clover", freezeOnBlur: false }}
              />
              <Stack.Screen name="add-transaction" options={{ headerShown: false, presentation: "transparentModal", animation: reduceMotion ? "none" : "slide_from_bottom", contentStyle: { backgroundColor: "#0005" } }}/>

              <Stack.Screen
                name="offline"
                options={{
                  header: () => <AppHeader title="Sync & Offline" back />,
                }}
              />
              <Stack.Screen name="settings" options={{ headerShown: false }} />
              <Stack.Screen
                name="notifications"
                options={{ headerShown: false }}
              />
              <Stack.Screen name="reports" options={{ headerShown: false }} />
              <Stack.Screen name="circles" options={{ headerShown: false }} />
              <Stack.Screen
                name="split-bills"
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="investments"
                options={{ headerShown: false }}
              />
              <Stack.Screen name="goals" options={{ headerShown: false }} />
              <Stack.Screen
                name="budgeting"
                options={{
                  title: "Budgeting",
                  headerShown: false,
                }}
              />
              <Stack.Screen
                name="transaction/[id]"
                options={{
                  title: "Transaction",
                  header: () => <AppHeader title="Transaction Details" back />,
                }}
              />
              <Stack.Screen
                name="import/[id]"
                options={{
                  title: "Review import",
                  header: () => <AppHeader title="Review import" back />,
                }}
              />
            </Stack.Protected>
            <Stack.Protected guard={entry.onboarding}>
              <Stack.Screen name="onboarding" options={{ headerShown: false, animation: reduceMotion ? "none" : "slide_from_right" }} />
            </Stack.Protected>
          </Stack>
          {entry.app ? <ImportActivity /> : null}
          </View>
          {!active && recovering ? <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", zIndex: 200 }]}>
            <ActivityIndicator color={colors.teal} accessibilityLabel="Finishing sign-in" />
          </View> : null}
      </GlassNavigationProvider>
    </PrivacyShield></RouteReveal>
  );
}
const noToken = async () => null;
const launchStorage: LaunchStorage = {
  get: async (key) => Platform.OS === "web" ? localStorage.getItem(key) : SecureStore.getItemAsync(key),
  set: async (key, value) => {
    if (Platform.OS === "web") localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
};
function AppSession({
  configured,
  loaded,
  userId,
  getToken = noToken,
  recovering = false,
  recoverSession = async () => false,
  login,
  logout,
}: {
  configured: boolean;
  loaded: boolean;
  recovering?: boolean;
  recoverSession?: () => Promise<boolean>;
  userId?: string | null;
  getToken?: () => Promise<string | null>;
  login: (mode?: "sign-in" | "sign-up") => Promise<void>;
  logout: () => Promise<void>;
}) {
  const { colors, styles, dark } = useTheme();
  // Native preview is debug-only and uses isolated sample data, never an account.
  const [demo, setDemo] = useState(() => allowLayoutPreview(
    process.env.EXPO_PUBLIC_LAYOUT_PREVIEW === "1", Platform.OS, __DEV__,
    Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : "",
  ));
  const [authEntry, setAuthEntry] = useState<"sign-in" | "sign-up" | null>(null);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const active = demo || Boolean(userId);
  const [visited, setVisited] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    void hasVisitedClover(launchStorage).then(value => { if (mounted) setVisited(value); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (!loaded || visited === null) return;
    void rememberCloverVisit(launchStorage);
    // Keep the first tutorial usable throughout this visit, but never after signing in.
    if (active) setVisited(true);
  }, [loaded, active, visited]);
  if (launchDestination(loaded, active, visited) === "loading") return null;
  return (
    <AccessContext.Provider
      value={{
        active,
        configured,
        loaded,
        recovering,
        recoverSession,
        welcomeAllowed: !active,
        authEntry,
        beginAuthEntry: setAuthEntry,
        accountDeleted,
        markAccountDeleted: () => setAccountDeleted(true),
        dismissAccountDeleted: () => setAccountDeleted(false),
        enterDemo: () => setDemo(true),
        signIn: () => { setAuthEntry("sign-in"); return login("sign-in"); },
        signUp: () => { setAuthEntry("sign-up"); return login("sign-up"); },
      }}
    >
      <SessionProvider
        key={demo ? "sample" : (userId ?? "signed-out")}
        demo={demo}
        userId={userId}
        getToken={getToken}
        signOut={async () => {
          setAuthEntry(null);
          setVisited(true);
          await rememberCloverVisit(launchStorage);
          setDemo(false);
          if (!demo) await logout();
        }}
      >
        <WindowPane><SafeAreaView
          style={{
            flex: 1,
            backgroundColor: active ? colors.white : "#f7fcfc",
          }}
          edges={["top", "left", "right"]}
        >
          <Routes />
        </SafeAreaView></WindowPane>
      </SessionProvider>
    </AccessContext.Provider>
  );
}
function AuthenticatedApp() {
  const { isLoaded, userId, getToken, signOut } = useAuth();
  const clerk = useClerk();
  const recovery = useSessionRecovery(clerk, isLoaded, userId);
  useEffect(() => {
    if (isLoaded) identifyNativeAnalytics(userId ?? null);
  }, [isLoaded, userId]);
  return (
    <AppSession
      configured
      loaded={isLoaded}
      recovering={recovery.recovering}
      recoverSession={recovery.recoverSession}
      userId={userId}
      getToken={getToken}
      login={async (mode = "sign-in") => {
        router.push({ pathname: "/auth", params: { mode } });
      }}
      logout={() => recovery.duringSignOut(async () => {
        // Billing cleanup is best effort; only an auth failure means sign-out failed.
        await disconnectStoreAccount().catch(() => {});
        await signOut();
      })}
    />
  );
}
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
    "Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
  });
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <WindowPaneProvider><AccessibilityPreferences><DisplayPreferences>
        <NativeAnalytics />
        {key ? (
          <ClerkProvider
            publishableKey={key}
            __experimental_resourceCache={
              Platform.OS === "web" ? undefined : resourceCache
            }
            tokenCache={Platform.OS === "web" ? undefined : authTokenCache}
          >
            <AuthenticatedApp />
          </ClerkProvider>
        ) : (
          <AppSession
            configured={false}
            loaded
            login={async () => {}}
            logout={async () => {}}
          />
        )}
      </DisplayPreferences></AccessibilityPreferences></WindowPaneProvider>
    </SafeAreaProvider>
  );
}
