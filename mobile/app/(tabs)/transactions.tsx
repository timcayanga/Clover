import { TransactionPagination } from "../../src/transaction-pagination";
import { MerchantLogo } from "../../src/merchant-logo";
import { SwipeDeleteRow } from "../../src/swipe-delete-row";
import { reportTransactionFilters } from "../../src/report-drilldown";
import { AdaptiveDetail, useDetailPane } from "../../src/adaptive-detail";
import { useAdaptiveLayout } from "../../src/adaptive";
import { registerScreenRefresh } from "../../src/screen-refresh";
import { transactionReviewReasons } from "../../src/transaction-review";
import { CloverEmptyState } from "../../src/clover-mascot";
import { AccountBrandLogo } from "../../src/account-brand-logo";
import { Text } from "../../src/app-text";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, View, useWindowDimensions } from "react-native";
import { matchesDemoFilters, demoFilterOptions } from "../../src/transaction-filter-query";
import { TransactionFilterPanel } from "../../src/transaction-filters";
import { hasTransactionFilters, emptyTransactionFilters, transactionFilterQuery, type TransactionFilters, type FilterOptions } from "../../src/transaction-filter-query";
import { useSession } from "../../src/session";
import type { Transaction, TransactionPage } from "../../src/types";
import {
  Screen,
  Heading,
  Card,
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
  const [selection, setSelection] = useState<string[]>([]);
  const [action, setAction] = useState<{ids:string[]; kind:"review"|"delete"}|null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const searchHeight = Math.max(38, Math.ceil(20 * fontScale + 16));
  const { demo, rows: samples, profileId, request, cached } = useSession();
  const [filters, setFilters] = useState(false);
  const params = useLocalSearchParams<{ review?: string; query?: string; report?: string; currency?: string; reviewRequest?: string }>();
  const [filterValues, setFilterValues] = useState<TransactionFilters>(()=>params.review === "pending_review" ? {...emptyTransactionFilters,reviewFilter:"pending",currency:params.currency ?? ""} : emptyTransactionFilters);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({accounts:[],categories:[],tags:[]});
  const [optionError, setOptionError] = useState("");
  useEffect(() => {
    setFilterValues(params.review === "pending_review" ? {...emptyTransactionFilters,reviewFilter:"pending",currency:params.currency ?? ""} : emptyTransactionFilters);
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
      setFilterValues({...emptyTransactionFilters,reviewFilter:"pending",currency:params.currency ?? ""});
      setQuery(""); setSearch("");
      setFilters(false);
    }
  }, [params.review, params.currency, params.reviewRequest, profileId]);
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
  const pagination = useRef(new TransactionPagination()).current;
  const activeScope = useRef("");
  const scope = `${profileId}:${search}:${JSON.stringify(filterValues)}`;
  activeScope.current = scope;
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (next = 1, refresh = false) => {
      const ticket = pagination.begin(next);
      if(ticket === null) return false;
      setBusy(true);
      setError("");
      const resource = `transactions?workspaceId=${encodeURIComponent(profileId)}&query=${encodeURIComponent(search)}&page=${next}&${transactionFilterQuery(filterValues)}`;
      if (next === 1) setPage(1);
      if (next === 1 && !refresh) {
        const previous = cached<TransactionPage>(resource);
        setRows(previous?.transactions ?? []);
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
        if (!pagination.current(ticket)) return false;
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
        setPage(next);
        pagination.complete(ticket,next);
        setTotal(demo ? data.transactions.length : data.totalCount);
        return true;
      } catch (e) {
        if (pagination.current(ticket)) setError((e as Error).message);
        return false;
      } finally {
        if (pagination.current(ticket)) {
          pagination.complete(ticket);
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
        pagination.invalidate();
      };
    }, [load]),
  );
  useEffect(() => {
    if(!busy && pagination.takeDeferredEnd() && !error && !demo && rows.length > 0 && rows.length < total) void load(page+1);
  }, [busy,error,demo,rows.length,total,page,load,pagination]);
  useEffect(() => { setSelection([]); setAction(null); setActionError(""); }, [profileId, search, filterValues]);
  const toggleSelection = (id:string) => setSelection(current=>current.includes(id) ? current.filter(value=>value!==id) : current.length < 500 ? [...current,id] : current);
  const selectedReviewIds = rows.filter(row=>selection.includes(row.id) && transactionReviewReasons(row).length>0).map(row=>row.id);
  const resolveAction = async (kind:"keep"|"delete") => {
    if(!action || acting || demo) return;
    const ids = action.ids;
    const startingScope = scope;
    setActing(true); setActionError("");
    try {
      await request(`transactions/${kind === "keep" ? "review" : "bulk-delete"}?workspaceId=${encodeURIComponent(profileId)}`,{method:"POST",body:JSON.stringify({workspaceId:profileId,transactionIds:ids})});
      if(activeScope.current !== startingScope) return;
      setSelection(current=>current.filter(id=>!ids.includes(id)));
      setRows(current=>kind === "delete" || filterValues.reviewFilter === "pending" ? current.filter(row=>!ids.includes(row.id)) : current.map(row=>ids.includes(row.id) ? {...row,reviewStatus:"confirmed",reviewReasons:[]} : row));
      setAction(null);
      await load(1,true);
    } catch(cause) { if(activeScope.current === startingScope) setActionError(cause instanceof Error ? cause.message : "Unable to update transactions."); }
    finally { setActing(false); }
  };
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
        {filterValues.reviewFilter === "pending" && !filters ? <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center"}}><Text style={{color:colors.ink}}>Needs review · {total}</Text><Pressable accessibilityRole="button" accessibilityLabel="Show all transactions" onPress={()=>setFilterValues(current=>({...current,reviewFilter:""}))}><Text style={{color:colors.teal}}>Show all</Text></Pressable></View> : null}
        {filters ? <TransactionFilterPanel value={filterValues} options={demo ? demoFilterOptions(samples) : filterOptions} onClose={()=>setFilters(false)} onApply={next=>{setFilterValues(next);setFilters(false);}} /> : null}
        {filters && optionError ? <Notice>Unable to load filter choices. Close and reopen Filters to retry.</Notice> : null}
        {error ? (
          <Notice>{error}</Notice>
        ) : null}
      </View>
      {selection.length > 0 ? <View style={{padding:12,gap:8,backgroundColor:colors.white}}>
        <Text style={{color:colors.ink}}>{selection.length} selected{selectedReviewIds.length ? ` · ${selectedReviewIds.length} to review` : ""}</Text>
        <View style={{flexDirection:"row",gap:8,flexWrap:"wrap"}}>
          {selectedReviewIds.length > 0 ? <Button title={`Keep ${selectedReviewIds.length}`} onPress={()=>{setActionError("");setAction({ids:selectedReviewIds,kind:"review"});}}/> : null}
          <Button secondary danger title="Delete selected" onPress={()=>{setActionError("");setAction({ids:selection,kind:"delete"});}}/>
          <Button secondary title="Select loaded" onPress={()=>setSelection(rows.slice(0,500).map(row=>row.id))}/>
          <Button secondary title="Cancel selection" onPress={()=>setSelection([])}/>
        </View>
      </View> : null}
      <Modal visible={Boolean(action)} transparent animationType="fade" onRequestClose={()=>{if(!acting)setAction(null);}}>
        <View style={{flex:1,backgroundColor:"#00000066",justifyContent:"center",padding:24}}>
          <View accessibilityViewIsModal style={{padding:20,borderRadius:20,backgroundColor:colors.white,gap:12}}>
            <Heading>{action?.kind === "delete" ? "Delete selected transactions?" : "Review transactions"}</Heading>
            <Body>{action?.ids.length === 1 ? rows.find(row=>row.id===action.ids[0])?.merchantClean : `${action?.ids.length ?? 0} transactions`}</Body>
            {action?.ids.length === 1 ? transactionReviewReasons(rows.find(row=>row.id===action.ids[0]) ?? {reviewStatus:null,reviewReasons:[]}).map(reason=><Body key={reason}>{reason}</Body>) : null}
            {actionError ? <Notice>{actionError}</Notice> : null}
            {action?.kind === "review" ? <Button title={acting ? "Saving…" : "Keep"} disabled={acting || demo} onPress={()=>void resolveAction("keep")}/> : null}
            <Button secondary danger title={acting ? "Please wait…" : "Delete"} disabled={acting || demo} onPress={()=>action?.kind === "review" ? setAction({...action,kind:"delete"}) : void resolveAction("delete")}/>
            <Button secondary title="Cancel" disabled={acting} onPress={()=>setAction(null)}/>
          </View>
        </View>
      </Modal>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={() => { setSelection([]); void load(1, true); }}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if(demo || rows.length === 0) return;
          if(pagination.busy) pagination.deferEnd();
          else if(!error && rows.length < total) void load(page+1);
        }}
        contentContainerStyle={{
          paddingHorizontal: 0,
          paddingBottom: adaptive.dockHeight + 48,
          maxWidth: 960,
          width: "100%",
          alignSelf: "center",
        }}
        renderItem={({ item }) => (
          <SwipeDeleteRow label={item.merchantClean ?? item.merchantRaw ?? "Transaction"} disabled={demo || selection.length > 0} onSelect={()=>toggleSelection(item.id)} onReview={transactionReviewReasons(item).length ? ()=>{setActionError("");setAction({ids:[item.id],kind:"review"});} : undefined} onOpen={() => openDetails(item.id)} onDelete={async () => {
            await request(`transactions/${item.id}?workspaceId=${encodeURIComponent(profileId)}`, { method: "DELETE" });
            setRows(current => current.filter(row => row.id !== item.id));
            setTotal(current => Math.max(0, current - 1));
            if (selectedId === item.id) setSelectedId(null);
            void load(1, true);
          }}>
          <View style={{position:"relative"}}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.merchantClean ?? item.merchantRaw}, ${item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}${money(item.amount.replace(/^-/, ""), item.currency)}, ${dateLabel(item.date)}.${transactionReviewReasons(item).length ? ` ${transactionReviewReasons(item).join(". ")}.` : ""} Open transaction.`}
            accessibilityState={{ selected: selection.includes(item.id) || (wide && selectedId === item.id) }}
            onLongPress={() => toggleSelection(item.id)}
            accessibilityHint="Touch and hold to select transactions"
            delayLongPress={350}
            onPress={() => selection.length ? toggleSelection(item.id) : wide ? setSelectedId(item.id) : openDetails(item.id)}
            style={({ pressed }) => ({
              minHeight: 68,
              paddingVertical: 12,
              paddingHorizontal: 12,
              paddingRight: transactionReviewReasons(item).length ? 52 : 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: selection.includes(item.id) || (wide && selectedId === item.id) ? colors.pale : colors.white,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            {selection.length > 0 ? <Icon line name={selection.includes(item.id) ? "checkbox-outline" : "square-outline"} size={24} color={colors.teal}/> : <MerchantLogo transaction={item} size={24} />}
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
            {transactionReviewReasons(item).length ? null : <Icon line name="chevron-forward" size={14} color={colors.muted} />}
          </Pressable>
          {transactionReviewReasons(item).length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={`Review ${item.merchantClean ?? item.merchantRaw}`} hitSlop={12} onPress={event=>{event.stopPropagation();setActionError("");setAction({ids:[item.id],kind:"review"});}} style={{position:"absolute",right:8,top:"50%",marginTop:-20,width:40,height:40,alignItems:"center",justifyContent:"center"}}><Icon line name="warning-outline" size={16} color="#D6A226"/></Pressable> : null}
          </View>
          </SwipeDeleteRow>
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
            busy ? <View accessibilityLabel="Loading more transactions" accessibilityRole="progressbar" style={{padding:16}}><ActivityIndicator color={colors.teal}/></View> : null
          ) : null
        }
      />
    </View>
  )} />;
}
