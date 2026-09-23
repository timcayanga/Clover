import {
  GlassBackdrop,
  GlassContent,
  GlassNavigationProvider,
} from "../../src/glass-backdrop";
import { Text } from "../../src/app-text";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess } from "../../src/access";
import { useSession } from "../../src/session";
import {
  AccountAvatar,
  AddNavigationMark,
  AppHeader,
  Icon,
  ProfileGate,
  useTheme,
} from "../../src/ui";
export default function TabLayout() {
  const { colors, styles, dark } = useTheme();
  const access = useAccess();
  const session = useSession();
  const insets = useSafeAreaInsets();
  if (!access.active) return null;
  return (
    <ProfileGate>
      <View key={session.profileId} style={{ flex: 1 }}>
        {session.demo && (
          <Text
            style={{
              backgroundColor: colors.pale,
              color: colors.teal,
              textAlign: "center",
              padding: 6,
              fontSize: 12,
            }}
          >
            DEMO · FICTIONAL DATA · NOT YOUR ACCOUNT
          </Text>
        )}
        <GlassNavigationProvider>
          <Tabs
            screenLayout={({ children }) => (
              <GlassContent>{children}</GlassContent>
            )}
            initialRouteName="index"
            screenOptions={{
              header: ({ options }) => (
                <AppHeader title={String(options.title ?? "Clover")} />
              ),
              tabBarItemStyle: { paddingHorizontal: 0, minWidth: 0 },
              tabBarActiveTintColor: colors.teal,
              tabBarInactiveTintColor: colors.muted,
              tabBarBackground: () => <GlassBackdrop dark={dark} />,
              tabBarStyle: {
                position: "absolute",
                height: 72,
                bottom: Math.max(insets.bottom,8),
                marginHorizontal:8,
                borderRadius:32,
                overflow:"hidden",
                borderWidth:1,
                borderColor:colors.line,
                paddingTop: 7,
                paddingBottom: 8,
                borderTopColor: colors.line,
                backgroundColor: "transparent",
              },
              tabBarLabel: ({ children, color }) => (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={{
                    fontFamily: "Poppins-Regular",
                    fontSize: 10,
                    color,
                    textAlign: "center",
                    maxWidth: "100%",
                  }}
                >
                  {children}
                </Text>
              ),
              tabBarLabelStyle: { fontSize: 10, fontFamily: "Poppins-Regular" },
            }}
          >
            <Tabs.Screen
              name="accounts"
              options={{ title: "Accounts", href: null }}
            />
            <Tabs.Screen
              name="recurring"
              options={{ title: "Recurring", href: null }}
            />
            <Tabs.Screen
              name="index"
              options={{
                title: "Home",
                tabBarIcon: ({ color }) => (
                  <Icon name="home-outline" color={color} size={34} />
                ),
              }}
            />
            <Tabs.Screen
              name="transactions"
              options={{
                title: "Transactions",
                tabBarIcon: ({ color }) => (
                  <Icon
                    name="swap-horizontal-outline"
                    color={color}
                    size={34}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="add"
              listeners={({ navigation }) => ({
                tabPress: (event) => {
                  event.preventDefault();
                  navigation.navigate("add", { entry: String(Date.now()) });
                },
              })}
              options={{
                title: "Add Transaction",
                tabBarAccessibilityLabel: "Add",
                tabBarLabel: () => null,
                tabBarIcon: () => <AddNavigationMark />,
              }}
            />
            <Tabs.Screen
              name="adviser"
              options={{
                title: "Adviser",
                tabBarIcon: ({ color }) => (
                  <Icon
                    name="chatbubble-ellipses-outline"
                    color={color}
                    size={34}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="account"
              options={{
                title: "Account",
                tabBarAccessibilityLabel: "Account",
                tabBarIcon: ({ color }) => <AccountAvatar />,
              }}
            />
          </Tabs>
        </GlassNavigationProvider>
      </View>
    </ProfileGate>
  );
}
