import {homeActionRow, homeActionStyle} from "./home-action-style";
import { Pressable, View } from "react-native";
import { Text } from "./app-text";
import { Icon, useTheme } from "./ui";

export type BillEntryMethod = "manual" | "upload";

export function SplitBillQuickActions({ onSelect }: { onSelect: (method: BillEntryMethod) => void }) {
  const { colors, dark } = useTheme();
  return (
    <View style={homeActionRow}>
        {(["manual", "upload"] as const).map(method => (
          <Pressable key={method} accessibilityRole="button"
            accessibilityLabel={method === "upload" ? "Upload receipt" : "Add bill manually"}
            onPress={() => onSelect(method)}
            style={{ ...homeActionStyle, flexDirection: "row", borderColor: method === "upload" ? colors.teal : colors.line, backgroundColor: method === "upload" ? (dark ? "#133840" : "#e6f8fa") : colors.white, gap: 6, alignItems: "center", justifyContent: "center" }}>
            <Icon name={method === "upload" ? "cloud-upload-outline" : "add"} line={method === "manual"}
              size={18} color={method === "upload" ? (dark ? "#72dce7" : "#006e80") : colors.ink} />
            <Text style={{ fontFamily: "Poppins-Medium", color: method === "upload" ? (dark ? "#72dce7" : "#006e80") : colors.ink }}>
              {method === "upload" ? "Upload" : "Add"}
            </Text>
          </Pressable>
        ))}
    </View>
  );
}
