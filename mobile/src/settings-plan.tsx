import { planCardLayout } from "./adaptive-layout";
import { isStoreOwnershipConflict, STORE_OWNERSHIP_MESSAGE, isPurchaseCancelled, purchaseFeedback, purchaseVerified, purchaseNeedsVerification, storeErrorMessage, type PurchaseIntent } from './store-change-policy';
import { catalogStorePrice, planManagement, storePriceLabel, storeVerificationMessage } from "./store-presentation";
import { tokenUsagePercent } from "./recorded-summary";
import { RETENTION_MESSAGE, DOWNGRADE_MESSAGE, type RetentionSnapshot } from "../../shared/plan-retention";
import { PlanCardSurface } from "./plan-card-surface";
import { SettingsSwitchOffer } from "./settings-switch-offer";
import { SettingsReferrals } from "./settings-referrals";
import { telemetry } from "../../shared/analytics";
import { PLAN_CATALOG } from "../../shared/plan-catalog";
import * as WebBrowser from "expo-web-browser";
import { STORE_PACKAGES } from "../../shared/store-catalog";
import { Text } from "./app-text";
import { useEffect, useRef, useState } from "react";
import { Alert, AppState, Linking, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useSession } from "./session";
import { Body, Card, Icon, Notice, useTheme } from "./ui";
import {
  canUseStore,
  canRecoverStorePurchase,
  recoverStorePurchase,
  googleStoreManagementUrl,
  loadStorePackages,
  manageAppleStoreSubscription,
  purchaseStorePackage,
  restoreStorePurchases,
  type StoreStatus,
} from "./store-billing";
type Usage = Record<"profiles" | "accounts" | "monthly" | "rolling24h", { used: number; limit: number | null }>;
export function SettingsPlan() {
  const session = useSession();
  const { colors, styles } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(0);
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({});
  const { width: cardWidth, columns: planColumns } = planCardLayout(contentWidth || Math.min(width - 32, 1072), fontScale);
  const cardLayoutKey = `${cardWidth}:${fontScale}`;
  const carouselHeight = Math.max(1, ...Object.entries(cardHeights).filter(([key]) => key.startsWith(`${cardLayoutKey}:`)).map(([, height]) => height));
  const [usage, setUsage] = useState<(Usage & { retention?: RetentionSnapshot }) | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [period, setPeriod] = useState<"P1M" | "P1Y">("P1M");
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [verificationPending, setVerificationPending] = useState(false);
  const [ownershipConflict, setOwnershipConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const locked = useRef(false);
  const dialogOpen = useRef(false);
  const purchaseIntent = useRef<PurchaseIntent | null>(null);
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
    setOwnershipConflict(false);
    setVerificationPending(false);
    purchaseIntent.current = null;
    setLoading(true);
    void session
      .request<StoreStatus>("billing/store")
      .then(async (result) => {
        if (!active) return;
        if (canUseStore(result)) {
          setStatus(result);
          const choices = await loadStorePackages(result);
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
  const act = async (run?: () => Promise<void | PurchaseIntent>, restoring = false, silent = false, recovering = false) => {
    if (locked.current || session.demo) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage(recovering ? "Verifying your purchase with Apple…" : "");
    try {
      if (run) setVerificationPending(true);
      const intent = await run?.();
      if (intent) purchaseIntent.current = intent;
      const next = await session.request<StoreStatus>(
        "billing/store",
        status && canUseStore(status) ? { method: "POST", body: "{}" } : undefined,
      );
      if (!mounted.current) return;
      setStatus(next);
      // A successful server refresh can still be Free because the receipt is
      // owned elsewhere. Only a successful explicit restore resolves that issue.
      if (restoring) setOwnershipConflict(false);
      const intentToVerify = purchaseIntent.current;
      const pending = Boolean(intentToVerify?.effect === 'immediate' && !purchaseVerified(next, intentToVerify));
      setVerificationPending(pending);
      session.refresh();
      if (restoring) telemetry("billing_restored", { plan_tier: next.planTier, verified_access: next.planTier !== "free" });
      setMessage(recovering ? (next.hasPaidSubscription ? "Your purchase is recovered. Your plan is ready to use." : "Your purchase is recovered. It has expired, so you can choose a new plan.") : ownershipConflict && !restoring ? "" : intentToVerify ? purchaseFeedback(next, intentToVerify) : storeVerificationMessage(next.planTier, silent ? "silent" : restoring ? "restore" : run ? "purchase" : "refresh"));
      if (intentToVerify && purchaseVerified(next, intentToVerify)) purchaseIntent.current = null;
      // Refresh also retries a failed initial offering load, without repeating a purchase.
      if (!run && canUseStore(next)) {
        try { const choices = await loadStorePackages(next); if (mounted.current) setPackages(choices); }
        catch { if (mounted.current && !silent) setError('Your plan was refreshed, but store prices could not load. Try Refresh plan status again.'); }
      }
    } catch (e) {
      if (mounted.current) {
        setMessage("");
        // A canceled/failed confirmation must not permanently disable the cards.
        // Every retry checks fresh store ownership before opening another purchase.
        if (isStoreOwnershipConflict(e)) {
          setOwnershipConflict(true);
          purchaseIntent.current = null;
          setVerificationPending(false);
        } else {
          setVerificationPending(Boolean(purchaseIntent.current?.effect === 'immediate') || Boolean(run && purchaseNeedsVerification(e)));
          if (!silent && !isPurchaseCancelled(e))
            setError(run ? storeErrorMessage(e) : 'Unable to refresh plan status. Please try again.');
        }
      }
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
      if (next === "active" && previous !== "active") void refreshStoreRef.current(undefined, false, true);
      previous = next;
    });
    return () => subscription.remove();
  }, []);
  const manageAppleSubscription = async () => {
    if (!status || locked.current || session.demo) return;
    locked.current = true;
    setBusy(true); setError(""); setMessage("");
    let dismissed = false;
    try {
      await manageAppleStoreSubscription(status);
      dismissed = true;
    } catch {
      if (mounted.current) setError("Unable to open Apple subscription management. Please try again.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
    // The native sheet may close without an AppState transition. Always re-verify after dismissal.
    if (dismissed && mounted.current) await act(undefined, false, true);
  };
  const access = status ?? session.data?.entitlement;
  const limits = access ? PLAN_CATALOG[access.planTier] : null;
  const showUsageInfo = () => Alert.alert("Plan usage", "Cloud parsing and Ask Clover use Clover tokens. On-device processing is not counted. Monthly Clover tokens reset on the first day of each month in Asia/Manila. Unused tokens do not roll over. The 24-hour allowance is a rolling window. Cash accounts do not count toward the account limit. Linked bank slots remain reserved after unlinking until the next monthly period.\n\n" + RETENTION_MESSAGE + "\n\n" + DOWNGRADE_MESSAGE);
  const manageGoogleSubscription = async () => {
    if (!status || locked.current || session.demo) return;
    locked.current = true; setBusy(true); setError('');
    try { await Linking.openURL(await googleStoreManagementUrl(status)); }
    catch { if (mounted.current) setError('Open Google Play, then Payments & subscriptions, to manage Clover.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const showManagement = (tier: "free" | "pro" | "premium") => {
    if (!status || dialogOpen.current || locked.current || session.demo) return;
    const management = planManagement(status, Platform.OS, tier);
    dialogOpen.current = true;
    const close = () => { dialogOpen.current = false; };
    Alert.alert(management.title, management.message, management.nativeSheet || management.url ? [
      { text: 'Cancel', style: 'cancel', onPress: close },
      { text: 'Open subscriptions', onPress: () => { close(); void (management.nativeSheet ? manageAppleSubscription() : manageGoogleSubscription()); } },
    ] : [{ text: 'OK', onPress: close }], { cancelable: true, onDismiss: close });
  };
  const switchPlan = (tier: "free" | "pro" | "premium") => {
    if (busy || loading || ownershipConflict || locked.current || dialogOpen.current || session.demo) return;
    setMessage(''); setError('');
    if (!status) { setError('Plan details are still loading. Please try again.'); return; }
    const paid = status.hasPaidSubscription === true || (status.hasPaidSubscription !== false && status.planTier !== 'free');
    if (tier === 'free' || (paid && !(Platform.OS === 'android' && status.billingProvider === 'play_store'))) {
      showManagement(tier); return;
    }
    const choices = packages.filter(item => STORE_PACKAGES.find(p => p.identifier === item.identifier)?.tier === tier);
    if (!canUseStore(status) || !choices.length) { setError('Store plans are not available yet. Use Refresh plan status to try again.'); return; }
    const changingPeriod = tier === status.planTier && paid;
    const explanation = paid
      ? 'Choose a billing period. Upgrades take effect immediately; downgrades take effect at renewal. A billing-period change within your current plan changes the price at your next billing date. Google Play shows the final terms before you confirm.'
      : 'Choose a billing period. The store will ask you to confirm the purchase.';
    dialogOpen.current = true;
    const close = () => { dialogOpen.current = false; };
    Alert.alert(changingPeriod ? 'Change billing period' : `Switch to ${PLAN_CATALOG[tier].name}`, explanation, [
      ...choices.map(item => ({ text: storePriceLabel(item.product), onPress: () => { close(); void act(() => purchaseStorePackage(status, item, () => session.request<StoreStatus>("billing/store", { method: "POST", body: "{}" }))); } })),
      { text: 'Cancel', style: 'cancel', onPress: close },
    ], { cancelable: true, onDismiss: close });
  };
  return <>
    <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 24 }}>Clover {limits?.name ?? "Free"}</Text>
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.sectionTitle}>Plan usage</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="About plan usage" onPress={showUsageInfo} style={{ padding: 12 }}><Icon line name="information-circle-outline" size={16} color={colors.muted} /></Pressable>
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
          <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 16 }} adjustsFontSizeToFit numberOfLines={1}>{label.startsWith("Clover tokens") ? tokenUsagePercent(meter) : meter ? `${meter.used.toLocaleString()} / ${meter.limit === null ? "Unlimited" : meter.limit.toLocaleString()}` : "—"}</Text>
        </View>)}
      </View>
      {usageError ? <Notice>Usage could not be loaded. Refresh plan status to try again.</Notice> : null}
    </Card>
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 12 }}>
      {(["P1M", "P1Y"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: period === value }} onPress={() => setPeriod(value)} style={{ paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.teal, backgroundColor: period === value ? colors.teal : colors.white }}><Text style={{ color: period === value ? "white" : colors.teal }}>{value === "P1Y" ? "Yearly" : "Monthly"}</Text></Pressable>)}
    </View>
    <View onLayout={event => setContentWidth(event.nativeEvent.layout.width)}>
    <ScrollView horizontal directionalLockEnabled automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" bounces={false} alwaysBounceVertical={false} alwaysBounceHorizontal={false} disableIntervalMomentum showsHorizontalScrollIndicator={false} scrollEnabled={planColumns < 3} snapToInterval={cardWidth + 16} decelerationRate="fast" style={{ flexGrow: 0, flexShrink: 0, ...(carouselHeight > 1 ? { height: carouselHeight } : {}) }} contentContainerStyle={{ gap: 16, alignItems: "flex-start" }} accessibilityLabel="Plans: Pro, Plus, Free">
      {(["premium", "pro", "free"] as const).map(tier => {
        const plan = PLAN_CATALOG[tier];
        const choice = packages.find(item => STORE_PACKAGES.find(p => p.identifier === item.identifier)?.tier === tier && item.product.subscriptionPeriod === period);
        return <PlanCardSurface key={`${cardLayoutKey}:${tier}`} tier={tier} width={cardWidth} minHeight={carouselHeight > 1 ? carouselHeight : undefined} onHeight={height => setCardHeights(current => current[`${cardLayoutKey}:${tier}`] === height ? current : { ...current, [`${cardLayoutKey}:${tier}`]: height })}>
          <View style={{ padding: 20, gap: 8 }}>
            <Text style={{ fontFamily: "Poppins-SemiBold", fontSize: 24, color: "#153b42" }}>{plan.name}</Text>
            <Text style={{ color: "#153b42" }}>{tier === "free" ? "Free forever" : choice ? storePriceLabel(choice.product) : catalogStorePrice(tier, period)}</Text>
            {access?.planTier === tier ? <Text style={{ color: "#153b42" }}>Current plan</Text> : null}
          </View>
          <View style={{ padding: 20, gap: 14 }}>
            {[`${plan.profiles} profiles · ${plan.accounts} non-cash accounts`, `${plan.linkedBanks} linked bank accounts`, `${plan.budgets} budgets · ${plan.goals} goals · ${plan.circles} Circles`, `${plan.monthlyTokens.toLocaleString()} Clover tokens monthly`, `${plan.dailyTokens.toLocaleString()} tokens per rolling 24 hours`, tier === "free" ? "Basic Ask Clover and Reports" : "Advanced Ask Clover and Reports"].map(feature => <Text key={feature} style={{color: "#153b42", fontSize: 13, lineHeight: 21}}>✓  {feature}</Text>)}
            {access?.planTier !== tier || (tier !== "free" && status?.hasPaidSubscription === true) ? <Text accessibilityRole="button" accessibilityState={{ disabled: busy || loading || verificationPending || ownershipConflict || session.demo }} disabled={busy || loading || verificationPending || ownershipConflict || session.demo} onPress={() => switchPlan(tier)} style={{ color: "#153b42", paddingVertical: 8, fontFamily: "Poppins-SemiBold" }}>{access?.planTier === tier ? "Change billing period" : `Switch to ${plan.name}`} →</Text> : null}
          </View>
        </PlanCardSurface>;
      })}
    </ScrollView>
    </View>
    <SettingsSwitchOffer />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
      {status?.hasPaidSubscription === true ? <Text accessibilityRole="button" disabled={busy || loading} onPress={() => showManagement('free')} style={{ color: colors.teal }}>Manage subscription</Text> : null}
      {status && canUseStore(status) ? <Text accessibilityRole="button" disabled={busy || loading} onPress={() => void act(() => restoreStorePurchases(status), true)} style={{ color: colors.teal }}>Restore purchases</Text> : null}
      <Text accessibilityRole="button" disabled={busy || loading || session.demo} onPress={() => void act()} style={{ color: colors.teal }}>Refresh plan status</Text>
    </View>
    {ownershipConflict ? <Card>
      <Notice>{status && canRecoverStorePurchase(status) ? "This purchase is linked to another Clover account. If you deleted that account, you can recover the purchase here." : STORE_OWNERSHIP_MESSAGE}</Notice>
      {status && canRecoverStorePurchase(status) ? <Text accessibilityRole="button" disabled={busy || loading} style={{ color: colors.teal }} onPress={() => Alert.alert("Recover your store purchase?", "Move the purchase from your deleted Clover account to this account. Its cancellation and expiry stay the same. Deleted financial data stays deleted.", [
        { text: "Cancel", style: "cancel" },
        { text: "Recover purchase", onPress: () => void act(() => recoverStorePurchase(status, signedTransaction => session.request("billing/store/recover", { method: "POST", body: JSON.stringify({ signedTransaction }) })), true, false, true) },
      ])}>Recover purchase</Text> : null}
      <Text accessibilityRole="link" style={{ color: colors.teal }} onPress={() => void WebBrowser.openBrowserAsync("https://clover.ph/contact-us").catch(() => setError("Visit clover.ph/contact-us for help with your purchase."))}>Contact Clover support</Text>
    </Card> : null}
    {message ? <Body>{message}</Body> : null}
    {error ? <Notice>{error}</Notice> : null}
    <SettingsReferrals />
    <View style={{ flexDirection: "row", justifyContent: "center", gap: 24, paddingVertical: 24 }}>
      {[{ label: "Terms", path: "terms-of-service" }, { label: "Privacy Policy", path: "privacy-policy" }].map(item => <Text key={item.path} accessibilityRole="link" style={{ color: colors.teal }} onPress={() => void WebBrowser.openBrowserAsync(`https://clover.ph/${item.path}`).catch(() => setError(`Unable to open ${item.label}.`))}>{item.label}</Text>)}
    </View>
  </>;
}
