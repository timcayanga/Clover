import { compactSummaryMoney } from "../../shared/summary-format";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/session";
import { AccountEditor, type AccountRecord } from "../src/account-editor";
import {
  Body,
  Card,
  Field,
  Notice,
  Screen,
  money,
  useTheme,
  Icon,
} from "../src/ui";
import {
  PlanAction,
  SummaryCard,
  PlanHeader,
  PlanTabs,
  Progress,
  usePlanData,
} from "../src/plan-ui";
import { investmentIcons } from "../src/investment-icons";
import {
  getGrowthScenarioResult,
  type GrowthScenario,
} from "../../shared/growth-planner";
const sample = { accounts: [] as AccountRecord[] };
export default function Investments() {
  const session = useSession();
  const { colors } = useTheme();
  const { data, setData, error, reload } = usePlanData("investments", sample);
  const [tab, setTab] = useState("Overview");
  const [currency, setCurrency] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [filters, setFilters] = useState(false);
  const [editor, setEditor] = useState<{
    account: AccountRecord | null;
  } | null>(null);
  useEffect(() => {
    setEditor(null);
    setCurrency("");
    setType("all");
    setSearch("");
    setTab("Overview");
  }, [session.profileId]);
  const accounts = data?.accounts ?? [];
  const currencies = [...new Set(accounts.map((a) => a.currency))];
  const selectedCurrency = currencies.includes(currency)
    ? currency
    : (currencies[0] ?? "PHP");
  const visible = accounts.filter(
    (a) =>
      a.currency === selectedCurrency &&
      (type === "all" || a.investmentSubtype === type) &&
      `${a.name} ${a.institution} ${a.investmentSymbol}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = visible.reduce((n, a) => n + Number(a.balance ?? 0), 0);
  const known = visible.filter(
    (a) =>
      (a.investmentCostBasis !== null && a.investmentCostBasis !== undefined) ||
      (a.investmentPrincipal !== null && a.investmentPrincipal !== undefined),
  );
  const cost = known.reduce(
    (n, a) => n + Number(a.investmentCostBasis ?? a.investmentPrincipal),
    0,
  );
  const gain = known.reduce(
    (n, a) =>
      n +
      Number(a.balance ?? 0) -
      Number(a.investmentCostBasis ?? a.investmentPrincipal),
    0,
  );
  const pro =
    session.demo ||
    session.data?.entitlement.fullFeatureAccess ||
    session.data?.entitlement.planTier === "pro";
  if (editor)
    return (
      <AccountEditor
        initial={editor.account}
        defaultType="investment"
        onClose={() => setEditor(null)}
        onSaved={(record) => {
          setEditor(null);
          if (session.demo)
            setData((current) => ({
              accounts: record
                ? [
                    ...(current?.accounts ?? []).filter(
                      (a) => a.id !== record.id,
                    ),
                    record,
                  ]
                : (current?.accounts ?? []).filter(
                    (a) => a.id !== editor.account?.id,
                  ),
            }));
          else reload();
        }}
      />
    );
  const row = (account: AccountRecord) => {
    const basis = account.investmentCostBasis ?? account.investmentPrincipal;
    const value = Number(account.balance ?? 0);
    const delta =
      basis === null || basis === undefined ? null : value - Number(basis);
    return (
      <Card key={account.id}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Image
            source={
              investmentIcons[account.investmentSubtype ?? "other"] ??
              investmentIcons.other
            }
            style={{ width: 36, height: 36 }}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                fontFamily: "Poppins-SemiBold",
                fontSize: 16,
                color: colors.ink,
              }}
            >
              {account.name}
            </Text>
            <Body>
              {account.institution ?? "No institution"} ·{" "}
              {(account.investmentSubtype ?? "other").replaceAll("_", " ")}
            </Body>
            <Body>
              {account.investmentSymbol ?? ""}
              {account.investmentQuantity
                ? ` · ${account.investmentQuantity} units`
                : ""}
            </Body>
          </View>
        </View>
        <Body muted={false}>{money(String(value), account.currency)}</Body>
        <Text
          style={{
            color:
              delta === null
                ? colors.muted
                : delta >= 0
                  ? colors.teal
                  : colors.danger,
          }}
        >
          {delta === null
            ? "Add purchase value to calculate returns"
            : `${delta >= 0 ? "+" : ""}${money(String(delta), account.currency)}`}
        </Text>
        <PlanAction title="View asset" onPress={() => setEditor({ account })} />
      </Card>
    );
  };
  return (
    <Screen>
      <PlanHeader
        title="Investments"
        trailing={
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                filters ? "Close filters" : "Filter investments"
              }
              onPress={() => setFilters(!filters)}
              style={{ padding: 8 }}
            >
              <Icon name="options-outline" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add Investments"
              onPress={() => setEditor({ account: null })}
              style={{ padding: 8 }}
            >
              <Icon name="add-circle" />
            </Pressable>
          </View>
        }
      />
      {filters ? (
        <Card>
          <Field
            label="Search investments"
            value={search}
            onChangeText={setSearch}
          />
          <Body>Currency</Body>
          {currencies.map((c) => (
            <PlanAction
              key={c}
              title={`${c}${c === selectedCurrency ? " ✓" : ""}`}
              onPress={() => setCurrency(c)}
            />
          ))}
          <Body>Asset type</Body>
          {[
            "all",
            ...new Set(accounts.map((a) => a.investmentSubtype ?? "other")),
          ].map((t) => (
            <PlanAction
              key={t}
              title={`${t.replaceAll("_", " ")}${t === type ? " ✓" : ""}`}
              onPress={() => setType(t)}
            />
          ))}
          <PlanAction
            title="Clear filters"
            onPress={() => {
              setSearch("");
              setType("all");
            }}
          />
        </Card>
      ) : null}
      <PlanTabs
        items={[
          "Overview",
          "Portfolio",
          "Planner · Pro",
          "Markets · Pro",
          "Analysis · Pro",
        ]}
        value={tab}
        onChange={setTab}
      />
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading investments…</Body>
      ) : tab.includes("Pro") && !pro ? (
        <Notice>This section requires Clover Pro.</Notice>
      ) : tab === "Overview" ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SummaryCard
              title="Est. value"
              value={compactSummaryMoney(total, selectedCurrency)}
              detail={money(String(total), selectedCurrency)}
            />
            <SummaryCard
              title="Gain/loss"
              value={known.length ? compactSummaryMoney(gain, selectedCurrency) : "—"}
              detail={known.length ? money(String(gain), selectedCurrency) : "No purchase value"}
              color={gain >= 0 ? colors.teal : colors.danger}
            />
            <SummaryCard
              title="Return"
              detail="On cost"
              value={cost > 0 ? `${((gain / cost) * 100).toFixed(2)}%` : "—"}
              color={gain >= 0 ? colors.teal : colors.danger}
            />
          </View>
          <Body>
            Recorded values in {selectedCurrency}. Missing purchase values are
            excluded from returns. Check your provider for live valuations.
          </Body>
          {visible.length ? (
            <PlanAction
              title="View all holdings"
              onPress={() => setTab("Portfolio")}
            />
          ) : (
            <>
              <Notice>No investments in this view yet.</Notice>
              <PlanAction
                title="Add a holding"
                tone="primary"
                onPress={() => setEditor({ account: null })}
              />
              <PlanAction
                title="Upload a statement"
                onPress={() => router.push("/(tabs)/add")}
              />
            </>
          )}
        </>
      ) : tab === "Portfolio" ? (
        <>
          {visible.map(row)}
          {!visible.length ? <Notice>No matching holdings.</Notice> : null}
        </>
      ) : tab.startsWith("Planner") ? (
        <NativePlanner currency={selectedCurrency} initial={total} />
      ) : tab.startsWith("Markets") ? (
        <NativeMarkets accounts={accounts} />
      ) : (
        <>
          <Card>
            <Body muted={false}>Allocation · {selectedCurrency}</Body>
            {visible.length ? (
              visible
                .slice()
                .sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))
                .map((a) => (
                  <View key={a.id} style={{ gap: 8 }}>
                    <Body>
                      {a.name} ·{" "}
                      {total > 0
                        ? ((Number(a.balance ?? 0) / total) * 100).toFixed(1)
                        : 0}
                      %
                    </Body>
                    <Progress
                      value={
                        total > 0 ? (Number(a.balance ?? 0) / total) * 100 : 0
                      }
                    />
                  </View>
                ))
            ) : (
              <Body>Add holdings to see your allocation.</Body>
            )}
          </Card>
          <Card>
            <Body muted={false}>Return breakdown</Body>
            <Body>
              {known.length} of {visible.length} holdings have a recorded
              purchase value.
            </Body>
            <Body>Purchase value {money(String(cost), selectedCurrency)}</Body>
            <Body>
              Unrealized gain / loss{" "}
              {known.length ? money(String(gain), selectedCurrency) : "—"}
            </Body>
            <Body>These are recorded results, not forecasts.</Body>
          </Card>
          {visible
            .slice()
            .sort((a, b) => Number(b.balance ?? 0) - Number(a.balance ?? 0))
            .slice(0, 5)
            .map(row)}
        </>
      )}
    </Screen>
  );
}
function NativePlanner({
  currency,
  initial,
}: {
  currency: string;
  initial: number;
}) {
  const [principal, setPrincipal] = useState(String(initial || 10000));
  const [rate, setRate] = useState("5");
  const [years, setYears] = useState("5");
  const [tax, setTax] = useState("20");
  const [fee, setFee] = useState("0");
  const [reinvest, setReinvest] = useState(true);
  const [saved, setSaved] = useState<GrowthScenario[]>([]);
  const scenario: GrowthScenario = {
    id: "draft",
    name: "My scenario",
    productType: "custom",
    principal: Number(principal),
    annualRate: Number(rate),
    years: Number(years),
    compoundingPerYear: 12,
    taxRate: Number(tax),
    annualFeeRate: Number(fee),
    reinvestEarnings: reinvest,
    liquidity: "anytime",
    lockMonths: 0,
    earlyWithdrawalPenalty: 0,
  };
  const valid =
    [principal, rate, years, tax, fee].every(
      (v) => v.trim() !== "" && Number.isFinite(Number(v)),
    ) &&
    Number(principal) >= 0 &&
    Number(years) >= 1 &&
    Number(years) <= 50 &&
    Number(tax) >= 0 &&
    Number(tax) <= 100 &&
    Number(fee) >= 0 &&
    Number(fee) <= 100;
  const result = getGrowthScenarioResult(scenario);
  return (
    <>
      <Card>
        <Body muted={false}>Compare possible growth</Body>
        <Field
          label="Starting amount"
          value={principal}
          onChangeText={setPrincipal}
          keyboardType="decimal-pad"
        />
        <Field
          label="Annual return assumption (%)"
          value={rate}
          onChangeText={setRate}
          keyboardType="decimal-pad"
        />
        <Field
          label="Years (1–50)"
          value={years}
          onChangeText={setYears}
          keyboardType="number-pad"
        />
        <Field
          label="Tax on earnings (%)"
          value={tax}
          onChangeText={setTax}
          keyboardType="decimal-pad"
        />
        <Field
          label="Annual fee (%)"
          value={fee}
          onChangeText={setFee}
          keyboardType="decimal-pad"
        />
        <PlanAction
          title={reinvest ? "Reinvest earnings ✓" : "Withdraw earnings"}
          onPress={() => setReinvest(!reinvest)}
        />
        <Body>
          Monthly compounding. Scenario assumptions are illustrative and are not
          guaranteed returns.
        </Body>
      </Card>
      {valid ? (
        <Card>
          <Body muted={false}>
            Estimated value{" "}
            {money(String(result.selectedProjection.endingValue), currency)}
          </Body>
          {result.projections.map((p) => (
            <View key={p.year} style={{ gap: 8 }}>
              <Body>
                Year {p.year}: {money(String(p.endingValue), currency)}
              </Body>
              <Progress
                value={
                  result.selectedProjection.endingValue > 0
                    ? (p.endingValue / result.selectedProjection.endingValue) *
                      100
                    : 0
                }
              />
            </View>
          ))}
          <PlanAction
            title="Add to comparison"
            onPress={() =>
              setSaved((current) => [
                ...current.slice(-3),
                {
                  ...scenario,
                  id: String(Date.now()),
                  name: `Scenario ${current.length + 1}`,
                },
              ])
            }
          />
        </Card>
      ) : (
        <Notice>Enter valid scenario inputs.</Notice>
      )}
      {saved.map((s) => (
        <Card key={s.id}>
          <Body muted={false}>{s.name}</Body>
          <Body>
            {s.annualRate}% assumed return · {s.years} years
          </Body>
          <Body>
            {money(
              String(getGrowthScenarioResult(s).selectedProjection.endingValue),
              currency,
            )}
          </Body>
          <PlanAction
            title="Remove scenario"
            onPress={() =>
              setSaved((current) => current.filter((item) => item.id !== s.id))
            }
          />
        </Card>
      ))}
      {saved.length ? <Body>Comparisons remain in this session.</Body> : null}
    </>
  );
}
function NativeMarkets({ accounts }: { accounts: AccountRecord[] }) {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("us");
  const [symbol, setSymbol] = useState("");
  const [range, setRange] = useState("1M");
  const [newsOpen, setNewsOpen] = useState(false);
  useEffect(() => setNewsOpen(false), [symbol, market]);
  const [history, setHistory] = useState<{
    points: { date: string; value: number }[];
    provider?: string;
    currency?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!symbol) {
      setHistory(null);
      setLoading(false);
      setError("");
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    setHistory(null);
    void (
      session.demo
        ? Promise.resolve({ points: [] })
        : session.request<typeof history>(
            `market-history?workspaceId=${encodeURIComponent(session.profileId)}&symbol=${encodeURIComponent(symbol)}&market=${market}&range=${range}`,
          )
    )
      .then((r) => {
        if (active) setHistory(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    symbol,
    market,
    revision,
    range,
    session.demo,
    session.profileId,
    session.request,
  ]);
  return (
    <>
      <Card>
        <Field
          label="Search owned assets or ticker"
          value={query}
          onChangeText={setQuery}
        />
        <Body>Market</Body>
        {["us", "ph", "crypto"].map((value) => (
          <PlanAction
            key={value}
            title={`${value.toUpperCase()}${market === value ? " ✓" : ""}`}
            onPress={() => {
              setMarket(value);
              setSymbol("");
            }}
          />
        ))}
        {accounts
          .filter(
            (a) =>
              a.investmentSymbol &&
              `${a.name} ${a.investmentSymbol}`
                .toLowerCase()
                .includes(query.toLowerCase()),
          )
          .slice(0, 8)
          .map((a) => (
            <PlanAction
              key={a.id}
              title={`${a.name} · ${a.investmentSymbol}`}
              onPress={() => {
                setMarket(
                  a.investmentSubtype === "crypto"
                    ? "crypto"
                    : a.currency === "PHP"
                      ? "ph"
                      : "us",
                );
                setSymbol(a.investmentSymbol!);
              }}
            />
          ))}
        <PlanAction
          title="View market"
          tone="primary"
          disabled={!query.trim()}
          onPress={() => {
            setSymbol(query.trim().toUpperCase());
            setRevision((v) => v + 1);
          }}
        />
      </Card>
      {symbol ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {["1M", "3M", "1Y", "MAX"].map((value) => (
            <PlanAction
              key={value}
              title={`${value}${range === value ? " ✓" : ""}`}
              onPress={() => setRange(value)}
            />
          ))}
        </View>
      ) : null}
      {loading ? (
        <Body>Loading market history…</Body>
      ) : error ? (
        <Notice>{error}</Notice>
      ) : history ? (
        <Card>
          <Body muted={false}>
            {symbol} · {range}
          </Body>
          {history.points.length ? (
            history.points
              .filter(
                (_, i) =>
                  i % Math.max(1, Math.floor(history.points.length / 12)) === 0,
              )
              .map((p) => (
                <View key={p.date} style={{ gap: 8 }}>
                  <Body>
                    {p.date.slice(0, 10)} ·{" "}
                    {money(
                      String(p.value),
                      history.currency ?? (market === "ph" ? "PHP" : "USD"),
                    )}
                  </Body>
                  <Progress
                    value={
                      (p.value /
                        Math.max(
                          ...history.points.map((point) => point.value),
                        )) *
                      100
                    }
                  />
                </View>
              ))
          ) : (
            <Body>No market history available.</Body>
          )}
          <Body>Source: {history.provider ?? "No provider data"}</Body>
        </Card>
      ) : (
        <Body>Select an asset to view its market history.</Body>
      )}
      {symbol ? (
        newsOpen ? (
          <NativeAssetNews
            key={`${market}:${symbol}`}
            market={market}
            symbol={symbol}
          />
        ) : (
          <PlanAction
            title="Load recent news"
            onPress={() => setNewsOpen(true)}
          />
        )
      ) : null}
    </>
  );
}

const newsSample = {
  items: [] as {
    id: string;
    title: string;
    summary: string;
    source: string;
    publishedAt: string | null;
  }[],
};
function NativeAssetNews({
  symbol,
  market,
}: {
  symbol: string;
  market: string;
}) {
  const { data, error, reload } = usePlanData(
    `market-news?symbol=${encodeURIComponent(symbol)}&market=${market}`,
    newsSample,
  );
  return (
    <Card>
      <Body muted={false}>{symbol} news</Body>
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Retry news" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading news…</Body>
      ) : data.items.length ? (
        data.items.slice(0, 3).map((item) => (
          <View key={item.id} style={{ gap: 8 }}>
            <Body muted={false}>{item.title}</Body>
            <Body>{item.summary}</Body>
            <Body>
              {item.source}
              {item.publishedAt
                ? ` · ${new Date(item.publishedAt).toLocaleDateString()}`
                : ""}
            </Body>
          </View>
        ))
      ) : (
        <Body>No recent coverage available.</Body>
      )}
    </Card>
  );
}
