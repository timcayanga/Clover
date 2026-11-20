import { View } from "react-native";
import { Text } from "./app-text";
import { useTheme } from "./ui";

type Metric = { label: string; value: string; negative?: boolean };

export function AccountSummaryGrid({ metrics }: { metrics: Metric[] }) {
  const { colors, dark } = useTheme();
  const wideFirst = metrics.length % 2 === 1;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", borderWidth: 1, borderColor: dark ? "#29384A" : "#D8E7E3", borderRadius: 22, overflow: "hidden", backgroundColor: dark ? "#0E1725" : "#FCFEFC" }}>
      {metrics.map(({ label, value, negative }, index) => {
        const featured = index === 0;
        const columnIndex = wideFirst ? index - 1 : index;
        return (
          <View key={label} style={{
            width: featured && wideFirst ? "100%" : "50%", minHeight: 81, padding: 16, gap: 5,
            borderRightWidth: columnIndex % 2 === 0 ? 1 : 0,
            borderTopWidth: index >= (wideFirst ? 1 : 2) ? 1 : 0,
            borderColor: dark ? "#29384A" : "#E1ECE8",
            backgroundColor: featured ? (dark ? "#15382F" : "#E9F8EF") : "transparent",
          }}>
            <Text style={{ fontSize: 11, fontFamily: "Poppins-Medium", color: colors.muted }}>{label}</Text>
            <Text style={{ fontSize: 18, fontFamily: "Poppins-SemiBold", color: negative ? colors.danger : featured ? (dark ? "#86E9D1" : "#12614E") : colors.ink }}>{value}</Text>
          </View>
        );
      })}
    </View>
  );
}
