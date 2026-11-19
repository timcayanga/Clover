import * as Application from "expo-application";
import Constants from "expo-constants";
import { Text } from "./app-text";
import { useTheme } from "./ui";
export function AppVersion() {
  const { colors } = useTheme();
  return <Text accessibilityLabel="App version" style={{ textAlign: "center", color: colors.muted, fontSize: 11, marginTop: 24 }}>Version {Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "—"}</Text>;
}
