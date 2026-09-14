import { Tabs } from "expo-router";
import { Text, View } from "react-native";
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
        <Tabs
          initialRouteName="index"
          screenOptions={{
            header: ({ options }) => (
              <AppHeader title={String(options.title ?? "Clover")} />
            ),
            tabBarActiveTintColor: colors.teal,
            tabBarInactiveTintColor: colors.muted,
            tabBarStyle: {
              height: 72 + insets.bottom,
              paddingTop: 7,
              paddingBottom: 8 + insets.bottom,
              borderTopColor: colors.line,
              backgroundColor: colors.white,
            },
            tabBarLabel: ({ children, color }) => <Text style={{fontFamily:"Poppins-Regular",fontSize:10,color,textAlign:"center"}}>{children}</Text>,
            tabBarLabelStyle: { fontSize: 11, fontFamily: "Poppins-Regular" },
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
                <Icon name="swap-horizontal-outline" color={color} size={34} />
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
      </View>
    </ProfileGate>
  );
}
