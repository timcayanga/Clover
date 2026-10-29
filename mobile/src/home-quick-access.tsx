import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, type Href } from "expo-router";
import { Text } from "./app-text";
import { Card, Icon, useTheme } from "./ui";
import { productPages } from "../../shared/circle-experience";
export function HomeQuickAccess() {
  const { colors, dark } = useTheme(),
    [width, setWidth] = useState(0),
    [page, setPage] = useState(0),
    scroll = useRef<ScrollView>(null);
  const route = (path: string) =>
    (({
      "/accounts": "/(tabs)/accounts",
      "/transactions": "/(tabs)/transactions",
      "/recurring": "/(tabs)/recurring",
      "/adviser": "/(tabs)/adviser",
      "/split-bill": "/split-bills",
    })[path] ?? path) as Href;
  return (
    <>
      <Card style={{ padding: 12 }}>
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <ScrollView
            ref={scroll}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) =>
              setPage(
                Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)),
              )
            }
          >
            {productPages.map((items, index) => (
              <View key={index} style={{ width, flexDirection: "row" }}>
                {items.map((item) => (
                  <Pressable
                    key={item.key}
                    accessibilityRole="button"
                    onPress={() => router.navigate(route(item.href))}
                    style={{
                      width: width / 4,
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 12,
                    }}
                  >
                    <Icon name={item.icon} size={36} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.ink,
                        textAlign: "center",
                      }}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
        <View
          style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}
        >
          {productPages.map((_, index) => (
            <Pressable
              key={index}
              accessibilityLabel={`Quick Access page ${index + 1} of 3`}
              accessibilityRole="button"
              accessibilityState={{ selected: page === index }}
              onPress={() => {
                scroll.current?.scrollTo({ x: width * index, animated: true });
                setPage(index);
              }}
              style={{ padding: 10 }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: page === index ? colors.teal : colors.line,
                }}
              />
            </Pressable>
          ))}
        </View>
      </Card>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {(["expense", "income"] as const).map((type) => (
          <Pressable
            key={type}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/add-transaction",
                params: { entry: "manual", type },
              })
            }
            style={{
              flex: 1,
              padding: 14,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: type === "expense" ? "#f3acb6" : "#8fd8ad",
              backgroundColor:
                type === "expense"
                  ? dark
                    ? "#40242d"
                    : "#fff0f2"
                  : dark
                    ? "#18382b"
                    : "#e7f8ed",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color:
                  type === "expense"
                    ? dark
                      ? "#ffb5c3"
                      : "#b52e48"
                    : dark
                      ? "#a0eac2"
                      : "#14683b",
                fontFamily: "Poppins-Medium",
              }}
            >
              {type === "expense" ? "− Add Expense" : "+ Add Income"}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}
