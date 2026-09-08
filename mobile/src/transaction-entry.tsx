import { ApiError } from "./api";
import * as Crypto from "expo-crypto";
import type { EntryDraft } from "./adviser-entry-types";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSession } from "./session";
import { Body, Button, Card, Field, Notice, colors } from "./ui";

export type TransactionDraft = {
  adviserEntry?: EntryDraft;
  accountId: string;
  categoryId: string | null;
  merchantRaw: string;
  date: string;
  amount: string;
  currency: string;
  type: "expense" | "income" | "transfer";
  description: string;
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const emptyTransaction = (): TransactionDraft => ({
  accountId: "",
  categoryId: null,
  merchantRaw: "",
  date: today(),
  amount: "",
  currency: "PHP",
  type: "expense",
  description: "",
});
type Options = {
  accounts: { id: string; name: string; currency: string }[];
  categories: { id: string; name: string; type: string }[];
};
export function Choices({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={{
            minHeight: 44,
            justifyContent: "center",
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: value === option.value ? colors.teal : colors.line,
            backgroundColor:
              value === option.value ? colors.pale : colors.white,
          }}
        >
          <Text style={{ color: colors.ink }}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
function ChoiceField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <View style={{ gap: 10 }}>
      <Body>{label}</Body>
      <Button
        secondary
        title={`${options.find((option) => option.value === value)?.label ?? `Choose ${label.toLowerCase()}`} ${open ? "▴" : "▾"}`}
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <Card>
          <Field
            label={`Search ${label.toLowerCase()}`}
            value={query}
            onChangeText={setQuery}
          />
          {options
            .filter((option) =>
              option.label.toLowerCase().includes(query.toLowerCase()),
            )
            .map((option) => (
              <Button
                key={option.value}
                secondary
                title={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              />
            ))}
        </Card>
      ) : null}
    </View>
  );
}
export function ManualTransaction({
  draft,
  onChange,
}: {
  draft: TransactionDraft;
  onChange: (draft: TransactionDraft) => void;
}) {
  const session = useSession();
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    const load = session.demo
      ? Promise.resolve({
          accounts: [
            { id: "sample-cash", name: "Sample cash", currency: "PHP" },
          ],
          categories: [],
        })
      : session.request<Options>(
          `options?workspaceId=${encodeURIComponent(session.profileId)}`,
        );
    void load
      .then((data) => {
        if (live) {
          setOptions(data);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session.demo, session.profileId, session.request, retry]);
  const change = (patch: Partial<TransactionDraft>) => {
    if (busy || uncertain) return;
    onChange({ ...draft, ...patch });
    setSaved(false);
  };
  const save = async () => {
    if (lock.current) return;
    if (
      !options?.accounts.some((account) => account.id === draft.accountId) ||
      !draft.merchantRaw.trim() ||
      !/^\d{1,12}(\.\d{1,2})?$/.test(draft.amount) ||
      Number(draft.amount) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
      !Number.isFinite(Date.parse(draft.date)) ||
      new Date(draft.date).toISOString().slice(0, 10) !== draft.date
    ) {
      setError(
        "Choose an account and enter a name, valid date, and amount greater than zero.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (!session.demo) {
        if (draft.adviserEntry) {
          if (draft.type === "transfer")
            throw new Error("Use a new Manual transaction for transfers.");
          const entry = draft.adviserEntry;
          await session.request(
            `adviser/entries?workspaceId=${encodeURIComponent(session.profileId)}`,
            {
              method: "POST",
              body: JSON.stringify({
                ...entry,
                accounts: [],
                receipts: [],
                transactions: [
                  {
                    ...entry.transactions[0],
                    accountId: draft.accountId,
                    categoryId: draft.categoryId ?? "",
                    merchant: draft.merchantRaw,
                    amount: draft.amount,
                    currency: draft.currency,
                    type: draft.type,
                    date: draft.date,
                    description: draft.description,
                  },
                ],
              }),
            },
          );
        } else
          await session.request(
            `transactions?workspaceId=${encodeURIComponent(session.profileId)}`,
            { method: "POST", body: JSON.stringify(draft) },
          );
      }
      setUncertain(false);
      setSaved(true);
      onChange(emptyTransaction());
    } catch (e) {
      if (draft.adviserEntry && (!(e instanceof ApiError) || e.status >= 500))
        setUncertain(true);
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 18 }}>
      {saved ? (
        <Notice>
          {session.demo
            ? "Sample completed. No financial record was saved."
            : "Transaction saved."}
        </Notice>
      ) : null}
      <Choices
        options={[
          { value: "expense", label: "Expense" },
          { value: "income", label: "Income" },
          ...(!draft.adviserEntry
            ? [{ value: "transfer", label: "Transfer" }]
            : []),
        ]}
        value={draft.type}
        onChange={(type) =>
          change({ type: type as TransactionDraft["type"], categoryId: null })
        }
      />
      <Field
        label={`Amount (${draft.currency})`}
        value={draft.amount}
        onChangeText={(amount) => change({ amount })}
        keyboardType="decimal-pad"
        placeholder="0.00"
      />
      <Field
        label="Name"
        value={draft.merchantRaw}
        onChangeText={(merchantRaw) => change({ merchantRaw })}
        placeholder="What was this transaction for?"
        maxLength={200}
      />
      {options ? (
        options.accounts.length ? (
          <ChoiceField
            label="Account"
            options={options.accounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.currency}`,
            }))}
            value={draft.accountId}
            onChange={(accountId) =>
              change({
                accountId,
                currency:
                  options.accounts.find((a) => a.id === accountId)?.currency ??
                  "PHP",
              })
            }
          />
        ) : (
          <Notice>
            Add an account in Account before creating a transaction.
          </Notice>
        )
      ) : (
        <Button
          title="Retry loading accounts"
          secondary
          onPress={() => setRetry((n) => n + 1)}
        />
      )}
      <Field
        label="Date (YYYY-MM-DD)"
        value={draft.date}
        onChangeText={(date) => change({ date })}
        maxLength={10}
      />
      {options && draft.type !== "transfer" ? (
        <>
          <ChoiceField
            label="Category"
            options={[
              { value: "", label: "Uncategorized" },
              ...options.categories
                .filter((c) => c.type === draft.type)
                .map((c) => ({ value: c.id, label: c.name })),
            ]}
            value={draft.categoryId ?? ""}
            onChange={(categoryId) =>
              change({ categoryId: categoryId || null })
            }
          />
        </>
      ) : null}
      {draft.adviserEntry?.transactions[0]?.lines.length ? (
        <Card>
          <Body>Receipt details retained in this draft</Body>
          {draft.adviserEntry.transactions[0].lines.map((line, index) => (
            <Body key={index}>
              {line.description} · {line.quantity} × {line.unitPrice}
            </Body>
          ))}
        </Card>
      ) : null}
      <Field
        label="Notes (optional)"
        value={draft.description}
        onChangeText={(description) => change({ description })}
        multiline
        maxLength={2000}
      />
      {uncertain ? (
        <Notice>
          The save result is uncertain. Retry this unchanged draft; Clover
          prevents duplicate confirmation.
        </Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <Button
        title={
          busy
            ? "Saving…"
            : uncertain
              ? "Retry confirmation"
              : "Add transaction"
        }
        disabled={busy || !options?.accounts.length}
        onPress={() => void save()}
      />
    </View>
  );
}

type Message = { role: "user" | "assistant"; content: string };
type Suggestion = {
  id: string;
  description: string;
  payload: Partial<TransactionDraft>;
};
export function TransactionChat({
  onReview,
}: {
  onReview: (draft: TransactionDraft) => void;
}) {
  const session = useSession();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const send = async () => {
    if (lock.current || !input.trim()) return;
    if (session.demo) {
      setError(
        "Ask Clover uses your signed-in account. Sample mode never sends your message.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const next: Message[] = [
      ...messages,
      { role: "user", content: input.trim() },
    ];
    try {
      const result = await session.request<{
        reply: string;
        entryDraft?: EntryDraft;
      }>(`adviser/chat?workspaceId=${encodeURIComponent(session.profileId)}`, {
        method: "POST",
        body: JSON.stringify({
          messages: next.slice(-6),
          page: "transactions",
          clientDate: today(),
        }),
      });
      setMessages([...next, { role: "assistant", content: result.reply }]);
      const entry = result.entryDraft;
      setActions(
        entry?.transactions.map((transaction) => ({
          id: transaction.key,
          description: transaction.merchant || "Transaction draft",
          payload: {
            accountId: transaction.accountId,
            categoryId: transaction.categoryId || null,
            merchantRaw: transaction.merchant,
            description: transaction.description,
            amount: transaction.amount,
            currency: transaction.currency,
            type: transaction.type,
            date: transaction.date,
            adviserEntry: {
              ...entry,
              id: Crypto.randomUUID(),
              accounts: [],
              receipts: [],
              transactions: [transaction],
            },
          },
        })) ?? [],
      );
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Body muted={false}>Tell Clover what to add</Body>
      <Body>
        For example: “Lunch ₱250 with cash, groceries ₱1,200 from BPI.” Review
        each draft before saving.
      </Body>
      {messages.map((message, index) => (
        <Card
          key={index}
          style={{
            backgroundColor:
              message.role === "user" ? colors.pale : colors.white,
          }}
        >
          <Body muted={false}>{message.content}</Body>
        </Card>
      ))}
      {actions.map((action) => (
        <Card key={action.id}>
          <Body>{action.description}</Body>
          <Button
            title="Review transaction"
            onPress={() => {
              onReview({
                ...emptyTransaction(),
                ...action.payload,
                amount: String(Math.abs(Number(action.payload.amount) || 0)),
                date: String(action.payload.date ?? today()).slice(0, 10),
              });
              setActions((current) =>
                current.filter((a) => a.id !== action.id),
              );
            }}
          />
        </Card>
      ))}
      <Field
        label="Tell Clover what to add"
        placeholder="Lunch ₱250 with cash…"
        multiline
        value={input}
        onChangeText={setInput}
        maxLength={4000}
      />
      {error ? <Notice>{error}</Notice> : null}
      <Button
        title={busy ? "Clover is preparing your draft…" : "Send"}
        disabled={busy || !input.trim()}
        onPress={() => void send()}
      />
    </View>
  );
}
