import { reportTransactionFilters } from "../../src/report-drilldown";
import { AdaptiveDetail, useDetailPane } from "../../src/adaptive-detail";
import { useAdaptiveLayout } from "../../src/adaptive";
import { registerScreenRefresh } from "../../src/screen-refresh";
import { transactionReviewReasons } from "../../src/transaction-review";
import { CloverEmptyState } from "../../src/clover-mascot";
import { AccountBrandLogo } from "../../src/account-brand-logo";
import { Text } from "../../src/app-text";
import { SummaryCard } from "../../src/plan-ui";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View, useWindowDimensions } from "react-native";
import { matchesDemoFilters, demoFilterOptions } from "../../src/transaction-filter-query";
import { TransactionFilterPanel } from "../../src/transaction-filters";
import { hasTransactionFilters, emptyTransactionFilters, transactionFilterQuery, type TransactionFilters, type FilterOptions } from "../../src/transaction-filter-query";
import { useSession } from "../../src/session";
import type { Transaction, TransactionPage } from "../../src/types";
import {
  Screen,
  Heading,
  Card,
  CategoryMark,
  Icon,
  Body,
  Button,
  Field,
  Notice,
  dateLabel,
  money,
  useTheme,
} from "../../src/ui";

export default function Transactions() {
  const { colors, styles, dark } = useTheme();
  const { fontScale } = useWindowDimensions();
  const adaptive = useAdaptiveLayout();
  const wide = useDetailPane();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchHeight = Math.max(38, Math.ceil(20 * fontScale + 16));
  const { demo, rows: samples, profileId, request, cached } = useSession();
  const [summary, setSummary] = useState<TransactionPage["summary"]>();
  const [filters, setFilters] = useState(false);
  const params = useLocalSearchParams<{ review?: string; query?: string; report?: string }>();
  const [filterValues, setFilterValues] = useState<TransactionFilters>(emptyTransactionFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({accounts:[],categories:[],tags:[]});
  const [optionError, setOptionError] = useState("");
  useEffect(() => {
    setFilterValues(emptyTransactionFilters);
    setFilters(false);
    setSelectedId(null);
    setFilterOptions({accounts:[],categories:[],tags:[]});
  }, [profileId]);
  useEffect(() => {
    if (!filters || demo) return;
    let active = true;
    setOptionError("");
    request<FilterOptions>(`options?workspaceId=${encodeURIComponent(profileId)}&context=filters`)
      .then(data => { if (active) setFilterOptions(data); })
      .catch((e: Error) => { if (active) setOptionError(e.message); });
    return () => { active = false; };
  }, [filters, demo, profileId, request]);
  useEffect(() => {
    if (params.review === "pending_review") {
      setFilterValues(current => ({ ...current, reviewFilter: "pending" }));
      setFilters(true);
    }
  }, [params.review]);
  useEffect(() => {
    if (!params.report) return;
    const incoming = reportTransactionFilters(params.report);
    if (incoming) { setFilterValues(incoming.filters); setQuery(""); setFilters(true); }
  }, [params.report, profileId]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { if (params.query !== undefined) setQuery(params.query); }, [params.query]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const loading = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (next = 1, refresh = false) => {
      const ticket = ++sequence.current;
      loading.current = true;
      setBusy(true);
      setError("");
      const resource = `transactions?workspaceId=${encodeURIComponent(profileId)}&query=${encodeURIComponent(search)}&page=${next}&${transactionFilterQuery(filterValues)}`;
      if (next === 1 && !refresh) {
        const previous = cached<TransactionPage>(resource);
        setRows(previous?.transactions ?? []);
        setSummary(previous?.summary);
        setTotal(previous?.totalCount ?? 0);
      }
      setRefreshing(refresh);
      try {
        const data: TransactionPage = demo
          ? {
              transactions: samples.filter(
                (r) =>
                  matchesDemoFilters(r, filterValues) &&
                  `${r.merchantClean} ${r.accountName} ${r.categoryName} ${r.tags?.map((t) => t.name).join(" ")}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              ),
              totalCount: samples.length,
              page: 1,
            }
          : await request(
              `transactions?workspaceId=${encodeURIComponent(profileId)}&query=${encodeURIComponent(search)}&page=${next}&${transactionFilterQuery(filterValues)}`,
            );
        if (ticket !== sequence.current) return false;
        setRows((previous) =>
          next === 1
            ? data.transactions
            : [
                ...previous,
                ...data.transactions.filter(
                  (row) => !previous.some((item) => item.id === row.id),
                ),
              ],
        );
        setSummary(data.summary);
        setPage(next);
        setTotal(demo ? data.transactions.length : data.totalCount);
        return true;
      } catch (e) {
        if (ticket === sequence.current) setError((e as Error).message);
        return false;
      } finally {
        if (ticket === sequence.current) {
          loading.current = false;
          setBusy(false);
          setRefreshing(false);
        }
      }
    },
    [demo, samples, profileId, request, search, filterValues],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      const unregister = registerScreenRefresh("/transactions", () => load(1, true));
      return () => {
        unregister();
        sequence.current++;
        loading.current = false;
      };
    }, [load]),
  );
  const selected = rows.find(row => row.id === selectedId);
  const openDetails = (id: string) => router.push({ pathname: "/transaction/[id]", params: { id } });
  const detail = <Screen>
    {selected ? <>
      <Heading>{selected.merchantClean ?? selected.merchantRaw}</Heading>
      <Card>
        <Text style={{ color: colors.ink, fontSize: 24 }}>{money(selected.amount, selected.currency)}</Text>
        <Body>{dateLabel(selected.date)}</Body>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AccountBrandLogo size={28} account={{ name: selected.accountName, institution: selected.institution ?? null, type: selected.accountType ?? "bank", brandLogoUrl: selected.brandLogoUrl ?? null }} /><Body muted={false}>{selected.accountName}</Body></View>
        <Body>{selected.categoryName ?? "Uncategorized"}</Body>
        {selected.userNote ? <Body>{selected.userNote}</Body> : null}
        {transactionReviewReasons(selected).map(reason => <Notice key={reason}>{reason}</Notice>)}
        <Button title="Open transaction details" onPress={() => openDetails(selected.id)} />
      </Card>
      <Button secondary title="Clear selection" onPress={() => setSelectedId(null)} />
    </> : <Body>Select a transaction to see its details here.</Body>}
  </Screen>;
  return <AdaptiveDetail selected={Boolean(selected)} detail={detail} list={(
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ width: "100%", maxWidth: 960, alignSelf: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8, flexShrink: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field
              accessibilityLabel="Search transactions"
              placeholder="Search"
              style={{ height: searchHeight, minHeight: searchHeight, borderRadius: 999, paddingVertical: 0, fontSize: 13 }}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Filter transactions" accessibilityState={{expanded:filters}} onPress={() => setFilters(v=>!v)} hitSlop={4} style={{width:searchHeight,height:searchHeight,borderRadius:999,borderWidth:1,borderColor:colors.line,backgroundColor:colors.white,alignItems:"center",justifyContent:"center"}}>
            <Icon line name="options-outline" size={20} color={colors.teal}/>
          </Pressable>
        </View>
        {filters ? <TransactionFilterPanel value={filterValues} options={demo ? demoFilterOptions(samples) : filterOptions} onClose={()=>setFilters(false)} onApply={next=>{setFilterValues(next);setFilters(false);}} /> : null}
        {filters && optionError ? <Notice>Unable to load filter choices. Close and reopen Filters to retry.</Notice> : null}
        {error ? (
          <Notice>{error}</Notice>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={() => { if (!loading.current) void load(1, true); }}
        contentContainerStyle={{
          paddingHorizontal: 0,
          paddingBottom: adaptive.dockHeight + 48,
          maxWidth: 960,
          width: "100%",
          alignSelf: "center",
        }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.merchantClean ?? item.merchantRaw}, ${item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}${money(item.amount.replace(/^-/, ""), item.currency)}, ${dateLabel(item.date)}.${transactionReviewReasons(item).length ? ` ${transactionReviewReasons(item).join(". ")}.` : ""} Open transaction.`}
            accessibilityState={{ selected: wide && selectedId === item.id }}
            onPress={() => wide ? setSelectedId(item.id) : openDetails(item.id)}
            style={({ pressed }) => ({
              minHeight: 68,
              paddingVertical: 12,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: wide && selectedId === item.id ? colors.pale : colors.white,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <CategoryMark name={item.categoryName} size={24} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  fontSize: 13,
                  fontFamily: "Poppins-SemiBold",
                  color: colors.ink,
                }}
              >
                {item.merchantClean ?? item.merchantRaw}
              </Text>
              {transactionReviewReasons(item).length > 0 ? <View accessible accessibilityLabel={transactionReviewReasons(item).join(". ")}><Icon line name="warning-outline" size={12} color="#D6A226"/></View> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <AccountBrandLogo size={16} account={{ name: item.accountName, institution: item.institution ?? null, type: item.accountType ?? "bank", brandLogoUrl: item.brandLogoUrl ?? null }} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 10, color: colors.muted }}>
                {item.accountName}
                {item.lastFour && !item.accountName.endsWith(item.lastFour)
                  ? ` ${item.lastFour}`
                  : ""} · {dateLabel(item.date)}
              </Text>
              </View>
              {transactionReviewReasons(item).length > 0 ? <Text style={{ fontSize: 10, color: dark ? "#F2CE76" : "#87610D" }}>{transactionReviewReasons(item)[0]}</Text> : null}
            </View>
            <Text
              style={{
                maxWidth: "30%",
                fontSize: 12,
                fontFamily: "Poppins-SemiBold",
                color:
                  item.type === "income"
                    ? colors.positive
                    : item.type === "expense"
                      ? colors.danger
                      : colors.ink,
              }}
            >
              {item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}{money(item.amount.replace(/^-/, ""), item.currency)}
            </Text>
            <Icon line name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
        )}
        ListEmptyComponent={
          !busy ? (
            <CloverEmptyState pose={error ? "error" : "receipt"}>
              {error ? "Pull down to retry." : hasTransactionFilters(filterValues, search) ? "No matching transactions. Try another search or filter." : "Add your first transaction. Upload a receipt or add one manually."}
            </CloverEmptyState>
          ) : (
            !refreshing ? <View accessibilityLabel="Loading transactions" accessibilityRole="progressbar" style={{ padding: 24, alignItems: "center" }}><ActivityIndicator color={colors.teal} /></View> : null
          )
        }
        ListFooterComponent={
          rows.length > 0 && rows.length < total && !demo && !refreshing ? (
            <Button
              title={busy ? "Loading…" : "Load more"}
              disabled={busy}
              secondary
              onPress={() => {
                if (!loading.current) void load(page + 1);
              }}
            />
          ) : null
        }
      />
    </View>
  )} />;
}
