import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess } from "../src/access";
import { useSession } from "../src/session";
import { CloverMascot } from "../src/clover-mascot";
import { Text } from "../src/app-text";
import { Button, Notice, useTheme } from "../src/ui";

export default function AccountDeleted() {
  const access = useAccess();
  const session = useSession();
  const { colors, styles } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const continueToClover = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Account deletion is already confirmed by the server. Clear this device's
      // session even when an interrupted cleanup left a local Clerk session.
      if (access.active) await session.signOut({ accountDeleted: true });
      access.dismissAccountDeleted();
    } catch {
      setError("Your account is deleted. Please try again to finish signing out of this device.");
    } finally { setBusy(false); }
  };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 28, paddingTop: 28 + insets.top, paddingBottom: 28 + insets.bottom }}>
    <View style={{ width: "100%", maxWidth: 420, alignItems: "center", gap: 20 }}>
      <CloverMascot pose="reassuring" size={160} />
      <Text accessibilityRole="header" style={[styles.heading, { textAlign: "center" }]}>Your account is deleted</Text>
      <Text style={[styles.body, { textAlign: "center" }]}>Thanks for spending time with Clover. You’re welcome back whenever you’re ready.</Text>
      {error ? <Notice>{error}</Notice> : null}
      <View style={{ width: "100%" }}><Button title={busy ? "One moment…" : "Back to Clover"} disabled={busy} onPress={() => void continueToClover()} /></View>
    </View>
  </ScrollView>;
}
