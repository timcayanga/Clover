import { usePageAskClover } from "../../src/page-ask-context";
import { askPageContext } from "../../../shared/ask-clover-page";
import { usePathname, useGlobalSearchParams } from "expo-router";
import {
  GlassContent,
  GlassNavigationProvider,
} from "../../src/glass-backdrop";
import { Text } from "../../src/app-text";
import { Tabs, router, useIsFocused } from "expo-router";
import { View } from "react-native";
import { NavigationBar, NavigationItem } from "../../src/navigation-bar";
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
export const unstable_settings = { initialRouteName: "index" };

export default function TabLayout() {
  const { colors, dark } = useTheme();
  const askClover = usePageAskClover();
  const path = usePathname();
  const params = useGlobalSearchParams();
  const access = useAccess();
  const session = useSession();
  const coveredByEntry = !useIsFocused();
  if (!access.active) return null;
  return (
    <ProfileGate>
      <View key={session.profileId} style={{ flex: 1 }}
        pointerEvents={coveredByEntry ? "none" : "auto"}
        accessibilityElementsHidden={coveredByEntry}
        importantForAccessibility={coveredByEntry ? "no-hide-descendants" : "auto"}>
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
            tabBar={({ state, descriptors, emitter, navigateToTab }) => (
              <NavigationBar dark={dark}>
                {state.routes.filter(route => ["index", "transactions", "add", "adviser", "account"].includes(route.name)).map(route => {
                  const options = descriptors[route.key].options;
                  const focused = state.routes[state.index].key === route.key;
                  const color = focused ? colors.teal : colors.muted;
                  return <NavigationItem key={route.key} label={route.name === "add" ? "Add" : String(options.title ?? route.name)}
                    selected={focused} add={route.name === "add"} color={color}
                    onPress={() => {
                      if (route.name === "adviser") { askClover(askPageContext(path, params)); return; }
                      const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                      if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                    }}
                    onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}>
                    {options.tabBarIcon?.({ focused, color, size: 34 })}
                  </NavigationItem>;
                })}
              </NavigationBar>
            )}
            screenOptions={{
              header: ({ options }) => (
                <AppHeader title={String(options.title ?? "Clover")} />
              ),
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
              listeners={{ tabPress: event => { event.preventDefault(); router.push("/add-transaction"); } }}
              options={{
                title: "Add Transaction",
                headerShown: false,
                tabBarAccessibilityLabel: "Add",
                tabBarLabel: () => null,
                tabBarIcon: () => <AddNavigationMark />,
              }}
            />
            <Tabs.Screen
              name="adviser"
              options={{
                title: "Ask Clover",
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
