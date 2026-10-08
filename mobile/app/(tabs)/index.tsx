import { Modal } from "../../src/adaptive-modal";
import { AdaptiveGrid } from "../../src/adaptive";
import { mergeHomeDetails, type HomeDetails, type HomeSections } from "../../src/home-sections";
import { registerScreenRefresh } from "../../src/screen-refresh";
import { HomeAdviser } from "../../src/home-adviser";
import type { HomeInsight } from "../../../shared/home-adviser-insights";
import { homePeriodLabel } from "../../src/home-period-label";
import { Text } from "../../src/app-text";
import { HomeQuickAccess } from "../../src/home-quick-access";
import { HomeChart } from "../../src/home-chart";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, Platform, Pressable, View } from "react-native";
import { useSession } from "../../src/session";
import { ApiError } from "../../src/api";
import {
  AppHeader,
  Heading,
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
type HomeData = HomeSections & {
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
    currency?: string;
  }[];
  upcoming: {
    id: string;
    title: string;
    amount: string | null;
    date: string;
    currency?: string;
  }[];
};
const hiddenKey = "clover.home.hide-balances";
export default function Home() {
  const { colors, styles } = useTheme();
  const session = useSession();
  const [error, setError] = useState("");
  const [detailsError, setDetailsError] = useState(false);
  const [hidden, setHidden] = useState(true);
  const profileCurrency = session.data?.defaultCurrency ?? "PHP";
  const [currency, setCurrency] = useState(profileCurrency);
  const basePath = `home?workspaceId=${encodeURIComponent(session.profileId)}&currency=${currency}`;
  const readSnapshot = () => {
    const overview = session.cached<HomeData>(`${basePath}&section=overview`);
    return overview ? mergeHomeDetails(overview, session.cached<HomeDetails>(`${basePath}&section=details`)) : null;
  };
  const [snapshot, setSnapshot] = useState(() => ({ path: basePath, value: readSnapshot() }));
  // Never paint another currency/Profile's balances while the focus effect catches up.
  const data = snapshot.path === basePath ? snapshot.value : readSnapshot();
  const setData = useCallback((value: HomeData | null) => setSnapshot({ path: basePath, value }), [basePath]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencyOptions, setCurrencyOptions] = useState<string[]>([profileCurrency]);
  const navigation = useNavigation();
  useEffect(() => { setCurrency(profileCurrency); setCurrencyOptions([profileCurrency]); }, [profileCurrency, session.profileId]);
  useLayoutEffect(() => {
    navigation.setOptions({ header: () => <AppHeader title="Home" leading={<Pressable accessibilityRole="button" accessibilityLabel={`Home currency: ${currency === "ALL" ? "All Currencies" : currency}`} onPress={() => setCurrencyOpen(true)} style={styles.iconButton}><Icon line name="globe-outline" size={24} /></Pressable>} /> });
  }, [navigation, currency, styles.iconButton]);
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
        .filter((row) => row.currency === (currency === "ALL" ? profileCurrency : currency))
        .reduce(
          (sum, row) => {
            if (row.type !== "transfer")
              sum[row.type] += Math.abs(Number(row.amount));
            return sum;
          },
          { income: 0, expense: 0 },
        );
      return {
        currency: currency === "ALL" ? profileCurrency : currency,
        currencies: [...new Set(session.rows.map(row => row.currency))],
        balance: null,
        month: totals,
        previousMonth: { income: 0, expense: 0 },
        weekly: { ...totals, days: [] },
        monthly: { ...totals, days: [] },
        upcoming: [],
      } satisfies HomeData;
    }
    return session.request<HomeData>(
      `home?workspaceId=${encodeURIComponent(session.profileId)}&currency=${currency}&section=overview`,
    );
  }, [
    session.demo,
    session.rows,
    session.profileId,
    session.request,
    currency,
    profileCurrency,
  ]);
  useFocusEffect(
    useCallback(() => {
      let active = true, generation = 0;
      const cachedOverview = session.cached<HomeData>(`${basePath}&section=overview`);
      setData(cachedOverview ? mergeHomeDetails(cachedOverview, session.cached<HomeDetails>(`${basePath}&section=details`)) : null);
      setError(""); setDetailsError(false);
      const refresh = async () => {
        // New accounts can reach Home while their starter Profile is created.
        if (!session.demo && !session.profileId) return false;
        const run = ++generation;
        try {
          const value = await load();
          if (!active || run !== generation) return false;
          setError(""); setDetailsError(false); setCurrencyOptions(value.currencies ?? [value.currency]);
          setData(mergeHomeDetails(value, session.cached<HomeDetails>(`${basePath}&section=details`)));
          // Older servers return the complete payload and need no second request.
          if (!value.detailsPending) return true;
          try {
            const details = await session.request<HomeDetails>(`${basePath}&section=details`);
            if (!active || run !== generation) return false;
            setData(mergeHomeDetails(value, details));
            return true;
          } catch {
            if (active && run === generation) setDetailsError(true);
            return false;
          }
        } catch (e) {
          if (active && run === generation) {
            if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setData(null);
            setError((e as Error).message);
          }
          return false;
        }
      };
      void refresh();
      const unregister = registerScreenRefresh("/", refresh);
      return () => {
        active = false; unregister();
      };
    }, [load, basePath, session.cached, session.request, session.demo, session.profileId, setData]),
  );
  const amount = (value: number | string | null, code = data?.currency ?? profileCurrency) =>
    hidden
      ? "••••"
      : value === null
        ? "Unavailable"
        : money(String(value), code);
  return (
    <Screen layout="dashboard">
      <Modal visible={currencyOpen} transparent animationType="fade" onRequestClose={() => setCurrencyOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "#0006", justifyContent: "center", padding: 24 }}>
          <Pressable accessibilityLabel="Close currency selector" onPress={() => setCurrencyOpen(false)} style={{ position: "absolute", inset: 0 }} />
          <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 440, alignSelf: "center", maxHeight: "90%", flexShrink: 1, backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 12 }}>
            <Heading>Home currency</Heading>
            <ScrollView>{["ALL", ...new Set([profileCurrency, ...currencyOptions])].map(code => <Pressable key={code} accessibilityRole="button" accessibilityState={{ selected: currency === code }} onPress={() => { setCurrency(code); setCurrencyOpen(false); }} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><Text style={{ color: colors.ink }}>{code === "ALL" ? "All Currencies" : code}</Text>{currency === code ? <Icon line name="checkmark" /> : null}</Pressable>)}</ScrollView>
            <>{currency === "ALL" ? <Body>Combined balance in {profileCurrency}. Reports remain separated by currency.</Body> : null}</>
            <Button title="Done" secondary onPress={() => setCurrencyOpen(false)} />
          </View>
        </View>
      </Modal>
      {error ? <Notice>{error}</Notice> : null}
      {!data ? (
        <>
          <LinearGradient colors={["#03A8C0", "#34D3D0"]} style={{ borderRadius: 20, padding: 24, gap: 16 }}>
            <Text style={{ color: "white", textAlign: "center" }}>My Balance</Text>
            <View accessibilityLabel="Loading balance" style={{ height: 44, borderRadius: 12, backgroundColor: "#FFFFFF33" }}/>
          </LinearGradient>
          <HomeQuickAccess />
        </>
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
          {detailsError ? <Body>Budgets and suggestions could not load. Pull down to retry.</Body> : data.detailsPending ? <Body>Loading budgets and suggestions…</Body> : null}
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
          <AdaptiveGrid maxColumns={2}>
          {(data.currencyReports ?? [{ currency: data.currency, weekly: data.weekly, monthly: data.monthly }]).flatMap((report) => (["weekly", "monthly"] as const).map((key) => (
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
          </AdaptiveGrid>
          <AdaptiveGrid maxColumns={2}>
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
                  <Text style={{ flex: 1, minWidth: 0, color: colors.muted, fontSize: 14 }}>{item.title}</Text>
                  <Text style={{ flexShrink: 1, maxWidth: "48%", textAlign: "right", color: colors.muted, fontSize: 14 }}>{amount(item.amount, item.currency)}</Text>
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
          </AdaptiveGrid>
        </>
      )}
    </Screen>
  );
}
