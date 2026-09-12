import { Tabs } from "expo-router";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess } from "../../src/access";
import { useSession } from "../../src/session";
import { AppHeader, Icon, ProfileGate, useTheme } from "../../src/ui";
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
        <Tabs
          screenOptions={{
            header: ({ options }) => (
              <AppHeader title={String(options.title ?? "Clover")} />
            ),
            tabBarActiveTintColor: colors.teal,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: {
              height: 70 + insets.bottom,
              paddingTop: 7,
              paddingBottom: 8 + insets.bottom,
              borderTopColor: colors.line,
              backgroundColor: colors.white,
            },
            tabBarLabelStyle: { fontSize: 10, fontWeight: "500" },
          }}
        >
          <Tabs.Screen name="accounts" options={{ title: "Accounts", href: null }} />
          <Tabs.Screen name="recurring" options={{ title: "Recurring", href: null }} />
          <Tabs.Screen
            name="index"
            options={{
              title: "Home",
              tabBarIcon: ({ color }) => (
                <Icon name="home-outline" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="transactions"
            options={{
              title: "Transactions",
              tabBarIcon: ({ color }) => (
                <Icon name="swap-horizontal-outline" color={color} />
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
              title: "Add",
              tabBarIcon: () => (
                <View
                  style={{
                    backgroundColor: colors.teal,
                    borderRadius: 20,
                    padding: 5,
                  }}
                >
                  <Icon name="add" color="white" />
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="adviser"
            options={{
              title: "Adviser",
              tabBarIcon: ({ color }) => (
                <Icon name="chatbubble-ellipses-outline" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="account"
            options={{
              title: "Account",
              tabBarIcon: ({ color }) => (
                <Icon name="person-outline" color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </ProfileGate>
  );
}
