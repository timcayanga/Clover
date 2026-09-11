import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useSession } from "../../src/session";
import type { Transaction, TransactionPage } from "../../src/types";
import {
  CategoryMark,
  Body,
  Button,
  Field,
  Notice,
  colors,
  dateLabel,
  money,
  styles,
} from "../../src/ui";

export default function Transactions() {
  const { demo, rows: samples, profileId, request } = useSession();
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
              transactions: samples.filter((r) =>
                `${r.merchantClean} ${r.accountName} ${r.categoryName} ${r.tags?.map((t) => t.name).join(" ")}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ),
              totalCount: samples.length,
              page: 1,
            }
          : await request(
              `transactions?workspaceId=${encodeURIComponent(profileId)}&query=${encodeURIComponent(search)}&page=${next}`,
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
    [demo, samples, profileId, request, search],
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
        renderItem={({ item }) => (
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <CategoryMark name={item.categoryName} />
              <Text style={{ fontSize: 15, color: colors.muted, flex: 1 }}>
                {item.accountName} · {item.categoryName ?? "Uncategorized"}
              </Text>
            </View>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              {dateLabel(item.date)}
              {item.reviewStatus === "pending_review" ? " · Needs review" : ""}
            </Text>
            {item.tags?.length ? (
              <Text style={{ color: colors.teal, fontSize: 14 }}>
                {item.tags.map((tag) => `#${tag.name}`).join("  ")}
              </Text>
            ) : null}
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
