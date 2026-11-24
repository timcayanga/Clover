import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Icon, useTheme } from "./ui";

export type BillEntryMethod = "manual" | "upload";

export function SplitBillQuickActions({ onSelect }: { onSelect: (method: BillEntryMethod) => void }) {
  const { colors, dark } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
        {(["manual", "upload"] as const).map(method => (
          <Pressable key={method} accessibilityRole="button"
            accessibilityLabel={method === "upload" ? "Upload receipt" : "Add bill manually"}
            onPress={() => onSelect(method)}
            style={{ flexDirection: "row", minHeight: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: method === "upload" ? colors.teal : colors.line, backgroundColor: method === "upload" ? (dark ? "#133840" : "#e6f8fa") : colors.white, gap: 6, alignItems: "center", justifyContent: "center" }}>
            <Icon name={method === "upload" ? "cloud-upload-outline" : "add"} line={method === "manual"}
              size={18} color={method === "upload" ? (dark ? "#72dce7" : "#006e80") : colors.ink} />
            <Text style={{ fontSize: 12, color: method === "upload" ? (dark ? "#72dce7" : "#006e80") : colors.ink }}>
              {method === "upload" ? "Upload" : "Add"}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}
