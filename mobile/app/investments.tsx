import { Text } from "../src/app-text";
import { LinearGradient } from "expo-linear-gradient";
import { compactSummaryMoney } from "../../shared/summary-format";
import { useEffect, useState } from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
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
import { NativePlanner } from "../src/growth-planner";
import { sampleInvestments as sample } from "../src/investment-sample";
import {
  projectPortfolio,
  type PortfolioHolding,
  recordedNumber,
} from "../../shared/investment-portfolio";
import {
  HoldingRow,
  InstitutionDetails,
  SnapshotHoldingDetails,
  ValuationHistory,
} from "../src/investment-views";
import { Choices } from "../src/transaction-entry";
export default function Investments() {
  const session = useSession();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { data, setData, error, reload } = usePlanData("investments", sample);
  const [tab, setTab] = useState("Overview");
  const [institution, setInstitution] = useState<string | null>(null);
  const [holding, setHolding] = useState<PortfolioHolding | null>(null);
  const [portfolioView, setPortfolioView] = useState("assets");
  const [currency, setCurrency] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [filters, setFilters] = useState(false);
  const [editor, setEditor] = useState<{
    account: AccountRecord | null;
  } | null>(null);
  useEffect(() => {
    setEditor(null);
    setInstitution(null);
    setHolding(null);
    setCurrency("");
    setType("all");
    setSearch("");
    setFilters(false);
    setTab("Overview");
  }, [session.profileId]);
  const accounts = data?.accounts ?? [];
  const holdings = session.demo
    ? projectPortfolio(accounts, [])
    : (data?.holdings ?? projectPortfolio(accounts, []));
  const currencies = [...new Set(holdings.map((a) => a.currency))];
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
  const visibleHoldings = holdings.filter(
    (h) =>
      h.currency === selectedCurrency &&
      (type === "all" || h.subtype === type) &&
      `${h.name} ${h.institution} ${h.symbol}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = visibleHoldings.reduce((n, h) => n + Number(h.value ?? 0), 0);
  const completeValue = visibleHoldings.every(
    (h) => recordedNumber(h.value) !== null,
  );
  const known = visibleHoldings.filter(
    (h) => recordedNumber(h.value) !== null && recordedNumber(h.cost) !== null,
  );
  const cost = known.reduce((n, h) => n + Number(h.cost), 0);
  const gain = known.reduce((n, h) => n + Number(h.value) - Number(h.cost), 0);
  const pro =
    session.demo ||
    session.data?.entitlement.fullFeatureAccess ||
    (session.data?.entitlement.planTier === "pro" || session.data?.entitlement.planTier === "premium");
  if (editor)
    return (
      <AccountEditor
        initial={editor.account}
        defaultType="investment"
        defaultInstitution={institution ?? ""}
        defaultCurrency={selectedCurrency}
        onClose={() => {
          setEditor(null);
          if (!session.demo) reload();
        }}
        onSaved={(record) => {
          setEditor(null);
          setHolding(null);
          if (session.demo)
            setData((current) => ({
              ...current!,
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
  const openHolding = (item: PortfolioHolding) => setHolding(item);
  if (holding)
    return (
      <SnapshotHoldingDetails
        holding={holding}
        onChanged={() => {
          setHolding(null);
          reload();
        }}
        history={data?.history ?? []}
        onBack={() => setHolding(null)}
        onAccount={() => {
          const account = accounts.find((a) => a.id === holding.accountId);
          if (account) setEditor({ account });
        }}
      />
    );
  if (institution)
    return (
      <InstitutionDetails
        name={institution}
        currency={selectedCurrency}
        holdings={holdings.filter(
          (h) =>
            (h.institution || "Other investments") === institution &&
            h.currency === selectedCurrency,
        )}
        history={data?.history ?? []}
        onBack={() => setInstitution(null)}
        onHolding={openHolding}
        onChanged={session.demo ? undefined : reload}
        onAdd={() => setEditor({ account: null })}
      />
    );
  return (
    <Screen gap={20}>
      <PlanHeader
        title="Investments"
        stackedTitle={width < 360}
        trailing={
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                filters ? "Close filters" : "Filter investments"
              }
              onPress={() => setFilters(!filters)}
              accessibilityState={{ expanded: filters }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.white,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="options-outline" size={18} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add Investments"
              onPress={() => setEditor({ account: null })}
              hitSlop={4}
            >
              <LinearGradient
                colors={["#03a8c0", "#34d3d0"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="add" size={22} color="#fff" />
              </LinearGradient>
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
          {["all", ...new Set(holdings.map((a) => a.subtype))].map((t) => (
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
        compact
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
        <Notice>This section requires Clover Plus.</Notice>
      ) : tab === "Overview" ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SummaryCard
              title="Est. value"
              color={colors.positive}
              value={
                completeValue
                  ? compactSummaryMoney(total, selectedCurrency)
                  : "—"
              }
            />
            <SummaryCard
              title="Gain/loss"
              value={
                known.length ? compactSummaryMoney(gain, selectedCurrency) : "—"
              }
              color={
                gain === 0
                  ? colors.ink
                  : gain > 0
                    ? colors.positive
                    : colors.danger
              }
            />
            <SummaryCard
              title="Return"
              value={cost > 0 ? `${((gain / cost) * 100).toFixed(2)}%` : "—"}
              color={
                gain === 0
                  ? colors.ink
                  : gain > 0
                    ? colors.positive
                    : colors.danger
              }
            />
          </View>
          <Body>
            Portfolio values are estimates. Check your investment apps for the latest amounts.
          </Body>
          {visibleHoldings.length ? (
            <ValuationHistory
              history={data?.history ?? []}
              accountIds={[
                ...new Set(
                  visibleHoldings.map(
                    (h) => h.valuationAccountId ?? h.accountId,
                  ),
                ),
              ]}
              currency={selectedCurrency}
            />
          ) : null}
          {data?.limited ? (
            <Notice>
              Showing the most recent available portfolio records. Older history
              may be incomplete.
            </Notice>
          ) : null}
          {visibleHoldings.length ? (
            <PlanAction
              title="View all holdings"
              onPress={() => setTab("Portfolio")}
            />
          ) : (
            <>
              <Card>
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 16,
                    color: "#7A879C",
                  }}
                >
                  Estimated value history
                </Text>
                <Body>Add an investment to start tracking your growth.</Body>
                <PlanAction
                  title="+ Add Investment"
                  tone="primary"
                  onPress={() => setEditor({ account: null })}
                />
              </Card>
            </>
          )}
        </>
      ) : tab === "Portfolio" ? (
        <>
          <Choices
            value={portfolioView}
            options={[
              { value: "assets", label: "Assets" },
              { value: "institutions", label: "Institutions" },
            ]}
            onChange={setPortfolioView}
          />
          {portfolioView === "assets"
            ? visibleHoldings.map((h) => (
                <HoldingRow
                  key={h.id}
                  holding={h}
                  onPress={() => openHolding(h)}
                />
              ))
            : [
                ...new Set(
                  visibleHoldings.map(
                    (h) => h.institution || "Other investments",
                  ),
                ),
              ].map((name) => {
                const members = visibleHoldings.filter(
                  (h) => (h.institution || "Other investments") === name,
                );
                const value = members.every(
                  (h) => recordedNumber(h.value) !== null,
                )
                  ? String(members.reduce((n, h) => n + Number(h.value), 0))
                  : null;
                return (
                  <HoldingRow
                    key={name}
                    onPress={() => setInstitution(name)}
                    holding={{
                      id: name,
                      accountId: members[0].accountId,
                      source: "account",
                      name,
                      institution: name,
                      subtype: "institution",
                      symbol: `${members.length} holdings · ${selectedCurrency}`,
                      currency: selectedCurrency,
                      quantity: null,
                      value,
                      cost: null,
                      date: null,
                    }}
                  />
                );
              })}
          {!visibleHoldings.length ? (
            <Notice>No matching holdings.</Notice>
          ) : null}
        </>
      ) : tab.startsWith("Planner") ? (
        <NativePlanner
          key={`${session.profileId}:${selectedCurrency}`}
          currency={selectedCurrency}
          initial={total}
        />
      ) : tab.startsWith("Markets") ? (
        <NativeMarkets accounts={accounts} />
      ) : (
        <>
          <Card>
            <Body muted={false}>Allocation · {selectedCurrency}</Body>
            {visibleHoldings.length ? (
              visibleHoldings
                .slice()
                .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
                .map((a) => (
                  <View key={a.id} style={{ gap: 8 }}>
                    <Body>
                      {a.name} ·{" "}
                      {total > 0
                        ? ((Number(a.value ?? 0) / total) * 100).toFixed(1)
                        : 0}
                      %
                    </Body>
                    <Progress
                      value={
                        total > 0 ? (Number(a.value ?? 0) / total) * 100 : 0
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
              {known.length} of {visibleHoldings.length} holdings have a
              recorded purchase value.
            </Body>
            <Body>Purchase value {money(String(cost), selectedCurrency)}</Body>
            <Body>
              Unrealized gain / loss{" "}
              {known.length ? money(String(gain), selectedCurrency) : "—"}
            </Body>
            <Body>These are recorded results, not forecasts.</Body>
          </Card>
          {visibleHoldings
            .slice()
            .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
            .slice(0, 5)
            .map((h) => (
              <HoldingRow
                key={h.id}
                holding={h}
                onPress={() => openHolding(h)}
              />
            ))}
        </>
      )}
    </Screen>
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
