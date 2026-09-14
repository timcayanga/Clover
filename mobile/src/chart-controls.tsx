import { View, Pressable, Image } from "react-native";
import { useTheme } from "./ui";
const icons = {
  Bars: require("../assets/report-controls/bars.png"),
  Donut: require("../assets/report-controls/donut.png"),
  Table: require("../assets/report-controls/table.png"),
};
export function ChartControls({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {(Object.keys(icons) as (keyof typeof icons)[]).map((name) => (
        <Pressable
          key={name}
          accessibilityRole="button"
          accessibilityLabel={`${name} chart`}
          accessibilityState={{ selected: value === name }}
          onPress={() => onChange(name)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: value === name ? colors.teal : colors.white,
          }}
        >
          <Image
            source={icons[name]}
            style={{
              width: 18,
              height: 18,
              tintColor: value === name ? "white" : colors.teal,
            }}
          />
        </Pressable>
      ))}
    </View>
  );
}
