import { Image, View } from "react-native";
import type { ReactNode } from "react";
import { Body, useTheme } from "./ui";

const poses = {
  welcome: require("../assets/mascots/welcome.png"),
  thinking: require("../assets/mascots/thinking.png"),
  guiding: require("../assets/mascots/guiding.png"),
  celebrating: require("../assets/mascots/celebrating.png"),
  resting: require("../assets/mascots/resting.png"),
  reassuring: require("../assets/mascots/reassuring.png"),
};
export type MascotPose = keyof typeof poses;

export function CloverMascot({ pose = "welcome", size = 128 }: { pose?: MascotPose; size?: number }) {
  return <Image source={poses[pose]} accessible={false} importantForAccessibility="no" resizeMode="contain" style={{ width: size, height: size }} />;
}

export function CloverEmptyState({ children, pose = "guiding", compact = false }: { children: ReactNode; pose?: MascotPose; compact?: boolean }) {
  const { colors } = useTheme();
  return <View style={{ alignItems: "center", gap: 12, padding: compact ? 12 : 24, borderRadius: 18, backgroundColor: colors.white }}>
    <CloverMascot pose={pose} size={compact ? 72 : 128} />
    <Body>{children}</Body>
  </View>;
}
