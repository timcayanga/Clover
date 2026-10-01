import { useCallback, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { SWITCH_PATH } from "../../shared/switch-campaign";
import { telemetry } from "../../shared/analytics";
import { apiBase } from "./api-base";
import { Text } from "./app-text";
import { useSession } from "./session";
import { Notice, useTheme } from "./ui";

export function SettingsSwitchOffer() {
  const { demo } = useSession();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const check = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`${apiBase()}/api/campaigns/switch-offer`, { cache: "no-store", signal });
    if (!response.ok) return false;
    return (await response.json()).open === true;
  }, []);
  useFocusEffect(useCallback(() => {
    if (demo) return;
    const controller = new AbortController();
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      setOpen(false);
      void check(controller.signal).then(value => { if (!controller.signal.aborted && request === revision) setOpen(value); }).catch(() => {});
    };
    refresh();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => { controller.abort(); subscription.remove(); };
  }, [demo, check]));
  const show = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      // Recheck before navigating so a recently paused campaign cannot advertise an open offer.
      if (!(await check())) { setOpen(false); return; }
      telemetry("campaign_progress", { campaign_stage: "offer_clicked", campaign_id: "switch-to-clover" });
      await WebBrowser.openBrowserAsync(`${apiBase()}${SWITCH_PATH}`);
    } catch { setError("Unable to open the offer. Please try again."); }
    finally { setBusy(false); }
  };
  if (demo || !open) return null;
  return <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 16, gap: 8 }}>
    <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 13 }}>Already paid for another budgeting app?</Text>
    <Pressable accessibilityRole="link" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void show()} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: colors.teal, fontSize: 13 }}>See offer →</Text>
    </Pressable>
    {error ? <Notice>{error}</Notice> : null}
  </View>;
}
