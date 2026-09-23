import { useState } from "react";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import { Text } from "./app-text";
import { Card, Icon, useTheme } from "./ui";
import { navigationGroups } from "./navigation-groups";
export function HomeQuickAccess() {
  const [selected, setSelected] = useState<string | null>(null),
    { colors } = useTheme();
  const groups = navigationGroups.filter((g) =>
    ["Understand", "Money", "Together", "Plan"].includes(g.title),
  );
  const group = groups.find((g) => g.title === selected);
  const route = (path: string) =>
    (({
      "/accounts": "/(tabs)/accounts",
      "/transactions": "/(tabs)/transactions",
      "/recurring": "/(tabs)/recurring",
      "/adviser": "/(tabs)/adviser",
    })[path] ?? path) as Href;
  const items = group
    ? [
        {
          label: "Back",
          icon: "arrow-back-outline" as const,
          action: () => setSelected(null),
        },
        ...group.items.map((i) => ({
          ...i,
          action: () => router.navigate(route(i.route)),
        })),
      ]
    : groups.map((g) => ({
        label: g.title,
        icon: g.icon,
        action: () => setSelected(g.title),
      }));
  return (
    <Card style={{ padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={item.action}
            style={{
              flex: 1,
              alignItems: "center",
              gap: 8,
              paddingVertical: 8,
            }}
          >
            <Icon name={item.icon} size={36} />
            <Text
              style={{
                fontSize: 11,
                color: colors.ink,
                fontFamily: "Poppins-SemiBold",
                textAlign: "center",
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
