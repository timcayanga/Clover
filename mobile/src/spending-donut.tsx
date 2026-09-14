import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme, money } from "./ui";
const palette = [
  "#A8181B",
  "#FFC076",
  "#FFA343",
  "#ACE6F4",
  "#DCD1FA",
  "#AC5300",
];
export function SpendingDonut({
  categories,
  currency,
}: {
  categories: { name: string; amount: number }[];
  currency: string;
}) {
  const { colors } = useTheme();
  const values = categories.filter(
    (c) => Number.isFinite(c.amount) && c.amount > 0,
  );
  const total = values.reduce((sum, c) => sum + c.amount, 0);
  if (!total) return null;
  const circumference = 2 * Math.PI * 78;
  let offset = 0;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Spending mix: ${money(String(total), currency)}. ${values.map((c) => `${c.name}: ${money(String(c.amount), currency)}`).join(". ")}`}
      style={{
        alignSelf: "center",
        width: 210,
        height: 210,
        marginVertical: 12,
      }}
    >
      <Svg width={210} height={210} viewBox="0 0 210 210">
        {values.map((c, index) => {
          const length = (c.amount / total) * circumference;
          const start = offset;
          offset += length;
          return (
            <Circle
              key={c.name}
              cx={105}
              cy={105}
              r={78}
              fill="none"
              stroke={palette[index % palette.length]}
              strokeWidth={26}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-start}
              rotation={-90}
              origin="105,105"
            />
          );
        })}
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 18,
            color: colors.ink,
          }}
        >
          {money(String(total), currency)}
        </Text>
        <Text
          style={{
            fontFamily: "Poppins-Regular",
            fontSize: 11,
            color: colors.muted,
          }}
        >
          Total spending
        </Text>
      </View>
    </View>
  );
}
