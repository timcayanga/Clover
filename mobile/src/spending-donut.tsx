import { categoryIconColor } from "../../shared/category-icon-colors";
import { Text } from "./app-text";
import { View } from "react-native";
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
  variant = "default",
  totalLabel = "Total spending",
  onCategoryPress,
}: {
  categories: { key?: string; color?: string; name: string; amount: number }[];
  currency: string;
  totalLabel?: string;
  onCategoryPress?: (name: string) => void;
  variant?: "default" | "category";
}) {
  const { colors } = useTheme();
  const values = categories.filter(
    (c) => Number.isFinite(c.amount) && c.amount > 0,
  );
  const total = values.reduce((sum, c) => sum + c.amount, 0);
  if (!total) return null;
  const useCategoryColors = variant === "category";
  const strokeWidth = useCategoryColors ? 36 : 26;
  const radius = useCategoryColors ? 73 : 78;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${totalLabel}: ${money(String(total), currency)}. ${values.map((c) => `${c.name}: ${money(String(c.amount), currency)}`).join(". ")}`}
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
              key={c.key ?? c.name}
              cx={105}
              cy={105}
              r={radius}
              fill="none"
              stroke={
                c.color ?? (useCategoryColors
                  ? categoryIconColor(c.name)
                  : palette[index % palette.length])
              }
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-start}
              rotation={-90}
              origin="105,105"
            />
          );
        })}
      </Svg>
      {onCategoryPress && <View accessible={false} style={{position: "absolute", inset: 0}}
        onStartShouldSetResponder={event => {
          const {locationX, locationY} = event.nativeEvent;
          return Math.abs(Math.hypot(locationX - 105, locationY - 105) - radius) <= strokeWidth / 2;
        }}
        onResponderTerminationRequest={() => true}
        onResponderRelease={event => {
          const {locationX, locationY} = event.nativeEvent;
          if (Math.abs(Math.hypot(locationX - 105, locationY - 105) - radius) > strokeWidth / 2) return;
          const turn = (Math.atan2(locationX - 105, 105 - locationY) / (2 * Math.PI) + 1) % 1;
          let boundary = 0;
          const category = values.find(value => {boundary += value.amount; return turn * total < boundary;});
          if (category) onCategoryPress(category.name);
        }}/>}

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
          {totalLabel}
        </Text>
      </View>
    </View>
  );
}
