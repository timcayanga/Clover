import { Text } from "../src/app-text";
import { CashFlowChart } from "../src/cash-flow-chart";
import { ReportLineChart } from "../src/report-line-chart";
import { ChartControls } from "../src/chart-controls";
import { SpendingDonut } from "../src/spending-donut";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/session";
import {
  Body,
  Card,
  Field,
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
  balances?: {
    currency: string;
    range?:{date:string;balance:number}[];
    weekly: { date: string; balance: number }[];
    monthly: { date: string; balance: number }[];
    accountCount: number;
  };
  details?:{from:string;to:string;comparison:string;current:Totals;previous:Totals;days:(Totals&{date:string})[];categories:{name:string;amount:number}[];pace:{date:string;current:number;previous:number}[];merchants:{name:string;amount:number;count:number}[];repeats:{name:string;amount:number;count:number}[];flows:{account:string;income:number;expense:number}[]};
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
  balances: {
    currency: "PHP",
    accountCount: 4,
    range: [
      { date: "2026-09-01", balance: 141000 },
      { date: "2026-09-06", balance: 132000 },
      { date: "2026-09-10", balance: 137000 },
      { date: "2026-09-12", balance: 143000 },
    ],
    weekly: [
      { date: "2026-09-10", balance: 137000 },
      { date: "2026-09-12", balance: 143000 },
    ],
    monthly: [
      { date: "2026-09-01", balance: 141000 },
      { date: "2026-09-06", balance: 132000 },
      { date: "2026-09-10", balance: 137000 },
      { date: "2026-09-12", balance: 143000 },
    ],
  },
  details: {
    from: "2026-09-01", to: "2026-09-12", comparison: "previous",
    current: {income:65000,expense:42000}, previous:{income:60000,expense:40000},
    days: sampleDays,
    categories: [{name:"Housing",amount:15000},{name:"Food & Dining",amount:9000},{name:"Groceries",amount:6000},{name:"Other",amount:5000},{name:"Transport",amount:4000},{name:"Subscriptions",amount:3000}],
    pace: sampleDays.map((d,i)=>({date:d.date,current:sampleDays.slice(0,i+1).reduce((n,p)=>n+p.expense,0),previous:[6000,14000,24000,40000][i]})),
    merchants:[{name:"Sample grocery",amount:6000,count:4},{name:"Sample cafe",amount:3000,count:3}],
    repeats:[{name:"Sample cafe",amount:3000,count:3}],
    flows:[{account:"Sample bank",income:43000,expense:31000},{account:"Sample wallet",income:22000,expense:11000}],
  },
  reviewCount: 0,
};
export default function Reports() {
  const session = useSession();
  const { colors } = useTheme();
  const [currency, setCurrency] = useState("PHP");
  const [tab, setTab] = useState("Overview");
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  const [from,setFrom]=useState("");const [to,setTo]=useState("");const [comparison,setComparison]=useState("previous");const [range,setRange]=useState("");
  const [filters, setFilters] = useState(false);
  const [chart, setChart] = useState("Donut");
  const { data, error, reload } = usePlanData(
    `reports?currency=${currency}${range}`,
    sample,
  );
  const summary = data?.details?{...data.details.current,previous:data.details.previous}:data?.[period];
  const categories=data?.details?.categories??data?.categories??[];
  const expenseTotal=summary?.expense??0;
  const balancePoints =
    data?.balances?.currency === currency ? (data.details?data.balances.range??[]:data.balances[period]) : [];
  const latestBalance = balancePoints.at(-1);
  const net = (summary?.income ?? 0) - (summary?.expense ?? 0);
  return (
    <Screen gap={20}>
      <PlanHeader
        title="Reports"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Filters"
            accessibilityState={{ expanded: filters }}
            onPress={() => setFilters(!filters)}
            style={{
              width: 40,
              height: 40,
              borderWidth: 1,
              borderColor: colors.line,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
            }}
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
          <Field label="From (YYYY-MM-DD, optional)" value={from} onChangeText={setFrom}/>
          <Field label="To (YYYY-MM-DD, optional)" value={to} onChangeText={setTo}/>
          <PlanAction title={`Previous period${comparison==="previous"?" ✓":""}`} onPress={()=>setComparison("previous")}/>
          <PlanAction title={`Previous year${comparison==="year"?" ✓":""}`} onPress={()=>setComparison("year")}/>
          <Body>Quick ranges</Body>
          <PlanAction title="Last 7 days" onPress={() => {setPeriod("weekly");setFrom(new Date(Date.now()-6*86400000).toISOString().slice(0,10));setTo(new Date().toISOString().slice(0,10));}} />
          <PlanAction
            title="Last 30 days"
            onPress={() => {setPeriod("monthly");setFrom(new Date(Date.now()-29*86400000).toISOString().slice(0,10));setTo(new Date().toISOString().slice(0,10));}}
          />
          <Body>
            Transfers are excluded from income and spending. Dates use
            Asia/Manila.
          </Body>
          <PlanAction
            title="Apply filters"
            tone="primary"
            onPress={() => {setRange(`${from?`&from=${encodeURIComponent(from)}`:""}${to?`&to=${encodeURIComponent(to)}`:""}&comparison=${comparison}`);setFilters(false);}}
          />
        </Card>
      ) : null}
      <PlanTabs
        compact
        items={["Overview", "Spending", "Trends", "Insights · Plus"]}
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
                  title: "Expenses",
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
                          : row.title === "Expenses"
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
            <Body>
              Tracked account balance · {currency} ·{" "}
              {data.details?`${data.details.from} – ${data.details.to}`:period === "weekly" ? "Last 7 days" : "Last 30 days"}
            </Body>
            {latestBalance ? (
              <Text
                style={{
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 22,
                  color: colors.ink,
                }}
              >
                {money(String(latestBalance.balance), currency)}
              </Text>
            ) : null}
            <ReportLineChart
              currency={currency}
              series={[
                {
                  name: "Tracked account balance",
                  color: colors.bright,
                  points: balancePoints.map((point) => ({
                    date: point.date,
                    value: point.balance,
                  })),
                },
              ]}
            />
            <Body>
              Estimated from current balances and recorded account movements.
              Each currency is shown separately.
            </Body>
            <Body muted={false}>
              {net >= 0
                ? `You kept ${money(String(net), currency)} after spending`
                : `Spending exceeded income by ${money(String(-net), currency)}`}
            </Body>
            <PlanAction
              title="View balance details"
              tone="primary"
              onPress={() => router.push("/(tabs)/accounts")}
            />
            <PlanAction
              title="Explore spending"
              onPress={() => setTab("Spending")}
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
            <View style={{ marginLeft: "auto" }}>
              <ChartControls value={chart} onChange={setChart} />
            </View>
          </View>
          <Body>{data.details?`${data.details.from} – ${data.details.to}`:"This calendar month"} · {currency}</Body>
          {chart === "Donut" ? (
            <SpendingDonut categories={categories} currency={currency} />
          ) : null}
          {chart==="Table"?<View><View style={{flexDirection:"row",paddingVertical:10,borderBottomWidth:1,borderColor:colors.line}}><Text style={{flex:2,color:colors.muted}}>Category</Text><Text style={{flex:1,color:colors.muted,textAlign:"right"}}>Amount</Text><Text style={{width:55,color:colors.muted,textAlign:"right"}}>Share</Text></View>{categories.map(c=><View key={c.name} style={{flexDirection:"row",paddingVertical:12,borderBottomWidth:1,borderColor:colors.line,gap:8}}><Text style={{flex:2,color:colors.ink,fontFamily:"Poppins-Regular"}}>{c.name}</Text><Text style={{flex:1,color:colors.ink,textAlign:"right",fontFamily:"Poppins-Regular"}}>{money(String(c.amount),currency)}</Text><Text style={{width:55,color:colors.ink,textAlign:"right"}}>{expenseTotal?(c.amount/expenseTotal*100).toFixed(1):0}%</Text></View>)}</View>:categories.length ? (
            categories.map((category) => (
              <View key={category.name} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <CategoryMark name={category.name} />
                  <Body muted={false}>{category.name}</Body>
                </View>
                <Body>
                  {money(String(category.amount), currency)} ·{" "}
                  {expenseTotal
                    ? ((category.amount / expenseTotal) * 100).toFixed(1)
                    : 0}
                  % of spending
                </Body>
                {chart === "Bars" ? (
                  <Progress
                    value={
                      expenseTotal
                        ? (category.amount / expenseTotal) * 100
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
          {data.details?<><Card><Body muted={false}>Spending pace</Body><ReportLineChart currency={currency} series={[{name:"Selected period",color:colors.teal,points:data.details.pace.map(p=>({date:p.date,value:p.current}))},{name:"Comparison period",color:colors.muted,points:data.details.pace.map(p=>({date:p.date,value:p.previous}))}]}/><Body>Cumulative spending compared at the same elapsed day.</Body></Card><Card><Body muted={false}>Income and spending</Body><ReportLineChart currency={currency} series={[{name:"Income",color:colors.positive,points:data.details.days.map(p=>({date:p.date,value:p.income}))},{name:"Spending",color:colors.danger,points:data.details.days.map(p=>({date:p.date,value:p.expense}))}]}/></Card><Card><Body muted={false}>Biggest merchants</Body>{data.details.merchants.map(m=><Body key={m.name}>{m.name} · {money(String(m.amount),currency)} · {m.count} transactions</Body>)}</Card><Card><Body muted={false}>Repeat bills</Body><Body>Repeated merchants on different days. These are observations, not confirmed recurring bills.</Body>{data.details.repeats.length?data.details.repeats.map(m=><Body key={m.name}>{m.name} · {m.count} payments · {money(String(m.amount),currency)}</Body>):<Body>No repeated merchants in this period.</Body>}</Card></>:null}
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
        (session.data?.entitlement.planTier !== "pro" && session.data?.entitlement.planTier !== "premium") ? (
        <Notice>Insights requires Clover Plus.</Notice>
      ) : (
        <>
          <Card>
            <Body muted={false}>Cash flow</Body>
            <CashFlowChart flows={data.details?.flows??[]} currency={currency}/>
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
