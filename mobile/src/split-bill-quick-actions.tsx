import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Card, Icon, useTheme } from "./ui";

export type BillEntryMethod = "manual" | "upload";

export function SplitBillQuickActions({ onSelect }: { onSelect: (method: BillEntryMethod) => void }) {
  const { colors } = useTheme();
  return (
    <Card style={{ paddingVertical: 4 }}>
      <View style={{ flexDirection: "row" }}>
        {(["manual", "upload"] as const).map(method => (
          <Pressable key={method} accessibilityRole="button"
            accessibilityLabel={method === "upload" ? "Upload receipt" : "Add bill manually"}
            onPress={() => onSelect(method)}
            style={{ flex: 1, minHeight: 60, gap: 4, alignItems: "center", justifyContent: "center" }}>
            <Icon name={method === "upload" ? "cloud-upload-outline" : "add"} line={method === "manual"}
              size={28} color={method === "upload" ? colors.teal : colors.ink} />
            <Text style={{ fontSize: 12, color: method === "upload" ? colors.teal : colors.ink }}>
              {method === "upload" ? "Upload" : "Add"}
            </Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
