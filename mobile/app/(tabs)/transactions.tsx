import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Choices } from "../../src/transaction-entry";
import { useSession } from "../../src/session";
import type { Transaction, TransactionPage } from "../../src/types";
import {
  CategoryMark,
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
  const [filters, setFilters] = useState(false);
  const [review, setReview] = useState("");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
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
        <Button
          title="Add transaction"
          onPress={() =>
            router.navigate({
              pathname: "/(tabs)/add",
              params: { entry: String(Date.now()) },
            })
          }
        />
        <Field
          label="Find a transaction"
          placeholder="Search name, account, category…"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
        />
        <Button
          title="Filters"
          secondary
          onPress={() => setFilters((value) => !value)}
        />
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
        ) : (
          <Body>
            {busy && !rows.length
              ? "Loading transactions…"
              : `${total} transactions`}
          </Body>
        )}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        keyboardShouldPersistTaps="handled"
        refreshing={busy && page === 1}
        onRefresh={() => void load()}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 30,
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
        }}
        renderItem={({ item, index }) => (
          <View>
            {index === 0 ||
            rows[index - 1].date.slice(0, 10) !== item.date.slice(0, 10) ? (
              <Text
                accessibilityRole="header"
                style={{ color: colors.muted, fontSize: 13, paddingTop: 16 }}
              >
                {dateLabel(item.date)}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.merchantClean ?? item.merchantRaw}, ${money(item.amount, item.currency)}, ${dateLabel(item.date)}. Open transaction.`}
              onPress={() =>
                router.push({
                  pathname: "/transaction/[id]",
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => ({
                paddingVertical: 21,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
                gap: 7,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={[styles.row, { alignItems: "flex-start" }]}>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 18,
                    fontWeight: "600",
                    color: colors.ink,
                  }}
                >
                  {item.merchantClean ?? item.merchantRaw}
                </Text>
                <Text
                  style={{
                    maxWidth: "46%",
                    fontSize: 18,
                    fontWeight: "700",
                    color: item.type === "income" ? colors.teal : colors.ink,
                  }}
                >
                  {money(item.amount, item.currency)}
                </Text>
              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
              >
                <CategoryMark name={item.categoryName} />
                <Text style={{ fontSize: 15, color: colors.muted, flex: 1 }}>
                  {item.categoryName ?? "Uncategorized"} · {item.accountName}
                  {item.lastFour && !item.accountName.endsWith(item.lastFour)
                    ? ` ${item.lastFour}`
                    : ""}
                </Text>
              </View>
              {item.reviewStatus === "pending_review" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Review transaction warning"
                  onPress={() =>
                    router.push({
                      pathname: "/transaction/[id]",
                      params: { id: item.id },
                    })
                  }
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignSelf: "flex-end",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#D6A226", fontSize: 22 }}>⚠</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </View>
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
