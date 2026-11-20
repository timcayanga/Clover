import { allocationViews, investmentAllocation, type AllocationView } from "../../shared/investment-allocation";
import { SpendingDonut } from "../src/spending-donut";
import { ContextualUpgrade } from "../src/contextual-upgrade";
import { AccountSummaryGrid } from "../src/account-summary-grid";
import { filterMarketHistoryByRange, type MarketRange } from "../../shared/market-history-range";
import { MARKET_OPTIONS, POPULAR_TICKERS, marketIcon, toggleTicker, type MarketKey } from "../../shared/market-selection";
import { ReportLineChart } from "../src/report-line-chart";
import { HoldingLogo } from "../src/holding-logo";
import { investmentQuoteIdentity, investmentTypeLabel } from "../../shared/investment-entry";
import { useLiveInvestmentValues } from "../src/use-live-investment-values";
import { CloverEmptyState } from "../src/clover-mascot";
import { DropdownFilter } from "../src/transaction-filters";
import { recordedSummary } from "../src/recorded-summary";
import { createScreenDataLoader, registerScreenRefresh } from "../src/screen-refresh";
import { EntryOverlay } from "../src/entry-overlay";
import { Text } from "../src/app-text";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/session";
import { AccountEditor, type AccountRecord } from "../src/account-editor";
import {
  Body,
  Card,
  Field,
  Notice,
  Screen,
  SectionTitle,
  money,
  useTheme,
  Icon,
} from "../src/ui";
import {
  PlanAction,
  PlanHeader,
  PlanTabs,
  usePlanData,
} from "../src/plan-ui";
import { investmentIcons } from "../src/investment-icons";
import { NativePlanner } from "../src/growth-planner";
import { sampleInvestments as sample } from "../src/investment-sample";
import {
  projectPortfolio,
  portfolioAssetGroups,
  portfolioInstitutions,
  portfolioInstitutionKey,
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
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [portfolioView, setPortfolioView] = useState("assets");
  const [allocationView, setAllocationView] = useState<AllocationView>("Markets");
  const [currency, setCurrency] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [institutionFilter, setInstitutionFilter] = useState("");
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
    setInstitutionFilter("");
    setSearch("");
    setFilters(false);
    setTab("Overview");
  }, [session.profileId]);
  const accounts = data?.accounts ?? [];
  const recordedHoldings = session.demo
    ? projectPortfolio(accounts, [])
    : (data?.holdings ?? projectPortfolio(accounts, []));
  const liveValues = useLiveInvestmentValues(recordedHoldings);
  const holdings = recordedHoldings.map(row => liveValues[row.id] === undefined ? row : { ...row, value: String(liveValues[row.id]) });
  const currencies = [...new Set(holdings.map((a) => a.currency))];
  const selectedCurrency = currencies.includes(currency)
    ? currency
    : (currencies[0] ?? "PHP");
  const visible = accounts.filter(
    (a) =>
      a.currency === selectedCurrency &&
      (type === "all" || a.investmentSubtype === type) &&
      (!institutionFilter || a.institution === institutionFilter) &&
      `${a.name} ${a.institution} ${a.investmentSymbol}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const visibleHoldings = holdings.filter(
    (h) =>
      h.currency === selectedCurrency &&
      (type === "all" || h.subtype === type) &&
      (!institutionFilter || h.institution === institutionFilter) &&
      `${h.name} ${h.institution} ${h.symbol}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const otherCurrencyAccounts = new Set(holdings.filter(h => h.currency !== selectedCurrency)
    .map(h => h.valuationAccountId ?? h.accountId));
  const institutionHistory = type === "all" && !search.trim() && !institutionFilter && !data?.limited
    ? data?.history.filter(v => !otherCurrencyAccounts.has(v.accountId))
    : undefined;
  const valuation = recordedSummary(visibleHoldings.map(h => h.value));
  const total = valuation.value ?? 0;
  const known = visibleHoldings.filter(
    (h) => recordedNumber(h.value) !== null && recordedNumber(h.cost) !== null,
  );
  const cost = known.reduce((n, h) => n + Number(h.cost), 0);
  const gain = known.reduce((n, h) => n + Number(h.value) - Number(h.cost), 0);
  const pro =
    session.demo ||
    session.data?.entitlement.fullFeatureAccess ||
    (session.data?.entitlement.planTier === "pro" || session.data?.entitlement.planTier === "premium");
  const entryOverlay = editor ? (
    <EntryOverlay onClose={() => setEditor(null)}>
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
    </EntryOverlay>
  ) : null;
  // A live estimate must never become the initial recorded value of an edit.
  const openHolding = (item: PortfolioHolding) => setHolding(recordedHoldings.find(row => row.id === item.id) ?? item);
  async function deleteHolding(item: PortfolioHolding) {
    const resource = item.source === "snapshot" || item.positionId ? `investment-holdings/${item.positionId ?? item.id}` : `accounts/${item.accountId}`;
    await session.request(`${resource}?workspaceId=${encodeURIComponent(session.profileId)}`, {
      method: "DELETE", body: JSON.stringify({ workspaceId: session.profileId }),
    });
    setData(current => current ? { ...current,
      holdings: current.holdings?.filter(row => row.id !== item.id),
      accounts: resource.startsWith("accounts/") ? current.accounts.filter(row => row.id !== item.accountId) : current.accounts,
    } : current);
    reload();
  }
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
        name={holdings.find(h => portfolioInstitutionKey(h) === institution)?.institution?.trim() || "Other investments"}
        currency={selectedCurrency}
        holdings={holdings.filter(
          (h) =>
            portfolioInstitutionKey(h) === institution &&
            h.currency === selectedCurrency,
        )}
        history={data?.history ?? []}
        onBack={() => setInstitution(null)}
        onHolding={openHolding}
        onDelete={session.demo ? undefined : deleteHolding}
        onChanged={session.demo ? undefined : reload}
        onAdd={() => setEditor({ account: null })}
      />
    );
  return (
    <Screen layout="dashboard" gap={20}>
      {entryOverlay}
      <PlanHeader
        title="Investments"
        stackedTitle={width < 360}
        leading={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              filters ? "Close filters" : "Filter investments"
            }
            onPress={() => setFilters(current => !current)}
            accessibilityState={{ expanded: filters }}
            style={{
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="options-outline" size={18} />
          </Pressable>
        }
        trailing={
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
        }
      />
      {filters ? (
        <Card>
          <Field
            label="Search investments"
            value={search}
            onChangeText={setSearch}
          />
          <DropdownFilter label="Currency" value={selectedCurrency} options={currencies.map(value => ({value,label:value}))} onChange={setCurrency} />
          <DropdownFilter label="Asset Type" value={type} options={[{value:"all",label:"All Types"}, ...[...new Set(holdings.map(holding => holding.subtype))].map(value => ({value,label:investmentTypeLabel(value)}))]} onChange={setType} />
          <DropdownFilter label="Institution" value={institutionFilter} options={[{value:"",label:"All Institutions"}, ...[...new Set(holdings.map(holding => holding.institution).filter((value): value is string => Boolean(value)))].sort().map(value => ({value,label:value}))]} onChange={setInstitutionFilter} />
          <PlanAction
            title="Clear filters"
            onPress={() => {
              setSearch("");
              setType("all");
              setInstitutionFilter("");
            }}
          />
        </Card>
      ) : null}
      <PlanTabs
        compact
        items={[
          "Overview",
          "Portfolio",
          "Planner · Plus",
          "Markets · Plus",
          "Analysis · Plus",
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
      ) : tab.includes("Plus") && !pro ? (
        <ContextualUpgrade tier="free" context={tab.startsWith("Planner") ? "planner" : tab.startsWith("Markets") ? "markets" : "analysis"} />
      ) : tab === "Overview" ? (
        <>
          <AccountSummaryGrid metrics={[
            { label: "Estimated Value", value: valuation.value === null ? "—" : money(String(total), selectedCurrency), negative: total < 0 },
            { label: "Gain/Loss", value: known.length ? money(String(gain), selectedCurrency) : "—", negative: gain < 0 },
            { label: "Return", value: cost > 0 ? `${((gain / cost) * 100).toFixed(2)}%` : "—", negative: cost > 0 && gain < 0 },
          ]} />
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
              overview
              accountOptions={[...new Map(visibleHoldings.map((h) => [h.valuationAccountId ?? h.accountId, { id: h.valuationAccountId ?? h.accountId, name: accounts.find((a) => a.id === h.accountId)?.name ?? h.name }])).values()]}
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
          <View style={{ backgroundColor: colors.white, borderRadius: 12, overflow: "hidden" }}>
          {portfolioView === "assets"
            ? <View>{portfolioAssetGroups(visibleHoldings).map(({ id, holding, members }) => {
                const multiple = members.length > 1;
                return <View key={id}>
                  <HoldingRow holding={holding}
                    subtitle={multiple ? [holding.symbol, `${members.length} holdings`].filter(Boolean).join(" · ") : undefined}
                    onDelete={multiple || session.demo ? undefined : () => deleteHolding(holding)}
                    onPress={() => multiple ? setExpandedAsset(expandedAsset === id ? null : id) : openHolding(holding)} />
                  {multiple && expandedAsset === id && <View style={{paddingLeft: 20}}>
                    {members.map(h => <HoldingRow key={h.id} holding={h} subtitle={h.institution || h.symbol || undefined}
                      onPress={() => openHolding(h)} onDelete={session.demo ? undefined : () => deleteHolding(h)} />)}
                  </View>}
                </View>;
              })}</View>
            : portfolioInstitutions(visibleHoldings, institutionHistory).map(({ row, count }) => (
                <HoldingRow key={row.id} holding={row}
                  subtitle={`${count} ${count === 1 ? "holding" : "holdings"} · ${row.currency}`}
                  onPress={() => setInstitution(row.id)} />
              ))}
          </View>
          {!visibleHoldings.length ? (
            <CloverEmptyState pose="investments">No matching holdings.</CloverEmptyState>
          ) : null}
        </>
      ) : tab.startsWith("Planner") ? (
        <NativePlanner
          key={`${session.profileId}:${selectedCurrency}`}
          currency={selectedCurrency}
          initial={total}
        />
      ) : tab.startsWith("Markets") ? (
        <NativeMarkets key={session.profileId} holdings={recordedHoldings} />
      ) : (
        <>
          <Card>
            <SectionTitle>Allocation</SectionTitle>
            <DropdownFilter label="Currency" value={selectedCurrency} options={currencies.map(value => ({value, label:value}))} onChange={setCurrency}/>
            <DropdownFilter label="Group By" value={allocationView} options={allocationViews.map(value => ({value, label:value}))}
              onChange={value => setAllocationView(value as AllocationView)}/>
            <AllocationDonut holdings={visibleHoldings} currency={selectedCurrency} view={allocationView}/>
          </Card>
          <Card>
            <SectionTitle>Return Breakdown</SectionTitle>
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
        </>
      )}
    </Screen>
  );
}
function AllocationDonut({holdings, currency, view}: {holdings: PortfolioHolding[]; currency:string; view:AllocationView}) {
  const {colors} = useTheme();
  const {slices} = investmentAllocation(holdings.map(h => ({...h, value: recordedNumber(h.value)})), currency, view);
  if (!slices.length) return <Body>No positive holding values in this selection.</Body>;
  return <>
    <SpendingDonut categories={slices} currency={currency} totalLabel="Portfolio value"/>
    {slices.map(slice => <View key={slice.key} style={{flexDirection:"row", alignItems:"center", gap:8, paddingVertical:6}}>
      <View style={{width:10, height:10, borderRadius:5, backgroundColor:slice.color}}/>
      <Text style={{flex:1, color:colors.ink}}>{slice.name}</Text>
      <Text style={{color:colors.ink}}>{money(String(slice.amount),currency)} · {slice.percent.toFixed(1)}%</Text>
    </View>)}
  </>;
}

function NativeMarkets({ holdings }: { holdings: PortfolioHolding[] }) {
  const { colors } = useTheme();
  const session = useSession();
  const [market, setMarket] = useState<MarketKey>("us");
  const [menu, setMenu] = useState<"Markets" | "Assets" | null>(null);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("1M");
  const owned = holdings.flatMap(h => {
    const identity = investmentQuoteIdentity(h);
    return identity ? [{ ...identity, name: h.name, logoUrl: h.logoUrl, subtype: h.subtype }] : [];
  });
  function assetsFor(m: MarketKey): {name:string; symbol:string; market: MarketKey; subtype:string; logoUrl?:string | null}[] {
    const catalog = POPULAR_TICKERS[m].map(a => ({...a, subtype: m === "crypto" ? "crypto" : "stock",
      logoUrl: `/assets/investments/${m === "ph" ? "philippines" : m}/${encodeURIComponent(a.symbol)}.svg`}));
    return [...new Map([...catalog, ...owned.filter(a => a.market === m)].map(a => [a.symbol, a])).values()];
  }
  const assets = assetsFor(market);
  const [selection, setSelection] = useState(() => toggleTicker([], assets[0].symbol));
  const [results, setResults] = useState<Record<string, {points: {date:string; value:number}[]; error?:string}>>({});
  const prices = useRef(new Map<string, {points: {date:string; value:number}[]; expires: number}>());
  const keyOf = (symbol: string) => [market, range, symbol].join(":");
  useEffect(() => {
    let active = true;
    let force = false;
    const refresh = createScreenDataLoader({
      active: () => active,
      load: () => Promise.all(selection.map(async ({symbol}) => {
        const key = [market, range, symbol].join(":");
        try {
          const cached = prices.current.get(key);
          if (!force && cached && cached.expires > Date.now()) return [key, {points: cached.points}] as const;
          const data = session.demo ? {points: [], currency: market === "ph" ? "PHP" : "USD"} : await session.request<{currency:string;points:{date:string; value:number}[]}>(
            `market-history?workspaceId=${encodeURIComponent(session.profileId)}&symbol=${encodeURIComponent(symbol)}&market=${market}&range=${range}`);
          if (data.currency !== (market === "ph" ? "PHP" : "USD"))
            return [key, {points: [], error: "Quote currency unavailable for comparison"}] as const;
          const points = filterMarketHistoryByRange(data.points, range as MarketRange);
          if (active) {
            if (prices.current.size >= 64) prices.current.delete(prices.current.keys().next().value!);
            prices.current.set(key, {points, expires: Date.now()+60_000});
          }
          return [key, {points}] as const;
        } catch (cause) { return [key, {points: [], error: cause instanceof Error ? cause.message : "History unavailable"}] as const; }
      })),
      apply: rows => setResults(Object.fromEntries(rows)),
      error: () => setResults({}),
    });
    void refresh();
    const unregister = registerScreenRefresh("/investments", () => {force = true; return refresh();});
    return () => { active = false; unregister(); };
  }, [market, range, selection, session.request, session.demo, session.profileId]);
  for (const {symbol} of selection) {
    if (!assets.some(a => a.symbol === symbol)) assets.push({name:symbol, symbol, market, subtype:market === "crypto" ? "crypto" : "stock"});
  }
  const term = query.trim().toUpperCase();
  const options = assets.filter(a => (a.name + " " + a.symbol).toUpperCase().includes(term));
  const elsewhere = MARKET_OPTIONS.some(m => m.key !== market && assetsFor(m.key).some(a => a.symbol === term));
  if (!elsewhere && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(term) && !assets.some(a => a.symbol === term)) {
    options.push({name: term, symbol: term, market, subtype: market === "crypto" ? "crypto" : "stock", logoUrl: null});
  }
  const chart = selection.map(s => ({name: s.symbol, color: s.color, points: results[keyOf(s.symbol)]?.points ?? []}));
  return <>
    <Card>
      <View style={{flexDirection:"row", gap:10}}>
        {(["Markets","Assets"] as const).map(label => <Pressable key={label} accessibilityRole="button"
          accessibilityState={{expanded:menu === label}} onPress={() => {setMenu(menu === label ? null : label); setQuery("");}}
          style={{flex:1, minHeight:54, borderColor:colors.line, borderWidth:1, borderRadius:12, padding:8}}>
          <Text style={{color:colors.muted}}>{label}</Text>
          <Text numberOfLines={1} style={{color:colors.ink}}>{label === "Markets" ? marketIcon[market]+" "+market.toUpperCase() : selection.length === 1 ? selection[0].symbol : selection.length+" selected"} ▾</Text>
        </Pressable>)}
      </View>
      {menu === "Markets" && MARKET_OPTIONS.map(m => <Pressable key={m.key} accessibilityRole="radio"
        accessibilityState={{checked:market === m.key}} style={{paddingVertical:12}}
        onPress={() => {if (m.key !== market) {setMarket(m.key); setSelection(toggleTicker([], assetsFor(m.key)[0].symbol));} setMenu(null);}}>
        <Body muted={false}>{marketIcon[m.key]}  {m.description}{market === m.key ? "  ✓" : ""}</Body>
      </Pressable>)}
      {menu === "Assets" && <>
        <Field label="Search assets or ticker" value={query} onChangeText={setQuery}/>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{maxHeight:260}}>
        {options.map(a => {
          const selected = selection.find(s => s.symbol === a.symbol);
          return <Pressable key={a.symbol} accessibilityRole="checkbox" accessibilityState={{checked:!!selected}}
            onPress={() => setSelection(current => toggleTicker(current, a.symbol))}
            style={{minHeight:44, flexDirection:"row", alignItems:"center", gap:10, borderBottomWidth:1, borderColor:colors.line}}>
            <HoldingLogo holding={a} size={26}/><Text style={{flex:1, color:colors.ink}}>{a.name} · {a.symbol}</Text>
            {selected && <Text style={{color:selected.color}}>● ✓</Text>}
          </Pressable>;
        })}
        {!options.length && <Body>No matching assets in this market.</Body>}
        </ScrollView>
        <PlanAction title="Done" onPress={() => setMenu(null)}/>
      </>}
    </Card>
    {selection.length ? <>
      <Card>
        <Body muted={false}>Price history · {market === "ph" ? "PHP" : "USD"}</Body>
        <Choices value={range} options={["1M","3M","1Y","MAX"].map(value => ({value,label:value}))} onChange={setRange}/>
        {chart.some(s => s.points.length > 0) && <ReportLineChart series={chart} currency={market === "ph" ? "PHP" : "USD"}/>}
        {selection.filter(s => !results[keyOf(s.symbol)]?.points.length).map(s =>
          <Body key={s.symbol}>{s.symbol} · {results[keyOf(s.symbol)]?.error ?? (results[keyOf(s.symbol)] ? "No history available" : "Loading history…")}</Body>)}
      </Card>
      {selection.map(s => <NativeAssetNews key={market+s.symbol} market={market} symbol={s.symbol} name={assets.find(a => a.symbol === s.symbol)?.name ?? s.symbol}/>)}
    </> : <Body>Select an asset to view its price history and news.</Body>}
  </>;
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
  name,
  symbol,
  market,
}: {
  name: string;
  symbol: string;
  market: string;
}) {
  const { data, error, reload } = usePlanData(
    `market-news?symbol=${encodeURIComponent(symbol)}&market=${market}&name=${encodeURIComponent(name)}`,
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
