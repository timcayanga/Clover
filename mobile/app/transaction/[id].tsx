import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Text } from "react-native";
import { useAccess } from "../../src/access";
import { useSession } from "../../src/session";
import type { Transaction } from "../../src/types";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Screen,
  colors,
  dateLabel,
  money,
} from "../../src/ui";

export default function TransactionDetail() {
  const access = useAccess();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<Transaction | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setRow(null);
    setError("");
    const load = async () => {
      const result = session.demo
        ? session.rows.find((r) => r.id === id)
        : (
            await session.request<{ transaction: Transaction }>(
              `transactions/${id}?workspaceId=${encodeURIComponent(session.profileId)}`,
            )
          ).transaction;
      if (!live) return;
      if (!result || result.workspaceId !== session.profileId)
        throw new Error("This transaction is not in the selected Profile.");
      setRow(result);
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
              merchantClean: name.trim(),
              description,
              tags: selectedTags,
            }),
          },
        );
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
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
            <Card>
              <Body>
                {row.accountName} · {dateLabel(row.date)}
              </Body>
              <Heading>{money(row.amount, row.currency)}</Heading>
              <Text style={{ color: colors.teal, fontSize: 16 }}>
                {row.categoryName ?? "Uncategorized"}
              </Text>
              <Body>
                {row.reviewStatus === "pending_review"
                  ? "Needs review"
                  : "Your transaction record"}
              </Body>
            </Card>
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
            <Body>
              Amount, date, account, category, and final import confirmation
              remain editable on the Clover website in this first preview.
            </Body>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
