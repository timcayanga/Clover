import { HomeAdviser } from "../../src/home-adviser";
import type { HomeInsight } from "../../../shared/home-adviser-insights";
import { homePeriodLabel } from "../../src/home-period-label";
import { Text } from "../../src/app-text";
import { HomeQuickAccess } from "../../src/home-quick-access";
import { HomeChart } from "../../src/home-chart";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { useSession } from "../../src/session";
import {
  Body,
  Button,
  Card,
  Icon,
  Notice,
  Screen,
  money,
  useTheme,
} from "../../src/ui";
type Totals = { income: number; expense: number };
type HomeReport = Totals & { previous?: Totals; days: (Totals & { date: string })[] };
type HomeData = {
  insights?: HomeInsight[];
  nextSteps?: { id: string; title: string; description: string; count: number; href: string }[];
  currencyReports?: { currency: string; weekly: HomeReport; monthly: HomeReport }[];
  heroTotals?: { current: {income: string | null; expense: string | null}; previous: {income: string | null; expense: string | null} };
  currencies?: string[];
  reviewCount?: number;
  categories?: { name: string; amount: number }[];
  budgets?: {
    id: string;
    name: string;
    currency: string;
    actualAmount: number;
    targetAmount: number;
    progressPercent: number;
    statusLabel: string;
    periodLabel: string;
    isAtRisk: boolean;
  }[];
  currency: string;
  balance: number | null;
  month: Totals;
  previousMonth: Totals;
  weekly: Totals & { previous?: Totals; days: (Totals & { date: string })[] };
  monthly: Totals & { previous?: Totals; days: (Totals & { date: string })[] };
  overdue?: {
    id: string;
    title: string;
    amount: string | null;
    date: string;
  }[];
  upcoming: {
    id: string;
    title: string;
    amount: string | null;
    date: string;
  }[];
};
const hiddenKey = "clover.home.hide-balances";
export default function Home() {
  const { colors, styles } = useTheme();
  const session = useSession();
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(true);
  const currency = session.data?.defaultCurrency ?? "PHP";
  useEffect(() => {
    let active = true;
    const read =
      Platform.OS === "web"
        ? Promise.resolve(globalThis.localStorage?.getItem(hiddenKey))
        : SecureStore.getItemAsync(hiddenKey);
    void read
      .then((value) => {
        if (active) setHidden(value === "true");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(hiddenKey, String(next));
      } catch {}
    } else
      void SecureStore.setItemAsync(hiddenKey, String(next)).catch(() => {});
  };
  const load = useCallback(async () => {
    if (session.demo) {
      const totals = session.rows
        .filter((row) => row.currency === currency)
        .reduce(
          (sum, row) => {
            if (row.type !== "transfer")
              sum[row.type] += Math.abs(Number(row.amount));
            return sum;
          },
          { income: 0, expense: 0 },
        );
      return {
        currency,
        balance: null,
        month: totals,
        previousMonth: { income: 0, expense: 0 },
        weekly: { ...totals, days: [] },
        monthly: { ...totals, days: [] },
        upcoming: [],
      } satisfies HomeData;
    }
    return session.request<HomeData>(
      `home?workspaceId=${encodeURIComponent(session.profileId)}&currency=${currency}`,
    );
  }, [
    session.demo,
    session.rows,
    session.profileId,
    session.request,
    currency,
  ]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setData(null);
      setError("");
      void load()
        .then((value) => {
          if (active) setData(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );
  const amount = (value: number | string | null) =>
    hidden
      ? "••••"
      : value === null
        ? "Unavailable"
        : money(String(value), currency);
  return (
    <Screen>
      {error ? (
        <Notice>{error}</Notice>
      ) : !data ? (
        <Body>Loading Home…</Body>
      ) : (
        <>
          <LinearGradient
            colors={["#03A8C0", "#34D3D0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 20, padding: 16, gap: 12 }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: "white",
                  fontSize: 18,
                  fontFamily: "Poppins-SemiBold",
                }}
              >
                My Balance
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={hidden ? "Show balances" : "Hide balances"}
                onPress={toggleHidden}
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name={hidden ? "eye-off-outline" : "eye-outline"}
                  color="white"
                  size={20}
                />
              </Pressable>
            </View>
            <Text
              style={{
                color: "white",
                fontSize: 30,
                fontFamily: "Poppins-Bold",
                textAlign: "center",
              }}
            >
              {amount(data.balance)}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["income", "expense"] as const).map((key) => (
                <View
                  key={key}
                  style={{
                    flex: 1,
                    backgroundColor: "#fffffff2",
                    padding: 10,
                    borderRadius: 12,
                    gap: 3,
                  }}
                >
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    {key === "income" ? "Monthly Income" : "Monthly Expenses"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 16,
                      fontFamily: "Poppins-SemiBold",
                      color: key === "income" ? colors.positive : colors.danger,
                    }}
                  >
                    {amount(data.heroTotals ? data.heroTotals.current[key] : data.month[key])}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.muted }}>
                    {hidden
                      ? "••••"
                      : data.heroTotals
                        ? data.heroTotals.current[key] === null || data.heroTotals.previous[key] === null
                          ? "Unavailable"
                          : homePeriodLabel(Number(data.heroTotals.current[key]), Number(data.heroTotals.previous[key]))
                        : homePeriodLabel(data.month[key], data.previousMonth[key])}
                  </Text>
                </View>
              ))}
            </View>
          </LinearGradient>
          <HomeQuickAccess />
          <HomeAdviser insights={data.insights ?? []} hidden={hidden} />
          {Boolean(data.nextSteps?.length) && (
            <Card>
              <Text style={styles.sectionTitle}>Next Steps</Text>
              {data.nextSteps?.map((step) => <View key={step.id} style={{ gap: 6 }}>
                <Text style={{ color: colors.ink, fontFamily: "Poppins-SemiBold", fontSize: 13 }}>{step.title} · {step.count} pending</Text>
                <Body>{step.description}</Body>
                <Button title="Review" secondary onPress={() => step.id === "transactions"
                  ? router.navigate({ pathname: "/(tabs)/transactions", params: { review: "pending_review" } })
                  : router.navigate("/(tabs)/recurring")} />
              </View>)}
            </Card>
          )}
          {(data.currencyReports ?? [{ currency, weekly: data.weekly, monthly: data.monthly }]).flatMap((report) => (["weekly", "monthly"] as const).map((key) => (
            <Card key={`${report.currency}-${key}`}>
              <Text style={styles.sectionTitle}>
                {key === "weekly" ? "Weekly Report" : "Monthly Report"}
              </Text>
              {(data.currencyReports?.length ?? 0) > 1 ? <Body>{report.currency}</Body> : null}
              <Text
                style={{
                  fontSize: 26,
                  fontFamily: "Poppins-SemiBold",
                  color: colors.ink,
                }}
              >
                {hidden ? "••••" : money(String(report[key].expense), report.currency)}
              </Text>
              <Body>
                Recorded spending in the past {key === "weekly" ? 7 : 30} days
              </Body>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  ["Income", report[key].income, colors.positive],
                  ["Expenses", report[key].expense, colors.danger],
                  [
                    "Net Cash Flow",
                    report[key].income - report[key].expense,
                    report[key].income >= report[key].expense
                      ? colors.positive
                      : colors.danger,
                  ],
                ].map(([label, value, color]) => (
                  <View key={String(label)} style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 10, color: colors.muted }}>
                      {label}
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Poppins-SemiBold",
                        color: String(color),
                      }}
                    >
                      {hidden ? "••••" : money(String(value), report.currency)}
                    </Text>
                  </View>
                ))}
              </View>
              <HomeChart
                days={report[key].days}
                hidden={hidden}
                currency={report.currency}
              />
              <Button
                title="View report"
                secondary
                onPress={() => router.navigate("/reports")}
              />
            </Card>
          )))}
          {Boolean(data.budgets?.length) && (
            <Card>
              <Text style={styles.sectionTitle}>Budgeting</Text>
              {data.budgets?.slice(0, 3).map((b) => (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${b.name}`}
                  onPress={() => router.navigate("/budgeting")}
                  style={{ gap: 8 }}
                >
                  <Body muted={false}>
                    {b.name} · {b.statusLabel}
                  </Body>
                  <Body>
                    {hidden
                      ? "••••"
                      : money(String(b.actualAmount), b.currency)}{" "}
                    spent of{" "}
                    {hidden
                      ? "••••"
                      : money(String(b.targetAmount), b.currency)}
                  </Body>
                  <View
                    style={{
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: colors.line,
                    }}
                  >
                    <View
                      style={{
                        height: 7,
                        borderRadius: 4,
                        width: `${Math.max(0, Math.min(100, b.progressPercent))}%`,
                        backgroundColor: b.isAtRisk ? "#D59A39" : colors.bright,
                      }}
                    />
                  </View>
                  <Body>
                    {Math.round(b.progressPercent)}% used · {b.periodLabel}
                  </Body>
                </Pressable>
              ))}
            </Card>
          )}
          <Card>
            <Text style={styles.sectionTitle}>What's coming up</Text>
            <Body muted={false}>Recurring payments</Body>
            {data.upcoming.length ? (
              data.upcoming.map((item) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    justifyContent: "space-between",
                  }}
                >
                  <Body>{item.title}</Body>
                  <Body>{amount(item.amount)}</Body>
                </View>
              ))
            ) : (
              <Body>No upcoming payments need attention.</Body>
            )}
            <Button
              title="Open recurring"
              secondary
              onPress={() => router.navigate("/(tabs)/recurring")}
            />
          </Card>
          <Card>
            <Text style={styles.sectionTitle}>Things to review</Text>
            <Body muted={false}>Transactions</Body>
            <Body>
              {data.reviewCount
                ? `${data.reviewCount} transactions need review`
                : "No transactions need review"}
            </Body>
            <Button
              title="Review transactions"
              secondary
              onPress={() =>
                router.navigate({
                  pathname: "/(tabs)/transactions",
                  params: { review: "pending_review" },
                })
              }
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
