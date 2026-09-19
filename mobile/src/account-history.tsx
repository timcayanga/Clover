import { useCallback, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSession } from "./session";
import {
  Body,
  Button,
  Card,
  CategoryMark,
  Field,
  Notice,
  dateLabel,
  money,
  useTheme,
} from "./ui";
import { PlanAction } from "./plan-ui";
import { Choices } from "./transaction-entry";
import type { TransactionPage } from "./types";
export type HistoryItem = {
  id: string;
  date: string;
  amount: string | null;
  currency: string;
  label: string;
  note?: string | null;
  quantity?: string | null;
  transactionId?: string;
  categoryName?: string | null;
  type?: string;
};
export function AccountHistory({
  accountId,
  investment = false,
  currency,
  onChanged,
}: {
  accountId: string;
  investment?: boolean;
  currency: string;
  onChanged?: () => void;
}) {
  const session = useSession(),
    { colors } = useTheme();
  const [kind, setKind] = useState("activity"),
    [page, setPage] = useState(1),
    [items, setItems] = useState<HistoryItem[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [adding, setAdding] = useState(false),
    [confirm, setConfirm] = useState(false),
    [remove, setRemove] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [cost, setCost] = useState(""),
    [units, setUnits] = useState(""),
    [note, setNote] = useState("");
  const [demoPurchases, setDemoPurchases] = useState<HistoryItem[]>(
    accountId.startsWith("demo-invest-")
      ? [
          {
            id: "demo-buy-" + accountId,
            date: "2026-06-01",
            amount: "10000",
            currency,
            label: "Buy",
            quantity: "10",
            note: "Fictional sample purchase",
          },
        ]
      : [],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setBusy(true);
      setError("");
      setItems([]);
      void (async () => {
        try {
          if (session.demo) {
            const rows =
              kind === "purchases"
                ? demoPurchases
                : kind === "dividends"
                  ? []
                  : session.rows
                      .filter((r) => r.accountId === accountId)
                      .map((r) => ({
                        id: r.id,
                        transactionId: r.id,
                        date: r.date,
                        amount: r.amount,
                        currency: r.currency,
                        label: r.merchantClean || r.merchantRaw,
                        categoryName: r.categoryName,
                        type: r.type,
                      }));
            if (active) {
              setItems(rows.slice((page - 1) * 30, page * 30));
              setTotal(rows.length);
            }
            return;
          }
          const data = await session.request<{
            items?: HistoryItem[];
            totalCount: number;
            transactions?: TransactionPage["transactions"];
          }>(
            `accounts/${accountId}/history?workspaceId=${encodeURIComponent(session.profileId)}&kind=${kind}&page=${page}`,
          );
          if (active) {
            setItems(
              data.items ??
                data.transactions?.map((r) => ({
                  id: r.id,
                  transactionId: r.id,
                  date: r.date,
                  amount: r.amount,
                  currency: r.currency,
                  label: r.merchantClean || r.merchantRaw,
                  categoryName: r.categoryName,
                  type: r.type,
                })) ??
                [],
            );
            setTotal(data.totalCount);
          }
        } catch (e) {
          if (active) setError((e as Error).message);
        } finally {
          if (active) setBusy(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [
      session.demo,
      session.profileId,
      session.request,
      session.rows,
      accountId,
      kind,
      page,
      revision,
      demoPurchases,
    ]),
  );
  const save = async () => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date ||
      !(Number(cost) > 0) ||
      !Number.isFinite(Number(cost)) ||
      (units && (!(Number(units) > 0) || !Number.isFinite(Number(units))))
    ) {
      setError("Enter a valid date, positive cost and optional units.");
      setConfirm(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (session.demo)
        setDemoPurchases((rows) => [
          {
            id: "demo-buy-" + Date.now(),
            date,
            amount: cost,
            currency,
            label: "Buy",
            quantity: units || null,
            note,
          },
          ...rows,
        ]);
      else
        await session.request(
          `accounts/${accountId}/purchases?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: "POST",
            body: JSON.stringify({
              purchasedAt: date,
              totalCost: cost,
              ...(units ? { quantity: units } : {}),
              note,
            }),
          },
        );
      setAdding(false);
      setConfirm(false);
      setCost("");
      setUnits("");
      setNote("");
      setKind("purchases");
      setPage(1);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const deletePurchase = async () => {
    if (!remove) return;
    setBusy(true);
    setError("");
    try {
      if (session.demo)
        setDemoPurchases((rows) => rows.filter((r) => r.id !== remove));
      else
        await session.request(
          `accounts/${accountId}/purchases/${remove}?workspaceId=${encodeURIComponent(session.profileId)}`,
          { method: "DELETE" },
        );
      setRemove(null);
      setPage(1);
      setRevision((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: "Poppins-SemiBold",
            fontSize: 16,
            color: "#7A879C",
          }}
        >
          {investment ? "Trading History" : "Transaction History"}
        </Text>
        {investment ? (
          <PlanAction
            title="+ Add Buy"
            tone="primary"
            disabled={busy}
            onPress={() => {
              setAdding(true);
              setConfirm(false);
            }}
          />
        ) : null}
      </View>
      {investment ? (
        <Choices
          value={kind}
          options={[
            { value: "activity", label: "Activity" },
            { value: "purchases", label: "Purchases" },
            { value: "dividends", label: "Dividends" },
          ]}
          onChange={(v) => {
            setKind(v);
            setPage(1);
            setRemove(null);
          }}
        />
      ) : null}
      {investment ? (
        <Body>
          Activity includes recorded buys, sells, transfers and reinvestments.
          Purchases and dividends show separately recorded entries.
        </Body>
      ) : null}
      {error ? (
        <Notice>
          {error}
          <Button
            title="Retry"
            secondary
            onPress={() => setRevision((v) => v + 1)}
          />
        </Notice>
      ) : null}
      {adding ? (
        <Card>
          <Body muted={false}>Record a purchase in {currency}</Body>
          <Field
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
          />
          <Field
            label="Total cost"
            value={cost}
            onChangeText={setCost}
            keyboardType="decimal-pad"
          />
          <Field
            label="Units (optional)"
            value={units}
            onChangeText={setUnits}
            keyboardType="decimal-pad"
          />
          <Field
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
          {confirm ? (
            <Notice>
              <Body>
                This adds {cost ? money(cost, currency) : "the cost"} to this
                holding’s recorded purchase value
                {units ? ` and ${units} units` : ""}. It does not transfer money
                from another account.
              </Body>
              <PlanAction
                title="Confirm purchase"
                tone="primary"
                disabled={busy}
                onPress={() => void save()}
              />
            </Notice>
          ) : (
            <PlanAction
              title="Review purchase"
              tone="primary"
              disabled={busy}
              onPress={() => setConfirm(true)}
            />
          )}
          <PlanAction
            title="Cancel"
            disabled={busy}
            onPress={() => {
              setAdding(false);
              setConfirm(false);
            }}
          />
        </Card>
      ) : null}
      {busy ? (
        <Body>Loading…</Body>
      ) : !items.length ? (
        <Body>No {kind === "activity" ? "transactions" : kind} recorded.</Body>
      ) : (
        items.map((item) => (
          <View
            key={item.id}
            style={{
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
              paddingVertical: 12,
              gap: 6,
            }}
          >
            <Pressable
              accessibilityRole={item.transactionId ? "button" : undefined}
              accessibilityLabel={
                item.transactionId ? `Open ${item.label}` : undefined
              }
              disabled={!item.transactionId}
              onPress={() => router.push(`/transaction/${item.transactionId}`)}
              style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
            >
              {item.transactionId ? (
                <CategoryMark name={item.categoryName} size={28} />
              ) : null}
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                    color: colors.ink,
                  }}
                >
                  {item.label}
                </Text>
                <Body>
                  {dateLabel(item.date)}
                  {item.quantity ? ` · ${item.quantity} units` : ""}
                </Body>
              </View>
              <Text
                style={{
                  maxWidth: "42%",
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 13,
                  color:
                    item.type === "expense"
                      ? colors.danger
                      : item.type === "income"
                        ? colors.positive
                        : colors.ink,
                }}
              >
                {item.amount === null
                  ? "Not recorded"
                  : money(item.amount, item.currency)}
                {item.transactionId ? " ›" : ""}
              </Text>
            </Pressable>
            {item.note ? <Body>{item.note}</Body> : null}
            {kind === "purchases" ? (
              <PlanAction
                title="Delete purchase"
                tone="delete"
                onPress={() => setRemove(item.id)}
              />
            ) : null}
            {remove === item.id ? (
              <Notice>
                <Body>
                  Delete this purchase and remove its recorded cost and units?
                  This cannot be undone.
                </Body>
                <PlanAction
                  title="Confirm deletion"
                  tone="delete"
                  disabled={busy}
                  onPress={() => void deletePurchase()}
                />
                <PlanAction
                  title="Keep purchase"
                  disabled={busy}
                  onPress={() => setRemove(null)}
                />
              </Notice>
            ) : null}
          </View>
        ))
      )}
      {total > 30 ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <PlanAction
            title="Previous"
            disabled={busy || page === 1}
            onPress={() => setPage((p) => p - 1)}
          />
          <Body>
            {page} / {Math.ceil(total / 30)}
          </Body>
          <PlanAction
            title="Next"
            disabled={busy || page * 30 >= total}
            onPress={() => setPage((p) => p + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}
