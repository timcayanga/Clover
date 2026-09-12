import { ClerkProvider, useAuth } from "@clerk/expo";
import { useHostedAuth } from "@clerk/expo/hosted-auth";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState, type ReactNode } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AccessContext, useAccess } from "../src/access";
import { SessionProvider } from "../src/session";
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
  return (
    <PrivacyShield>
      <StatusBar style={dark ? "light" : "dark"} />
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
          <Stack.Screen
            name="transaction/[id]"
            options={{
              title: "Transaction",
              header: () => <AppHeader title="Transaction" back />,
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
      (path.startsWith("/transaction/") || path.startsWith("/import/")) ? (
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
  login: () => Promise<void>;
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
        signIn: login,
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
          style={{ flex: 1, backgroundColor: colors.white }}
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
      login={async () => {
        await startHostedAuth({ mode: "sign-in" });
      }}
      logout={async () => {
        await signOut();
      }}
    />
  );
}
export default function RootLayout() {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
