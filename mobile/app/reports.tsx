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
const sample: Report = {
  currency: "PHP",
  currencies: ["PHP"],
  month: { income: 0, expense: 0 },
  previousMonth: { income: 0, expense: 0 },
  weekly: {
    income: 0,
    expense: 0,
    previous: { income: 0, expense: 0 },
    days: [],
  },
  monthly: {
    income: 0,
    expense: 0,
    previous: { income: 0, expense: 0 },
    days: [],
  },
  categories: [],
  netWorth: { points: [], accountCount: 0 },
  reviewCount: 0,
};
export default function Reports() {
  const session = useSession();
  const { colors } = useTheme();
  const [currency, setCurrency] = useState("PHP");
  const [tab, setTab] = useState("Overview");
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  const [filters, setFilters] = useState(false);
  const [chart, setChart] = useState("Bars");
  const { data, error, reload } = usePlanData(
    `reports?currency=${currency}`,
    sample,
  );
  const summary = data?.[period];
  const net = (summary?.income ?? 0) - (summary?.expense ?? 0);
  return (
    <Screen>
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
            {[
              ["Income", summary.income],
              ["Spending", summary.expense],
              ["Net income", net],
            ].map(([label, value]) => (
              <Card key={label} style={{ flexGrow: 1, flexBasis: "44%" }}>
                <Body>{label}</Body>
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 20,
                    color: label === "Spending" ? colors.danger : colors.ink,
                  }}
                >
                  {money(String(value), currency)}
                </Text>
              </Card>
            ))}
            <Card style={{ flexGrow: 1, flexBasis: "44%" }}>
              <Body>Savings rate</Body>
              <Body muted={false}>
                {summary.income
                  ? `${((net / summary.income) * 100).toFixed(1)}%`
                  : "N/A"}
              </Body>
            </Card>
          </View>
          <Card>
            <Body muted={false}>Income and spending over time</Body>
            <Body>{period === "weekly" ? "Last 7 days" : "Last 30 days"}</Body>
            {summary.days.length ? (
              summary.days
                .filter(
                  (_, i) =>
                    i % Math.max(1, Math.floor(summary.days.length / 10)) === 0,
                )
                .map((day) => (
                  <View key={day.date} style={{ gap: 8 }}>
                    <Body>
                      {day.date} · Income {money(String(day.income), currency)}{" "}
                      · Spending {money(String(day.expense), currency)}
                    </Body>
                    <Progress
                      value={
                        (day.expense /
                          Math.max(1, ...summary.days.map((d) => d.expense))) *
                        100
                      }
                    />
                  </View>
                ))
            ) : (
              <Body>No transaction history yet.</Body>
            )}
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
            <Body muted={false}>Net worth over time</Body>
            {data.netWorth.points.length ? (
              data.netWorth.points.map((point) => (
                <Body key={point.date}>
                  {point.date} · {money(String(point.balance), currency)}
                </Body>
              ))
            ) : (
              <Body>No complete dated balance history is available yet.</Body>
            )}
            <Body>
              Assets minus liabilities in {currency}. Only complete recorded
              history is shown.
            </Body>
          </Card>
        </>
      ) : tab === "Spending" ? (
        <Card>
          <Body muted={false}>Spending Mix</Body>
          <Body>This calendar month · {currency}</Body>
          <PlanTabs
            items={["Bars", "Table"]}
            value={chart}
            onChange={setChart}
          />
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
