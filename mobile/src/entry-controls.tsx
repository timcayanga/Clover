import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  AccessibilityInfo,
  Image,
  Pressable,
  View,
} from "react-native";
import { Text } from "./app-text";
import { Icon, useTheme } from "./ui";
export function EntrySelector({
  value,
  items,
  onChange,
  disabled = false,
}: {
  value: string;
  items: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        padding: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.pale,
      }}
    >
      {items.map((method) => (
        <Pressable
          key={method}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === method, disabled }}
          disabled={disabled}
          onPress={() => onChange(method)}
          style={{
            flex: 1,
            minHeight: 52,
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            borderRadius: 999,
            backgroundColor: value === method ? colors.teal : "transparent",
          }}
        >
          <Icon
            line
            name={
              method === "manual"
                ? "pencil-outline"
                : method === "ask"
                  ? "sparkles-outline"
                  : method === "upload"
                    ? "cloud-upload-outline"
                    : method === "connect"
                      ? "business-outline"
                      : "sync-outline"
            }
            size={20}
            color={value === method ? "white" : colors.teal}
          />
          <Text
            style={{
              fontSize: 12,
              color: value === method ? "white" : colors.ink,
            }}
          >
            {method === "ask"
              ? "Ask Clover"
              : method[0].toUpperCase() + method.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function EntryTransition({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active || reduced) return;
      slide.setValue(12);
      Animated.timing(slide, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      active = false;
      slide.stopAnimation();
    };
  }, [value, slide]);
  return (
    <Animated.View style={{ gap: 16, transform: [{ translateX: slide }] }}>
      {children}
    </Animated.View>
  );
}
export function UploadTiles({
  onChoose,
  disabled = false,
}: {
  onChoose: (source: "file" | "camera" | "library") => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {(["file", "camera", "library"] as const).map((source) => (
        <Pressable
          key={source}
          disabled={disabled}
          accessibilityRole="button"
          onPress={() => onChoose(source)}
          style={{
            minHeight: 104,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 20,
            backgroundColor: colors.white,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Image
            source={
              source === "file"
                ? require("../assets/organize/upload-files.png")
                : source === "camera"
                  ? require("../assets/organize/upload-camera.png")
                  : require("../assets/organize/upload-library.png")
            }
            style={{ width: 56, height: 56 }}
          />
          <Text style={{ fontSize: 15, color: colors.ink }}>
            {source === "file"
              ? "Choose files"
              : source === "camera"
                ? "Take photo"
                : "Photo library"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
