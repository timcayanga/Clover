import { useAccessibilityPreferences } from "./accessibility-preferences";
import { usePageAskClover } from "./page-ask-context";
import { useRef, useState } from "react";
import { Pressable, ScrollView, type ScrollViewInstance, View } from "react-native";
import { router, useNavigation, type Href } from "expo-router";
import { Text } from "./app-text";
import { Card, Icon, useTheme } from "./ui";
import { productPages } from "../../shared/circle-experience";
import { FreeHomeBanners } from "./free-home-banners";
export function HomeQuickAccess() {
  const askClover = usePageAskClover();
  const navigation = useNavigation();
  const { reduceMotion } = useAccessibilityPreferences();
  const { colors, dark } = useTheme(),
    [width, setWidth] = useState(0),
    [page, setPage] = useState(0),
    scroll = useRef<ScrollViewInstance>(null);
  const open = (path: string) => {
    switch (path) {
      case "/adviser": return askClover({ page: "home", title: "Home" });
      case "/transactions": return navigation.dispatch({ type: "JUMP_TO", payload: { name: "transactions" } });
      case "/split-bill": return router.push("/split-bills");
      default: return router.push(path as Href);
    }
  };
  return (
    <>
      <Card style={{ paddingHorizontal: 12, paddingVertical: 4, gap: 0 }}>
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
                    onPress={() => open(item.href)}
                    style={{
                      width: width / 4,
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 4,
                      minHeight: 60,
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
              accessibilityLabel={`Quick Access page ${index + 1} of ${productPages.length}`}
              accessibilityRole="button"
              accessibilityState={{ selected: page === index }}
              onPress={() => {
                scroll.current?.scrollTo({ x: width * index, animated: !reduceMotion });
                setPage(index);
              }}
              style={{ paddingHorizontal: 10, paddingVertical: 5 }}
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
      <FreeHomeBanners />
    </>
  );
}
