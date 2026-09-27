import { RETENTION_MESSAGE, DOWNGRADE_MESSAGE, type RetentionSnapshot } from "../../shared/plan-retention";
import { SettingsReferrals } from "./settings-referrals";
import { telemetry } from "../../shared/analytics";
import { PLAN_CATALOG } from "../../shared/plan-catalog";
import * as WebBrowser from "expo-web-browser";
import { STORE_PACKAGES } from "../../shared/store-catalog";
import { Text } from "./app-text";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useSession } from "./session";
import { Body, Card, Icon, Notice, useTheme } from "./ui";
import {
  canUseStore,
  loadStorePackages,
  purchaseStorePackage,
  restoreStorePurchases,
  storeManagementUrl,
  type StoreStatus,
} from "./store-billing";
type Usage = Record<"profiles" | "accounts" | "monthly" | "rolling24h", { used: number; limit: number | null }>;
export function SettingsPlan() {
  const session = useSession();
  const { colors, styles } = useTheme();
  const { width } = useWindowDimensions();
  const [usage, setUsage] = useState<(Usage & { retention?: RetentionSnapshot }) | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [verificationPending, setVerificationPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  const mounted = useRef(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (session.demo) { setLoading(false); return; }
    setLoading(true);
    void session
      .request<StoreStatus>("billing/store")
      .then(async (result) => {
        if (!active) return;
        if (canUseStore(result)) {
          const verified = await session.request<StoreStatus>("billing/store", { method: "POST", body: "{}" });
          if (!active) return;
          setStatus(verified);
          const choices = await loadStorePackages(verified);
          if (active) setPackages(choices);
        } else setStatus(result);
      })
      .catch(() => {
        if (active) setError("Unable to load store plans. Please try again.");
      }).finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
    };
  }, [session.demo, session.request]);
  useEffect(() => {
    let active = true;
    if (session.demo) return;
    setUsage(null);
    setUsageError(false);
    void session.request<Usage & { retention?: RetentionSnapshot }>("billing/usage").then((value) => {
      if (active) setUsage(value);
    }).catch(() => { if (active) setUsageError(true); });
    return () => { active = false; };
  }, [session.demo, session.request, status]);
  const act = async (run?: () => Promise<void>, restoring = false) => {
    if (locked.current || session.demo) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (run) setVerificationPending(true);
      await run?.();
      const next = await session.request<StoreStatus>(
        "billing/store",
        status && canUseStore(status) ? { method: "POST", body: "{}" } : undefined,
      );
      if (!mounted.current) return;
      setStatus(next);
      if ((next.planTier === "pro" || next.planTier === "premium")) setVerificationPending(false);
      session.refresh();
      if (restoring) telemetry("billing_restored", { plan_tier: next.planTier, verified_access: next.planTier !== "free" });
      setMessage(
        (next.planTier === "pro" || next.planTier === "premium")
          ? `Clover ${PLAN_CATALOG[next.planTier].name} access verified.`
          : "No active Clover Plus or Pro purchase was found for this account.",
      );
    } catch (e) {
      if (mounted.current && e && typeof e === "object" && "userCancelled" in e && e.userCancelled) setVerificationPending(false);
      if (
        mounted.current &&
        !(e && typeof e === "object" && "userCancelled" in e && e.userCancelled)
      )
        setError(
          run
            ? "Your purchase status could not be verified. Use Restore purchases before buying again."
            : "Unable to refresh plan status.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const refreshStoreRef = useRef(act);
  refreshStoreRef.current = act;
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active" && previous !== "active") void refreshStoreRef.current();
      previous = next;
    });
    return () => subscription.remove();
  }, []);
  const access = status ?? session.data?.entitlement;
  const limits = access ? PLAN_CATALOG[access.planTier] : null;
  const showUsageInfo = () => Alert.alert("Plan usage", "Monthly Clover tokens reset on the first day of each month in Asia/Manila. Unused tokens do not roll over. The 24-hour allowance is a rolling window. Cash accounts do not count toward the account limit. Linked bank slots remain reserved after unlinking until the next monthly period.\n\n" + RETENTION_MESSAGE + "\n\n" + DOWNGRADE_MESSAGE);
  const switchPlan = (tier: "free" | "pro" | "premium") => {
    if (tier === access?.planTier || busy || loading || session.demo) return;
    if (access?.planTier !== "free" || tier === "free") {
      const url = storeManagementUrl();
      if (url) void Linking.openURL(url).catch(() => setError("Open subscriptions in your device's store settings."));
      else setError("Manage your subscription with your original billing provider.");
      return;
    }
    const choices = packages.filter(item => STORE_PACKAGES.find(p => p.identifier === item.identifier)?.tier === tier);
    if (!status || !canUseStore(status) || !choices.length) { setError("Store plans are not available yet. Please try again later."); return; }
    Alert.alert(`Switch to ${PLAN_CATALOG[tier].name}`, "Choose a billing period. The store will ask you to confirm the purchase.", [
      ...choices.map(item => ({ text: `${item.product.priceString} / ${item.product.subscriptionPeriod === "P1Y" ? "year" : "month"}`, onPress: () => void act(() => purchaseStorePackage(status, item)) })),
      { text: "Cancel", style: "cancel" },
    ]);
  };
  return <>
    <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 24 }}>Clover {limits?.name ?? "Free"}</Text>
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.sectionTitle}>Plan usage</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="About plan usage" onPress={showUsageInfo} style={{ padding: 12 }}><Icon name="information-circle-outline" size={16} color={colors.muted} /></Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          { label: "Profiles", meter: usage?.profiles },
          { label: "Accounts", meter: usage?.accounts },
          { label: "Clover tokens this month", meter: usage?.monthly },
          { label: "Clover tokens, rolling 24h", meter: usage?.rolling24h },
          ...(["budgets", "goals", "circles"] as const).map(key => ({ label: key[0].toUpperCase() + key.slice(1), meter: usage?.retention ? { used: usage.retention.usage[key], limit: usage.retention.limits[key] === undefined ? PLAN_CATALOG[usage.retention.planTier][key] : usage.retention.limits[key]! } : undefined })),
          { label: "Linked Banks", meter: usage?.retention?.linkedBanks },
        ].map(({ label, meter }) => <View key={label} style={{ flexBasis: "45%", flexGrow: 1, minWidth: 0, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 12, gap: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
          <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 16 }} adjustsFontSizeToFit numberOfLines={1}>{meter ? `${meter.used.toLocaleString()} / ${meter.limit === null ? "Unlimited" : meter.limit.toLocaleString()}` : "—"}</Text>
        </View>)}
      </View>
      {usageError ? <Notice>Usage could not be loaded. Refresh plan status to try again.</Notice> : null}
    </Card>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={Math.max(240, width - 64) + 16} decelerationRate="fast" contentContainerStyle={{ gap: 16 }} accessibilityLabel="Plans: Pro, Plus, Free">
      {(["premium", "pro", "free"] as const).map(tier => {
        const plan = PLAN_CATALOG[tier];
        const choice = packages.find(item => STORE_PACKAGES.find(p => p.identifier === item.identifier)?.tier === tier);
        return <View key={tier} style={{ width: Math.max(240, width - 64), borderWidth: 1, borderColor: colors.line, borderRadius: 20, overflow: "hidden" }}>
          <View style={{ padding: 20, backgroundColor: tier === "free" ? colors.line : tier === "pro" ? "#6ee7b7" : colors.teal, gap: 8 }}>
            <Text style={{ fontFamily: "Poppins-SemiBold", fontSize: 24, color: tier === "free" ? colors.ink : tier === "pro" ? "#17383d" : "white" }}>{plan.name}</Text>
            <Text style={{ color: tier === "free" ? colors.ink : tier === "pro" ? "#17383d" : "white" }}>{tier === "free" ? "Free forever" : choice ? `${choice.product.priceString} / ${choice.product.subscriptionPeriod === "P1Y" ? "year" : "month"}` : "See store pricing"}</Text>
            {access?.planTier === tier ? <Text style={{ color: tier === "free" ? colors.ink : tier === "pro" ? "#17383d" : "white" }}>Current plan</Text> : null}
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            {[`${plan.profiles} profiles · ${plan.accounts} non-cash accounts`, `${plan.linkedBanks} linked bank accounts`, `${plan.budgets} budgets · ${plan.goals} goals · ${plan.circles} Circles`, `${plan.monthlyTokens.toLocaleString()} Clover tokens monthly`, `${plan.dailyTokens.toLocaleString()} tokens per rolling 24 hours`, tier === "free" ? "Basic Adviser and Reports" : "Advanced Adviser and Reports"].map(feature => <Body key={feature}>{feature}</Body>)}
            {access?.planTier !== tier ? <Text accessibilityRole="button" accessibilityState={{ disabled: busy || loading || verificationPending || session.demo }} disabled={busy || loading || verificationPending || session.demo} onPress={() => switchPlan(tier)} style={{ color: colors.teal, paddingVertical: 8 }}>Switch to {plan.name} →</Text> : null}
          </View>
        </View>;
      })}
    </ScrollView>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
      {status && canUseStore(status) ? <Text accessibilityRole="button" disabled={busy || loading} onPress={() => void act(() => restoreStorePurchases(status), true)} style={{ color: colors.teal }}>Restore purchases</Text> : null}
      <Text accessibilityRole="button" disabled={busy || loading || session.demo} onPress={() => void act()} style={{ color: colors.teal }}>Refresh plan status</Text>
    </View>
    {message ? <Body>{message}</Body> : null}
    {error ? <Notice>{error}</Notice> : null}
    <SettingsReferrals />
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, paddingVertical: 24 }}>
      {[{ label: "Terms", path: "terms-of-service" }, { label: "Privacy Policy", path: "privacy-policy" }].map(item => <Text key={item.path} accessibilityRole="link" style={{ color: colors.teal }} onPress={() => void WebBrowser.openBrowserAsync(`https://clover.ph/${item.path}`).catch(() => setError(`Unable to open ${item.label}.`))}>{item.label}</Text>)}
    </View>
  </>;
}
