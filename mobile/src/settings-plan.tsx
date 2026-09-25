import { retainedPlanRows, RETENTION_MESSAGE, DOWNGRADE_MESSAGE, type RetentionSnapshot } from "../../shared/plan-retention";
import { SettingsReferrals } from "./settings-referrals";
import { telemetry } from "../../shared/analytics";
import { PLAN_CATALOG } from "../../shared/plan-catalog";
import { Text } from "./app-text";
import { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { useSession } from "./session";
import { Body, Button, Card, Notice, dateLabel, useTheme } from "./ui";
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
  const [previewTier, setPreviewTier] = useState<"free" | "pro" | "premium" | null>(null);
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
  const access = status ?? session.data?.entitlement;
  const limits = access ? PLAN_CATALOG[access.planTier] : null;
  return (
    <>
      <Card>
        <Text
          style={{
            color: colors.teal,
            fontFamily: "Poppins-SemiBold",
            fontSize: 24,
          }}
        >
          {(access?.planTier === "pro" || access?.planTier === "premium") ? (access?.planTier === "premium" ? "Clover Pro" : "Clover Plus") : "Clover Free"}
        </Text>
        {limits ? <Body>{limits.linkedBanks} linked bank accounts · {limits.budgets} active budgets · {limits.goals} goals · {limits.circles} Circles.</Body> : null}
        <Body>Your plan belongs to your Clover account across devices.</Body>
        {access?.accessEndsAt ? (
          <Body>Access through {dateLabel(access.accessEndsAt)}</Body>
        ) : null}
        {access?.renewing ? (
          <Body>Manage renewal through your original billing provider.</Body>
        ) : null}
        {status && canUseStore(status) ? (
          <>
            {(access?.planTier !== "pro" && access?.planTier !== "premium")
              ? packages.map((item) => (
                  <Button
                    key={item.identifier}
                    disabled={loading || busy || verificationPending}
                    title={`${item.product.title} · ${item.product.priceString} / ${item.product.subscriptionPeriod === "P1Y" ? "year" : "month"}`}
                    onPress={() =>
                      void act(() => purchaseStorePackage(status, item))
                    }
                  />
                ))
              : null}
            {!packages.length && (access?.planTier !== "pro" && access?.planTier !== "premium") ? (
              <Body>No store plans are currently available.</Body>
            ) : null}
            <Button
              secondary
              disabled={loading || busy}
              title={busy ? "Checking…" : "Restore purchases"}
              onPress={() => void act(() => restoreStorePurchases(status), true)}
            />
          </>
        ) : (
          <Body>
            Store purchases and restoration will be available after store setup.
            Existing Clover Plus or Pro access is recognized when you sign in.
          </Body>
        )}
        <Button
          title="Refresh plan status"
          secondary
          disabled={loading || busy || session.demo}
          onPress={() => void act()}
        />
        {storeManagementUrl() ? (
          <Button
            title="Manage store subscriptions"
            secondary
            disabled={loading || busy}
            onPress={() =>
              void Linking.openURL(storeManagementUrl()!).catch(() =>
                setError("Open subscriptions in your device's store settings."),
              )
            }
          />
        ) : null}
      </Card>
      {limits ? (
        <Card>
          <Text style={styles.sectionTitle}>Plan usage</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {[
              { label: "Profiles", value: limits.profiles, meter: usage?.profiles },
              { label: "Accounts", value: limits.accounts, meter: usage?.accounts },
              { label: "Clover tokens this month", value: limits.monthlyTokens, meter: usage?.monthly },
              { label: "Clover tokens, rolling 24h", value: limits.dailyTokens, meter: usage?.rolling24h },
            ].map(({ label, value, meter }) => (
              <View
                key={label}
                style={{
                  flexBasis: "45%", flexGrow: 1, minWidth: 0,
                  borderWidth: 1, borderColor: colors.line,
                  borderRadius: 16, padding: 12, gap: 8,
                }}
              >
                <Text style={{ color: colors.muted, fontFamily: "Poppins-SemiBold", fontSize: 13 }}>
                  {label}
                </Text>
                <Text
                  style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 19 }}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {meter ? `${meter.used.toLocaleString()} / ${meter.limit === null ? "Unlimited" : meter.limit.toLocaleString()}` : value.toLocaleString()}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {meter ? "used" : "limit"}
                </Text>
              </View>
            ))}
          </View>
          {usageError ? <Notice>Usage could not be loaded. Refresh plan status to try again.</Notice> : null}
          <Body>Monthly tokens reset on the first day of each month in Asia/Manila. Unused tokens do not roll over. Cash accounts do not count toward the account limit.</Body>
        </Card>
      ) : null}
      <Card>
        <Text style={styles.sectionTitle}>Changing plans</Text>
        <Body>{RETENTION_MESSAGE}</Body>
        <Body>{DOWNGRADE_MESSAGE}</Body>
        {usage?.retention ? <>
          <Body>Preview plan limits. This does not change your subscription.</Body>
          {(["premium", "pro", "free"] as const).map(tier => <Button key={tier} secondary title={`${PLAN_CATALOG[tier].name}${tier === usage.retention!.planTier ? " (current)" : ""}`} onPress={() => setPreviewTier(tier)} />)}
          <Body>{PLAN_CATALOG[previewTier ?? usage.retention.planTier].name} usage and limits</Body>
          {retainedPlanRows(usage.retention.usage, previewTier ?? usage.retention.planTier, !previewTier || previewTier === usage.retention.planTier ? usage.retention.limits : {}).map(row => <Body key={row.key}>{row.label}: {row.used} / {row.limit === null ? "Unlimited" : row.limit}{row.excess > 0 ? ` — ${row.excess} above limit. Existing items stay usable; creating more requires room or an upgrade.` : !row.canCreate ? " — At limit. Existing items stay usable." : ""}</Body>)}
          <Body>Investments count by institution. Only active budgets and non-archived Circles you own count. All saved personal goals count. Reactivating a budget needs an available slot.</Body>
        </> : <Body>{usageError ? "Usage unavailable. Refresh plan status to try again." : session.demo ? "Sign in to preview your account usage." : "Loading plan usage…"}</Body>}
      </Card>
      {packages.length ? (
        <Body>
          Subscriptions renew automatically until canceled in your store
          settings. The store confirmation shows the billing period and final
          local price.
        </Body>
      ) : null}
      <SettingsReferrals />
      {message ? <Body>{message}</Body> : null}
      {error ? <Notice>{error}</Notice> : null}
    </>
  );
}
