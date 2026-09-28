import { Text } from "../../src/app-text";
import { Image, Pressable, ScrollView, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { useUser } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useState } from "react";
import { useSession } from "../../src/session";
import { AccountAvatar, Icon, Notice, useTheme } from "../../src/ui";
type AccountMenuProps = { onClose?: () => void };
export default function Account(props: AccountMenuProps) {
  return useSession().demo ? <AccountMenu {...props} user={null} /> : <AuthenticatedAccount {...props} />;
}
function AuthenticatedAccount(props: AccountMenuProps) {
  const { user } = useUser();
  return <AccountMenu {...props} user={user} />;
}
function AccountMenu({ onClose, user }: AccountMenuProps & { user: ReturnType<typeof useUser>["user"] }) {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const name = user?.fullName || user?.firstName || session.data?.firstName || "Clover member";
  const close = onClose ?? (() => router.canGoBack() ? router.back() : router.navigate("/(tabs)"));
  const viewAccount = () => { onClose?.(); router.push("/settings?section=account"); };
  const { colors } = useTheme();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => setError("Unable to open this page."));
  const rows = [
    { label: "Settings", icon: "settings-outline" as const, act: () => router.push("/settings") },
    { label: "Notifications", icon: "notifications-outline" as const, act: () => router.push("/notifications") },
    { label: "Plan", icon: "card-outline" as const, act: () => router.push("/settings?section=plan") },
    { label: "Help Center", icon: "help-circle-outline" as const, act: () => open("https://clover.ph/help") },
    { label: "Privacy Policy", icon: "shield-checkmark-outline" as const, act: () => open("https://clover.ph/privacy-policy") },
    { label: "Log Out", icon: "log-out-outline" as const, act: () => { if (busy) return; setBusy(true); void session.signOut().catch(() => { setError("Unable to sign out. Please try again."); setBusy(false); }); } },
  ];
  return <ScrollView style={{ flex: 1, backgroundColor: colors.white }} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}>
    <View style={{ backgroundColor: colors.teal, paddingHorizontal: 24, paddingTop: Math.max(insets.top, 16), paddingBottom: 24, gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Account menu" onPress={close} style={{ alignSelf: "flex-end", minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
        <Icon name="close-outline" color="#fff" size={24} line />
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        {user?.hasImage && user.imageUrl ? <Image source={{ uri: user.imageUrl }} accessibilityLabel="Profile photo" style={{ width: 56, height: 56, borderRadius: 28 }} /> : <AccountAvatar />}
        <Text style={{ color: "#fff", fontSize: 20, fontFamily: "Poppins-SemiBold", flex: 1 }}>{name}</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={viewAccount} style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 14 }}>View Account</Text></Pressable>
    </View>
    <View style={{ paddingHorizontal: 24 }}>{rows.map(row => <Pressable key={row.label} accessibilityRole="button" accessibilityLabel={row.label} disabled={busy} onPress={() => { if (row.label !== "Log Out") onClose?.(); row.act(); }} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}><Icon name={row.icon} size={28}/><Text style={{ color: colors.ink, fontSize: 14, flex: 1 }}>{row.label}</Text><Icon name="chevron-forward" size={16} line /></Pressable>)}</View>
    {error ? <Notice>{error}</Notice> : null}
  </ScrollView>;
}
