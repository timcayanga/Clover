import { DisplayPreferences } from "../src/display-preferences";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack, usePathname, router } from "expo-router";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useState, type ReactNode } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccessContext, useAccess } from "../src/access";
import { SessionProvider, useSession } from "../src/session";
import { useTheme, AppHeader, DetailNavigation } from "../src/ui";

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
          <Text style={{ fontSize: 34, color: colors.teal, fontWeight: "700" }}>
            clover
          </Text>
        </View>
      )}
    </View>
  );
}
function Routes() {
  const { colors, styles, dark } = useTheme();
  const { active } = useAccess();
  const path = usePathname();
  const session = useSession();
  useEffect(() => {
    if (active && session.data?.needsOnboarding && path !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [active, session.data?.needsOnboarding, path]);
  return (
    <PrivacyShield>
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
        <Stack.Protected guard={!active}>
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={active}>
          <Stack.Screen
            name="(tabs)"
            options={{ headerShown: false, title: "Clover" }}
          />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="reports" options={{ headerShown: false }} />
          <Stack.Screen name="circles" options={{ headerShown: false }} />
          <Stack.Screen name="split-bills" options={{ headerShown: false }} />
          <Stack.Screen name="investments" options={{ headerShown: false }} />
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
      {active &&
      (path.startsWith("/transaction/") ||
        path.startsWith("/import/") ||
        [
          "/settings",
          "/notifications",
          "/onboarding",
          "/budgeting",
          "/goals",
          "/investments",
          "/circles",
          "/split-bills",
          "/reports",
        ].includes(path)) ? (
        <DetailNavigation />
      ) : null}
    </PrivacyShield>
  );
}
const noToken = async () => null;
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
  return (
    <AccessContext.Provider
      value={{
        active,
        configured,
        loaded,
        enterDemo: () => setDemo(true),
        signIn: () => login("sign-in"),
        signUp: () => login("sign-up"),
      }}
    >
      <SessionProvider
        key={demo ? "sample" : (userId ?? "signed-out")}
        demo={demo}
        getToken={getToken}
        signOut={async () => {
          setDemo(false);
          if (!demo) await logout();
        }}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: active ? colors.white : "#f7fcfc" }}
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
  const { startHostedAuth } = useHostedAuth();
  return (
    <AppSession
      configured
      loaded={isLoaded}
      userId={userId}
      getToken={getToken}
      login={async (mode = "sign-in") => {
        await startHostedAuth({ mode });
      }}
      logout={async () => {
        await signOut();
      }}
    />
  );
}
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Poppins-Medium": require("../assets/fonts/Poppins-Medium.ttf"),
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-SemiBold": require("../assets/fonts/Poppins-SemiBold.ttf"),
  });
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <DisplayPreferences>
        {key ? (
          <ClerkProvider publishableKey={key} tokenCache={tokenCache}>
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
