import { Text } from "../../src/app-text";
import { SummaryCard } from "../../src/plan-ui";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { Choices } from "../../src/transaction-entry";
import { useSession } from "../../src/session";
import type { Transaction, TransactionPage } from "../../src/types";
import {
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
  const { demo, rows: samples, profileId, request } = useSession();
  const [summary, setSummary] = useState<TransactionPage["summary"]>();
  const [filters, setFilters] = useState(false);
  const params = useLocalSearchParams<{ review?: string; query?: string }>();
  const [review, setReview] = useState("");
  useEffect(() => {
    if (params.review === "pending_review") {
      setReview("pending_review");
      setFilters(true);
    }
  }, [params.review]);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => { if (params.query !== undefined) setQuery(params.query); }, [params.query]);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const loading = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const load = useCallback(
    async (next = 1) => {
      const ticket = ++sequence.current;
      loading.current = true;
      setBusy(true);
      setError("");
      if (next === 1) setRows([]);
      try {
        const data: TransactionPage = demo
          ? {
              transactions: samples.filter(
                (r) =>
                  (!review || r.reviewStatus === review) &&
                  (!type || r.type === type) &&
                  `${r.merchantClean} ${r.accountName} ${r.categoryName} ${r.tags?.map((t) => t.name).join(" ")}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              ),
              totalCount: samples.length,
              page: 1,
            }
          : await request(
              `transactions?workspaceId=${encodeURIComponent(profileId)}&query=${encodeURIComponent(search)}&page=${next}&reviewFilter=${review === "pending_review" ? "pending" : review}&type=${type === "income" ? "credit" : type === "expense" ? "debit" : type}`,
            );
        if (ticket !== sequence.current) return;
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
      } catch (e) {
        if (ticket === sequence.current) setError((e as Error).message);
      } finally {
        if (ticket === sequence.current) {
          loading.current = false;
          setBusy(false);
        }
      }
    },
    [demo, samples, profileId, request, search, review, type],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        sequence.current++;
        loading.current = false;
      };
    }, [load]),
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 20, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field
              accessibilityLabel="Search transactions"
              placeholder="Search"
              style={{ height: 44, minHeight: 44, paddingVertical: 0, fontSize: 13 }}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          <Button
            title="Filters"
            icon="options-outline"
            secondary
            onPress={() => setFilters((v) => !v)}
          />
        </View>
        {filters ? (
          <View style={{ gap: 8 }}>
            <Body>Warnings</Body>
            <Choices
              options={[
                { value: "", label: "All" },
                { value: "pending_review", label: "Needs review" },
                { value: "confirmed", label: "Confirmed" },
              ]}
              value={review}
              onChange={setReview}
            />
            <Body>Type</Body>
            <Choices
              options={[
                { value: "", label: "All" },
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
                { value: "transfer", label: "Transfer" },
              ]}
              value={type}
              onChange={setType}
            />
          </View>
        ) : null}
        {error ? (
          <Notice>{error}</Notice>
        ) : busy && !rows.length ? (
          <Body>Loading transactions…</Body>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        refreshing={busy && page === 1}
        onRefresh={() => void load()}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 120,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.merchantClean ?? item.merchantRaw}, ${item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}${money(item.amount.replace(/^-/, ""), item.currency)}, ${dateLabel(item.date)}.${item.reviewStatus === "pending_review" ? " Needs review." : ""} Open transaction.`}
            onPress={() =>
              router.push({
                pathname: "/transaction/[id]",
                params: { id: item.id },
              })
            }
            style={({ pressed }) => ({
              minHeight: 68,
              paddingVertical: 12,
              paddingHorizontal: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: colors.white,
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
              {item.reviewStatus === "pending_review" ? <Icon line name="warning-outline" size={12} color="#D6A226"/> : null}
              </View>
              <Text
                numberOfLines={2}
                style={{ fontSize: 10, color: colors.muted }}
              >
                {dateLabel(item.date)} · {item.categoryName ?? "Uncategorized"}{" "}
                · {item.accountName}
                {item.lastFour && !item.accountName.endsWith(item.lastFour)
                  ? ` ${item.lastFour}`
                  : ""}
              </Text>
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
            <Notice>
              {error
                ? "Pull down to retry."
                : "No matching transactions. Try another search or upload a record."}
            </Notice>
          ) : (
            <ActivityIndicator color={colors.teal} />
          )
        }
        ListFooterComponent={
          rows.length < total && !demo ? (
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
  );
}
