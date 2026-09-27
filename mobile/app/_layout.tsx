import { GlassNavigationProvider } from "../src/glass-backdrop";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import { NativeAnalytics } from "../src/analytics-provider";
import { identifyNativeAnalytics } from "../src/analytics";
import { Text } from "../src/app-text";
import { resourceCache } from "@clerk/expo/resource-cache";
import { disconnectStoreAccount } from "../src/store-billing";
import { DisplayPreferences } from "../src/display-preferences";
import { ClerkProvider, useAuth } from "@clerk/expo";
import * as SecureStore from "expo-secure-store";
import { hasVisitedClover, rememberCloverVisit, launchDestination, type LaunchStorage } from "../src/launch-history";
import { authTokenCache } from "../src/auth-token-cache";
import { Stack, usePathname, router } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useRef, useState, type ReactNode } from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccessContext, useAccess } from "../src/access";
import { SessionProvider, useSession } from "../src/session";
import { useTheme, AppHeader, DetailNavigation } from "../src/ui";

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
            source={require("../assets/splash-brand.png")}
            contentFit="contain"
            style={{ width: 220, height: 70 }}
            accessibilityLabel="Clover"
          />
        </View>
      )}
    </View>
  );
}
function Routes() {
  const { colors, styles, dark } = useTheme();
  const { active, welcomeAllowed } = useAccess();
  const path = usePathname();
  const session = useSession();
  const landed = useRef(false);
  useEffect(() => {
    // This navigator only mounts once both session hydration and device history resolve.
    void SplashScreen.hideAsync().catch(() => {});
  }, []);
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
  useEffect(() => {
    if (active && session.data?.needsOnboarding && path !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [active, session.data?.needsOnboarding, path]);
  return (
    <PrivacyShield>
      <GlassNavigationProvider>
        <StatusBar style={active && dark ? "light" : "dark"} />
          <Stack
            screenOptions={{
              headerTintColor: colors.teal,
              headerTitleStyle: { color: colors.ink },
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.white },
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: "minimal",
            }}
          >
            <Stack.Protected guard={!active && welcomeAllowed}>
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={!active}>
              <Stack.Screen name="auth" options={{ headerShown: false }} />
            </Stack.Protected>
            <Stack.Protected guard={active}>

              <Stack.Screen
                name="(tabs)"
                options={{ headerShown: false, title: "Clover" }}
              />
              <Stack.Screen name="add-transaction" options={{ headerShown: false, presentation: "transparentModal", animation: "slide_from_bottom", contentStyle: { backgroundColor: "#0005" } }}/>

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
              <Stack.Screen
                name="onboarding"
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
                  title: "Import status",
                  header: () => <AppHeader title="Import status" back />,
                }}
              />
            </Stack.Protected>
          </Stack>
      </GlassNavigationProvider>
    </PrivacyShield>
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
  login,
  logout,
}: {
  configured: boolean;
  loaded: boolean;
  userId?: string | null;
  getToken?: () => Promise<string | null>;
  login: (mode?: "sign-in" | "sign-up") => Promise<void>;
  logout: () => Promise<void>;
}) {
  const { colors, styles, dark } = useTheme();
  const [demo, setDemo] = useState(false);
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
        welcomeAllowed: !visited && !active,
        enterDemo: () => setDemo(true),
        signIn: () => login("sign-in"),
        signUp: () => login("sign-up"),
      }}
    >
      <SessionProvider
        key={demo ? "sample" : (userId ?? "signed-out")}
        demo={demo}
        userId={userId}
        getToken={getToken}
        signOut={async () => {
          setVisited(true);
          await rememberCloverVisit(launchStorage);
          setDemo(false);
          if (!demo) await logout();
        }}
      >
        <SafeAreaView
          style={{
            flex: 1,
            backgroundColor: active ? colors.white : "#f7fcfc",
          }}
          edges={["top", "left", "right"]}
        >
          <Routes />
        </SafeAreaView>
      </SessionProvider>
    </AccessContext.Provider>
  );
}
function AuthenticatedApp() {
  const { isLoaded, userId, getToken, signOut } = useAuth();
  useEffect(() => {
    if (isLoaded) identifyNativeAnalytics(userId ?? null);
  }, [isLoaded, userId]);
  return (
    <AppSession
      configured
      loaded={isLoaded}
      userId={userId}
      getToken={getToken}
      login={async (mode = "sign-in") => {
        router.push({ pathname: "/auth", params: { mode } });
      }}
      logout={async () => {
        try {
          await disconnectStoreAccount();
        } finally {
          await signOut();
        }
      }}
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
      <DisplayPreferences>
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
      </DisplayPreferences>
    </SafeAreaProvider>
  );
}
