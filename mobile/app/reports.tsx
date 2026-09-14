import { ReportLineChart } from "../src/report-line-chart";
import { ChartControls } from "../src/chart-controls";
import { SpendingDonut } from "../src/spending-donut";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/session";
import {
  Body,
  Card,
  CategoryMark,
  Icon,
  Notice,
  Screen,
  money,
  useTheme,
} from "../src/ui";
import {
  PlanAction,
  SummaryCard,
  PlanHeader,
  PlanTabs,
  Progress,
  usePlanData,
} from "../src/plan-ui";
type Totals = { income: number; expense: number };
type Report = {
  currency: string;
  currencies: string[];
  month: Totals;
  previousMonth: Totals;
  weekly: Totals & { previous: Totals; days: (Totals & { date: string })[] };
  monthly: Totals & { previous: Totals; days: (Totals & { date: string })[] };
  categories: { name: string; amount: number }[];
  netWorth: {
    points: { date: string; balance: number }[];
    accountCount: number;
  };
  reviewCount: number;
};
const sampleDays = [
  { date: "2026-09-01", income: 28000, expense: 7000 },
  { date: "2026-09-06", income: 0, expense: 9000 },
  { date: "2026-09-10", income: 15000, expense: 10000 },
  { date: "2026-09-12", income: 22000, expense: 16000 },
];
// Only used behind the existing, visibly labelled sample-mode gate.
const sample: Report = {
  currency: "PHP",
  currencies: ["PHP"],
  month: { income: 65000, expense: 42000 },
  previousMonth: { income: 60000, expense: 40000 },
  weekly: {
    income: 37000,
    expense: 26000,
    previous: { income: 28000, expense: 16000 },
    days: sampleDays.slice(2),
  },
  monthly: {
    income: 65000,
    expense: 42000,
    previous: { income: 60000, expense: 40000 },
    days: sampleDays,
  },
  categories: [
    { name: "Housing", amount: 15000 },
    { name: "Food & Dining", amount: 9000 },
    { name: "Groceries", amount: 6000 },
    { name: "Other", amount: 5000 },
    { name: "Transport", amount: 4000 },
    { name: "Subscriptions", amount: 3000 },
  ],
  netWorth: {
    points: [
      { date: "2026-07-01", balance: 88000 },
      { date: "2026-08-01", balance: 94000 },
      { date: "2026-09-01", balance: 112000 },
    ],
    accountCount: 4,
  },
  reviewCount: 0,
};
export default function Reports() {
  const session = useSession();
  const { colors } = useTheme();
  const [currency, setCurrency] = useState("PHP");
  const [tab, setTab] = useState("Overview");
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  const [filters, setFilters] = useState(false);
  const [chart, setChart] = useState("Donut");
  const { data, error, reload } = usePlanData(
    `reports?currency=${currency}`,
    sample,
  );
  const summary = data?.[period];
  const net = (summary?.income ?? 0) - (summary?.expense ?? 0);
  return (
    <Screen gap={20}>
      <PlanHeader
        title="Reports"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters"
            onPress={() => setFilters(!filters)}
            style={{ padding: 8 }}
          >
            <Icon name="options-outline" />
          </Pressable>
        }
      />
      {filters ? (
        <Card>
          <Body>Reporting currency</Body>
          {(data?.currencies ?? [currency]).map((value) => (
            <PlanAction
              key={value}
              title={`${value}${value === currency ? " ✓" : ""}`}
              onPress={() => setCurrency(value)}
            />
          ))}
          <Body>Comparison window</Body>
          <PlanAction title="Last 7 days" onPress={() => setPeriod("weekly")} />
          <PlanAction
            title="Last 30 days"
            onPress={() => setPeriod("monthly")}
          />
          <Body>
            Transfers are excluded from income and spending. Dates use
            Asia/Manila.
          </Body>
          <PlanAction
            title="Apply filters"
            tone="primary"
            onPress={() => setFilters(false)}
          />
        </Card>
      ) : null}
      <PlanTabs
        items={["Overview", "Spending", "Trends", "Insights · Pro"]}
        value={tab}
        onChange={setTab}
      />
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data || !summary ? (
        <Body>Loading reports…</Body>
      ) : tab === "Overview" ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {(() => {
              const prior = summary.previous;
              const priorNet = prior.income - prior.expense;
              const rate =
                summary.income > 0
                  ? Math.min(1, Math.max(0, net / summary.income)) * 100
                  : null;
              const priorRate =
                prior.income > 0
                  ? Math.min(1, Math.max(0, priorNet / prior.income)) * 100
                  : null;
              const percentage = (now: number, before: number) =>
                before > 0 ? ((now - before) / before) * 100 : null;
              const rows = [
                {
                  title: "Income",
                  value: money(String(summary.income), currency),
                  delta: percentage(summary.income, prior.income),
                  lower: false,
                  unit: "% vs prior period",
                },
                {
                  title: "Spending",
                  value: money(String(summary.expense), currency),
                  delta: percentage(summary.expense, prior.expense),
                  lower: true,
                  unit: "% vs prior period",
                },
                {
                  title: "Net income",
                  value: money(String(net), currency),
                  delta: net - priorNet,
                  lower: false,
                  unit: "money",
                },
                {
                  title: "Savings rate",
                  value: rate === null ? "N/A" : `${rate.toFixed(1)}%`,
                  delta:
                    rate !== null && priorRate !== null
                      ? rate - priorRate
                      : null,
                  lower: false,
                  unit: " percentage points",
                },
              ];
              return rows.map((row) => {
                const color =
                  row.delta === null || row.delta === 0
                    ? colors.ink
                    : (row.lower ? row.delta < 0 : row.delta > 0)
                      ? colors.positive
                      : colors.danger;
                const detail =
                  row.delta === null
                    ? "No prior value to compare"
                    : row.unit === "money"
                      ? `${money(String(row.delta), currency)} vs prior period`
                      : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(1)}${row.unit}`;
                return (
                  <View
                    key={row.title}
                    style={{ flexGrow: 1, flexBasis: "44%" }}
                  >
                    <SummaryCard
                      title={row.title}
                      value={row.value}
                      color={
                        row.title === "Income"
                          ? colors.positive
                          : row.title === "Spending"
                            ? colors.danger
                            : colors.ink
                      }
                      detail={detail}
                      detailColor={color}
                    />
                  </View>
                );
              });
            })()}
          </View>
          <Card>
            <Text
              style={{
                color: "#7A879C",
                fontSize: 16,
                fontFamily: "Poppins-SemiBold",
              }}
            >
              Money over time
            </Text>
            <Body>{period === "weekly" ? "Last 7 days" : "Last 30 days"}</Body>
            <ReportLineChart
              currency={currency}
              series={[
                {
                  name: "Income",
                  color: colors.positive,
                  points: summary.days.map((day) => ({
                    date: day.date,
                    value: day.income,
                  })),
                },
                {
                  name: "Spending",
                  color: colors.danger,
                  points: summary.days.map((day) => ({
                    date: day.date,
                    value: day.expense,
                  })),
                },
              ]}
            />
            <Body muted={false}>
              {net >= 0
                ? `You kept ${money(String(net), currency)} after spending`
                : `Spending exceeded income by ${money(String(-net), currency)}`}
            </Body>
            <PlanAction
              title="Explore transactions"
              onPress={() => router.push("/(tabs)/transactions")}
            />
          </Card>
          <Card>
            <Text
              style={{
                color: "#7A879C",
                fontSize: 16,
                fontFamily: "Poppins-SemiBold",
              }}
            >
              Net worth over time
            </Text>
            <ReportLineChart
              currency={currency}
              series={[
                {
                  name: "Net worth",
                  color: colors.bright,
                  points: data.netWorth.points.map((point) => ({
                    date: point.date,
                    value: point.balance,
                  })),
                },
              ]}
            />
            <Body>
              Assets minus liabilities in {currency}. Only complete recorded
              history is shown.
            </Body>
          </Card>
        </>
      ) : tab === "Spending" ? (
        <Card>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text
              style={{
                color: "#7A879C",
                fontSize: 16,
                fontFamily: "Poppins-SemiBold",
              }}
            >
              Spending Mix
            </Text>
            <View style={{ marginLeft: "auto" }}><ChartControls value={chart} onChange={setChart} /></View>
          </View>
          <Body>This calendar month · {currency}</Body>
          {chart === "Donut" ? (
            <SpendingDonut categories={data.categories} currency={currency} />
          ) : null}
          {data.categories.length ? (
            data.categories.map((category) => (
              <View key={category.name} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <CategoryMark name={category.name} />
                  <Body muted={false}>{category.name}</Body>
                </View>
                <Body>
                  {money(String(category.amount), currency)} ·{" "}
                  {data.month.expense
                    ? ((category.amount / data.month.expense) * 100).toFixed(1)
                    : 0}
                  % of spending
                </Body>
                {chart === "Bars" ? (
                  <Progress
                    value={
                      data.month.expense
                        ? (category.amount / data.month.expense) * 100
                        : 0
                    }
                  />
                ) : null}
              </View>
            ))
          ) : (
            <Body>No categorized spending yet.</Body>
          )}
          <PlanAction
            title="Open Budgeting"
            onPress={() => router.push("/budgeting")}
          />
        </Card>
      ) : tab === "Trends" ? (
        <>
          <Card>
            <Body muted={false}>Weekly Summary</Body>
            <Body>
              Income {money(String(data.weekly.income), currency)} · Spending{" "}
              {money(String(data.weekly.expense), currency)}
            </Body>
            <Body>
              Previous week: Income{" "}
              {money(String(data.weekly.previous.income), currency)} · Spending{" "}
              {money(String(data.weekly.previous.expense), currency)}
            </Body>
          </Card>
          <Card>
            <Body muted={false}>Monthly Summary</Body>
            <Body>
              Income {money(String(data.monthly.income), currency)} · Spending{" "}
              {money(String(data.monthly.expense), currency)}
            </Body>
            <Body>
              Previous 30 days: Income{" "}
              {money(String(data.monthly.previous.income), currency)} · Spending{" "}
              {money(String(data.monthly.previous.expense), currency)}
            </Body>
          </Card>
          <PlanAction
            title="Review recurring payments"
            onPress={() => router.push("/(tabs)/recurring")}
          />
        </>
      ) : !session.demo &&
        !session.data?.entitlement.fullFeatureAccess &&
        session.data?.entitlement.planTier !== "pro" ? (
        <Notice>Insights requires Clover Pro.</Notice>
      ) : (
        <>
          <Card>
            <Body muted={false}>Cash flow</Body>
            <Body>Income → Accounts → Expenses</Body>
            <Body>Income {money(String(summary.income), currency)}</Body>
            <Body>Expenses {money(String(summary.expense), currency)}</Body>
            <Body>
              {net >= 0
                ? "Income left after spending"
                : "Spending above income"}{" "}
              {money(String(Math.abs(net)), currency)}
            </Body>
            <Body>Internal transfers are excluded.</Body>
          </Card>
          <Card>
            <Body muted={false}>Next steps</Body>
            <Body>{data.reviewCount} transactions need review.</Body>
            <PlanAction
              title="Open review"
              onPress={() => router.push("/(tabs)/transactions")}
            />
            <PlanAction
              title="Goal check"
              onPress={() => router.push("/goals")}
            />
            <PlanAction
              title="Ask Clover"
              tone="ask"
              onPress={() => router.push("/(tabs)/adviser")}
            />
          </Card>
        </>
      )}
    </Screen>
  );
}
