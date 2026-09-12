import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Body, money, useTheme } from "./ui";
type Day = { date: string; income: number; expense: number };
export function HomeChart({
  days,
  hidden,
  currency,
}: {
  days: Day[];
  hidden: boolean;
  currency: string;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const peak = Math.max(1, ...days.flatMap((d) => [d.income, d.expense]));
  const current = days.find((d) => d.date === selected);
  if (!days.length)
    return <Body>No daily activity recorded for this period.</Body>;
  return (
    <View style={{ gap: 10 }}>
      <Body>Income · green Expenses · red</Body>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={{ gap: 4 }}
      >
        {days.map((d) => (
          <Pressable
            key={d.date}
            accessibilityRole="button"
            accessibilityLabel={`${d.date}${hidden ? ", amounts hidden" : `, income ${money(String(d.income), currency)}, expenses ${money(String(d.expense), currency)}`}`}
            accessibilityState={{ selected: d.date === selected }}
            onPress={() => setSelected(d.date)}
            style={{
              width: 44,
              minHeight: 130,
              justifyContent: "flex-end",
              gap: 8,
              padding: 4,
              borderWidth: 1,
              borderColor: d.date === selected ? colors.teal : "transparent",
              borderRadius: 8,
            }}
          >
            <View
              style={{
                height: 96,
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 4,
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 12,
                  height: Math.max(2, (d.income / peak) * 96),
                  backgroundColor: "#00BA63",
                  borderRadius: 3,
                }}
              />
              <View
                style={{
                  width: 12,
                  height: Math.max(2, (d.expense / peak) * 96),
                  backgroundColor: "#FF4E59",
                  borderRadius: 3,
                }}
              />
            </View>
            <Text
              style={{ color: colors.muted, fontSize: 10, textAlign: "center" }}
            >
              {d.date.slice(5)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {current ? (
        <Body>
          {current.date} · Income{" "}
          {hidden ? "••••" : money(String(current.income), currency)} · Expenses{" "}
          {hidden ? "••••" : money(String(current.expense), currency)}
        </Body>
      ) : (
        <Body>Tap a day for details. Scroll to see the full period.</Body>
      )}
    </View>
  );
}
