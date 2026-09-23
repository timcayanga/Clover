import { Text } from "../../src/app-text";
import { ChoiceField } from "../../src/transaction-entry";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from "react-native";
import { useAccess } from "../../src/access";
import { useSession } from "../../src/session";
import type { Transaction } from "../../src/types";
import {
  Icon,
  CategoryMark,
  Body,
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Screen,
  dateLabel,
  money,
  useTheme,
} from "../../src/ui";

export default function TransactionDetail() {
  const { colors, styles, dark } = useTheme();
  const access = useAccess();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Transaction | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accounts, setAccounts] = useState<
    { id: string; name: string; currency: string }[]
  >([]);
  const [categories, setCategories] = useState<
    { id: string; name: string; type: string }[]
  >([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setRow(null);
    setError("");
    const load = async () => {
      const response = session.demo
        ? null
        : await session.request<{
            transaction: Transaction;
            accounts: { id: string; name: string; currency: string }[];
            categories: { id: string; name: string; type: string }[];
          }>(
            `transactions/${id}?workspaceId=${encodeURIComponent(session.profileId)}`,
          );
      const result =
        response?.transaction ?? session.rows.find((r) => r.id === id);
      if (!live) return;
      if (!result || result.workspaceId !== session.profileId)
        throw new Error("This transaction is not in the selected Profile.");
      setRow(result);
      setAmount(result.amount);
      setDate(result.date.slice(0, 10));
      setAccountId(result.accountId);
      setCategoryId(result.categoryId ?? "");
      setAccounts(response?.accounts ?? []);
      setCategories(response?.categories ?? []);
      setName(result.merchantClean ?? result.merchantRaw);
      setDescription(result.description ?? "");
      setTags(result.tags?.map((t) => t.name).join(", ") ?? "");
    };
    if (access.active && session.profileId)
      void load().catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [
    id,
    session.demo,
    session.profileId,
    session.request,
    reload,
    access.active,
  ]);
  if (!access.active) return null;
  const save = async () => {
    if (!row || busy) return;
    if (!name.trim()) {
      setError("Add a transaction name.");
      return;
    }
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (
      !/^\d{1,12}(\.\d{1,2})?$/.test(amount) ||
      Number(amount) <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      setError("Enter a positive amount and a valid date.");
      return;
    }
    const selectedTags = [
      ...new Set(
        tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];
    if (
      selectedTags.length > 20 ||
      selectedTags.some((tag) => tag.length > 64)
    ) {
      setError("Use up to 20 tags, each under 65 characters.");
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (session.demo)
        session.updateSample({
          ...row,
          merchantClean: name.trim(),
          description,
          tags: selectedTags.map((tag) => ({ id: tag, name: tag })),
        });
      else
        await session.request(
          `transactions/${id}?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              ...(amount !== row.amount ? { amount } : {}),
              ...(date !== row.date.slice(0, 10) ? { date } : {}),
              ...(accountId !== row.accountId ? { accountId } : {}),
              ...(categoryId !== (row.categoryId ?? "")
                ? { categoryId: categoryId || null }
                : {}),
              merchantClean: name.trim(),
              description,
              tags: selectedTags,
            }),
          },
        );
      setSaved(true);
      setEditing(false);
      setReload((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!row || busy) return;
    setBusy(true);
    setError("");
    try {
      await session.request(
        `transactions/${id}?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "DELETE" },
      );
      router.replace("/(tabs)/transactions");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Screen>
        {error ? <Notice>{error}</Notice> : null}
        {!row ? (
          <>
            <Body>
              {error
                ? "Unable to load this transaction."
                : "Loading transaction…"}
            </Body>
            {error ? (
              <Button title="Retry" onPress={() => setReload((n) => n + 1)} />
            ) : null}
          </>
        ) : (
          <>
            {!editing ? (
              <>
                <View
                  style={{ alignItems: "center", gap: 8, paddingVertical: 12 }}
                >
                  <CategoryMark name={row.categoryName} size={44} />
                  <Text
                    style={{
                      fontSize: 21,
                      textAlign: "center",
                      fontFamily: "Poppins-SemiBold",
                      color: colors.ink,
                    }}
                  >
                    {row.merchantClean || row.merchantRaw}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit transaction"
                    onPress={() => setEditing(true)}
                    style={{ minHeight: 40, padding: 8 }}
                  >
                    <Icon name="create-outline" size={18} />
                  </Pressable>
                </View>
                <Card
                  style={{ padding: 0, overflow: "hidden", borderRadius: 16 }}
                >
                  {[
                    ["Name", row.merchantClean || row.merchantRaw],
                    [
                      "Type",
                      row.type.charAt(0).toUpperCase() + row.type.slice(1),
                    ],
                    ["Account", row.accountName],
                    ["Category", row.categoryName || "Uncategorized"],
                    [
                      "Tags",
                      row.tags?.map((t) => t.name).join(", ") || "No tags",
                    ],
                    ["Date", dateLabel(row.date)],
                    ["Amount", money(row.amount, row.currency)],
                    ["Notes", row.userNote || "No notes"],
                  ].map(([label, value]) => (
                    <Pressable
                      key={label}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${label}`}
                      onPress={() => setEditing(true)}
                      style={{
                        minHeight: 48,
                        padding: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.line,
                      }}
                    >
                      <Text
                        style={{ fontSize: 12, color: colors.muted, width: 76 }}
                      >
                        {label}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 14,
                          textAlign: "right",
                          color: colors.ink,
                        }}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  ))}
                </Card>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: sourceOpen }}
                  onPress={() => setSourceOpen((v) => !v)}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 12, color: colors.teal }}>
                    {sourceOpen ? "▾" : "▸"} Source and review details
                  </Text>
                </Pressable>
                {sourceOpen ? (
                  <Card>
                    <Body>Source: {row.source || "Recorded"}</Body>
                    <Body>
                      Confidence:{" "}
                      {row.confidenceScore == null
                        ? "Not available"
                        : `${row.confidenceScore}%`}
                    </Body>
                    <Body>Parsed information</Body>
                    <Body>{row.parsedNote || row.merchantRaw}</Body>
                  </Card>
                ) : null}
                <Card>
                  <Text style={{ fontSize: 14, color: colors.ink }}>
                    Line Items
                  </Text>
                  {row.receiptLineItems?.length ? (
                    row.receiptLineItems.map((item, i) => (
                      <Body key={i}>
                        {item.description} ·{" "}
                        {item.amount == null
                          ? "Not recorded"
                          : money(item.amount, item.currency || row.currency)}
                      </Body>
                    ))
                  ) : (
                    <Body>No line items yet.</Body>
                  )}
                </Card>
              </>
            ) : (
              <>
                {row.reviewStatus === "pending_review" ? (
                  <Notice>
                    {typeof row.confidenceScore === "number"
                      ? `Recorded confidence: ${row.confidenceScore}%. `
                      : "This transaction needs review. "}
                    Check the amount, date, account and category against the
                    original record before saving corrections.
                  </Notice>
                ) : null}
                <Field
                  label={`Amount (${row.currency})`}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Date (YYYY-MM-DD)"
                  value={date}
                  onChangeText={setDate}
                />
                {!session.demo ? (
                  <>
                    <ChoiceField
                      label="Account"
                      value={accountId}
                      onChange={setAccountId}
                      options={accounts
                        .filter((a) => a.currency === row.currency)
                        .map((a) => ({ value: a.id, label: a.name }))}
                    />
                    <ChoiceField
                      label="Category"
                      value={categoryId}
                      onChange={setCategoryId}
                      options={[
                        { value: "", label: "Uncategorized" },
                        ...categories
                          .filter(
                            (c) =>
                              c.type === row.type || row.type === "transfer",
                          )
                          .map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </>
                ) : null}
                <Field
                  label="Name"
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    setSaved(false);
                  }}
                  maxLength={200}
                />
                <Field
                  label="Description"
                  value={description}
                  onChangeText={(v) => {
                    setDescription(v);
                    setSaved(false);
                  }}
                  multiline
                  maxLength={2000}
                />
                <Field
                  label="Tags, separated by commas"
                  placeholder="Household, Travel, Work"
                  value={tags}
                  onChangeText={(v) => {
                    setTags(v);
                    setSaved(false);
                  }}
                />
                <Body>
                  Your changes are saved only when you tap Save changes. The
                  original statement data stays traceable.
                </Body>
                {saved && (
                  <Notice>
                    {session.demo
                      ? "Sample updated on this device only."
                      : "Changes saved to Clover."}
                  </Notice>
                )}
                <Button
                  title={busy ? "Saving…" : "Save changes"}
                  disabled={busy}
                  onPress={() => void save()}
                />
                <Button
                  secondary
                  title="Cancel"
                  onPress={() => {
                    setEditing(false);
                    setReload((n) => n + 1);
                    setSaved(false);
                  }}
                />
              </>
            )}
            {!session.demo ? (
              <Button
                secondary
                title="Delete transaction"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Delete transaction?",
                    "This removes the transaction from your active records.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete",
                        style: "destructive",
                        onPress: () => void remove(),
                      },
                    ],
                  )
                }
              />
            ) : null}
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
