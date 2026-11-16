import { requireOptionalNativeModule } from "expo-modules-core";
import * as SecureStore from "expo-secure-store";
import { mostUsedTransactionAccount } from "../../shared/default-transaction-account";
import { useEffect } from "react";
import { Platform } from "react-native";
import type { useSession } from "./session";

const bridge = Platform.OS === "ios" ? requireOptionalNativeModule<{
  setWidgetSnapshot(value: string | null): Promise<void>;
}>("CloverLauncher") : null;

export const hiddenBalancesKey = "clover.home.hide-balances";
let snapshotGeneration = 0;

export function clearWidgetSnapshot() {
  snapshotGeneration += 1;
  return bridge?.setWidgetSnapshot(null).catch(() => {});
}

type WidgetAccount = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  currency: string;
  balance: string | null;
  displayBalance?: string | null;
  transactionCount?: number;
};

export function useWidgetSnapshot({ profileId, demo, request, data }: ReturnType<typeof useSession>, enabled: boolean) {
  const currency = data?.defaultCurrency;
  useEffect(() => {
    void clearWidgetSnapshot();
  }, [enabled, demo, profileId]);
  useEffect(() => {
    if (!bridge || !enabled || demo || !profileId || !currency) return;
    const controller = new AbortController();
    const generation = ++snapshotGeneration;
    const query = `workspaceId=${encodeURIComponent(profileId)}`;
    const refresh = async () => {
      if (await SecureStore.getItemAsync(hiddenBalancesKey) === "true" || controller.signal.aborted) return;
      const [{ accounts }, home] = await Promise.all([
        request<{ accounts: WidgetAccount[] }>(`accounts?${query}`, { signal: controller.signal }),
        request<{ balance: number | null }>(`home?${query}&currency=ALL&section=overview`, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted || generation !== snapshotGeneration) return;
      const format = (value: number | null, code: string) => value !== null && Number.isFinite(value)
        ? new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(value)
        : "—";
      const preferred = mostUsedTransactionAccount(accounts);
      const visibleAccounts = accounts.slice(0, 40);
      if (preferred && !visibleAccounts.includes(preferred)) visibleAccounts[39] = preferred;
      return bridge.setWidgetSnapshot(JSON.stringify({
        workspace: profileId,
        currency,
        total: format(home.balance, currency),
        defaultAccountId: preferred?.id,
        accounts: visibleAccounts.map(account => {
          const balance = account.displayBalance === undefined ? account.balance : account.displayBalance;
          return {
            id: account.id,
            name: account.name,
            currency: account.currency,
            balance: format(balance === null ? null : Number(balance), account.currency),
            isBPI: /^(bpi|bank of the philippine islands)$/i.test(account.institution ?? ""),
          };
        }),
      }));
    };
    void refresh().catch(() => {});
    return () => controller.abort();
  }, [enabled, demo, profileId, currency, request, data]);
}
