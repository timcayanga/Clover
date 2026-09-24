import { PLAN_CATALOG } from "../../shared/plan-catalog";
import { Text } from "./app-text";
import { useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
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
export function SettingsPlan() {
  const session = useSession();
  const { colors } = useTheme();
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
  const act = async (run?: () => Promise<void>) => {
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
      setMessage(
        (next.planTier === "pro" || next.planTier === "premium")
          ? "Clover Plus access verified."
          : "No active Clover Plus purchase was found for this account.",
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
        {access ? <Body>{PLAN_CATALOG[access.planTier].accounts} accounts · {PLAN_CATALOG[access.planTier].profiles} Profiles · {PLAN_CATALOG[access.planTier].linkedBanks} linked bank accounts. {PLAN_CATALOG[access.planTier].budgets} active budgets · {PLAN_CATALOG[access.planTier].goals} goals · {PLAN_CATALOG[access.planTier].circles} Circles. {PLAN_CATALOG[access.planTier].monthlyTokens.toLocaleString()} shared AI tokens monthly; {PLAN_CATALOG[access.planTier].dailyTokens.toLocaleString()} per rolling 24 hours.</Body> : null}
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
              onPress={() => void act(() => restoreStorePurchases(status))}
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
      {packages.length ? (
        <Body>
          Subscriptions renew automatically until canceled in your store
          settings. The store confirmation shows the billing period and final
          local price.
        </Body>
      ) : null}
      {message ? <Body>{message}</Body> : null}
      {error ? <Notice>{error}</Notice> : null}
    </>
  );
}
