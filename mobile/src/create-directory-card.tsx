import { Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./app-text";
import { Icon, useTheme } from "./ui";
export function CreateDirectoryCard({
  title,
  subtitle,
  onPress,
  filled = false,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  filled?: boolean;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <Icon line name="add" size={32} color={filled ? "white" : colors.teal} />
      <Text
        style={{
          fontFamily: "Poppins-SemiBold",
          fontSize: 16,
          color: filled ? "white" : colors.teal,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 12,
          textAlign: "center",
          color: filled ? "white" : colors.muted,
        }}
      >
        {subtitle}
      </Text>
    </>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{ borderRadius: 28, overflow: "hidden" }}
    >
      {filled ? (
        <LinearGradient
          colors={["#03A8C0", "#34D3D0"]}
          style={{
            minHeight: 150,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 24,
          }}
        >
          {content}
        </LinearGradient>
      ) : (
        <View
          style={{
            minHeight: 280,
            borderRadius: 28,
            borderWidth: 1,
            borderStyle: "dashed",
            backgroundColor: colors.white,
            borderColor: colors.teal,
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: 24,
          }}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}
