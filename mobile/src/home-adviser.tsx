import { router } from "expo-router";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import type { HomeInsight } from "../../shared/home-adviser-insights";
import { Text } from "./app-text";
import { Body, Card, money, useTheme } from "./ui";

function openInsight(item: HomeInsight) {
  if (item.actionLabel === "Upload now") {
    router.navigate({ pathname: "/add-transaction", params: { entry: "upload-files" } });
  } else if (item.href.startsWith("/recurring")) {
    router.navigate("/(tabs)/recurring");
  } else if (item.href.startsWith("/transactions")) {
    const category = item.href.split("?category=")[1];
    router.navigate({ pathname: "/(tabs)/transactions", params: { query: category ? decodeURIComponent(category) : "" } });
  } else {
    router.navigate("/(tabs)/adviser");
  }
}

export function HomeAdviser({ insights, hidden }: { insights: HomeInsight[]; hidden: boolean }) {
  const { colors, styles, dark } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(340, Math.max(220, width - 84));
  return <Card>
    <Text style={styles.sectionTitle}>Adviser</Text>
    {insights.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" contentContainerStyle={{ gap: 12 }}>
      {insights.map((item) => <View key={item.label} style={{ width: cardWidth, padding: 12, borderRadius: 12, gap: 8, backgroundColor: dark ? colors.pale : item.tone === "positive" ? "#E5F8EB" : item.tone === "warning" ? "#FFF0EB" : "#E7F7F6" }}>
        <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 13 }}>{item.emoji} {item.label}</Text>
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>{item.parts.map((part) => typeof part === "string" ? part : hidden ? "••••" : money(String(part.amount), part.currency)).join("")}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={item.actionLabel} onPress={() => openInsight(item)} style={{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }}>
          <Text style={{ color: colors.teal, fontSize: 13, fontFamily: "Poppins-SemiBold" }}>{item.actionLabel} →</Text>
        </Pressable>
      </View>)}
    </ScrollView> : <Body>No new suggestions right now. Clover will surface helpful next steps here.</Body>}
    {insights.length > 1 ? <Text style={{ color: colors.muted, fontSize: 11 }}>Swipe left or right for more advice</Text> : null}
  </Card>;
}
