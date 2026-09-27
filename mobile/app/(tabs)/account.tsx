import { Text } from "../../src/app-text";
import { Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useState } from "react";
import { useSession } from "../../src/session";
import { Icon, Notice, Screen, useTheme } from "../../src/ui";
export default function Account() {
  const session = useSession();
  const { colors } = useTheme();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => setError("Unable to open this page."));
  const rows = [
    { label: "Account", icon: "person-outline" as const, act: () => router.push("/settings?section=account") },
    { label: "Settings", icon: "settings-outline" as const, act: () => router.push("/settings") },
    { label: "Notifications", icon: "notifications-outline" as const, act: () => router.push("/notifications") },
    { label: "Plan", icon: "card-outline" as const, act: () => router.push("/settings?section=plan") },
    { label: "Help Center", icon: "help-circle-outline" as const, act: () => open("https://clover.ph/help") },
    { label: "Privacy Policy", icon: "shield-checkmark-outline" as const, act: () => open("https://clover.ph/privacy-policy") },
    { label: "Log Out", icon: "log-out-outline" as const, act: () => { if (busy) return; setBusy(true); void session.signOut().catch(() => { setError("Unable to sign out. Please try again."); setBusy(false); }); } },
  ];
  return <Screen><View>{rows.map(row => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={row.label} disabled={busy} onPress={row.act} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}><Icon name={row.icon} size={28}/><Text style={{ color: colors.ink, fontSize: 14, flex: 1 }}>{row.label}</Text><Icon name="chevron-forward" size={16} line /></Pressable>)}</View>{error ? <Notice>{error}</Notice> : null}</Screen>;
}
