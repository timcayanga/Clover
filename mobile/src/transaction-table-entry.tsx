import { useNavigation } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "./session";
import { Body, Button, Card, Field, Notice } from "./ui";
import { ChoiceField } from "./transaction-entry";
import { ApiError } from "./api";
import {
  emptyTableRow,
  populatedRow,
  tableRowIssues,
  duplicateTableKeys,
  type TableRow,
  type TableOptions,
} from "../../shared/transaction-table";
export function TransactionTableEntry() {
  const session = useSession();
  const [rows, setRows] = useState<TableRow[]>(() => [
    emptyTableRow(Crypto.randomUUID()),
  ]);
  const [editing, setEditing] = useState<number | null>(null);
  const [options, setOptions] = useState<TableOptions>({
    accounts: [],
    categories: [],
  });
  const [existingDuplicates, setExistingDuplicates] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [saved, setSaved] = useState(0),
    [reviewed, setReviewed] = useState(false);
  const id = useRef(Crypto.randomUUID()),
    pending = useRef(""),
    lock = useRef(false);
  useEffect(() => {
    let active = true;
    if (session.demo) {
      setOptions({ accounts: [], categories: [] });
      return;
    }
    void session
      .request<TableOptions>(
        `adviser/entries?workspaceId=${encodeURIComponent(session.profileId)}`,
      )
      .then((v) => {
        if (active) setOptions(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session.profileId, session.demo]);
  const patch = (key: keyof TableRow, value: string) => {
    if (editing === null || busy || uncertain) return;
    setRows((list) =>
      list.map((r, i) =>
        i === editing
          ? {
              ...r,
              [key]: value,
              ...(key === "accountId"
                ? {
                    currency:
                      options.accounts.find((a) => a.id === value)?.currency ||
                      "",
                  }
                : {}),
              ...(key === "type"
                ? { categoryId: "", destinationAccountId: "" }
                : {}),
            }
          : r,
      ),
    );
    setReviewed(false);
  };
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!busy && !uncertain) return;
        event.preventDefault();
        Alert.alert(
          "Keep this draft open",
          "Wait for the save to finish, or retry the same draft safely if the result is uncertain.",
        );
      }),
    [navigation, busy, uncertain],
  );
  const populated = rows.filter(populatedRow);
  const duplicates = duplicateTableKeys(rows);
  const row = editing === null ? null : rows[editing];
  const save = async () => {
    if (lock.current) return;
    setError("");
    if (!uncertain) {
      if (!populated.length) {
        setError("Add at least one transaction.");
        return;
      }
      const invalid = rows.findIndex(
        (r) =>
          populatedRow(r) && Object.keys(tableRowIssues(r, options)).length,
      );
      if (invalid >= 0) {
        setEditing(invalid);
        setError(
          Object.values(tableRowIssues(rows[invalid], options)).join(" "),
        );
        return;
      }
      if ((duplicates.size || existingDuplicates) && !reviewed) {
        setError("Review the possible duplicate rows first.");
        return;
      }
      pending.current = JSON.stringify({
        id: id.current,
        workspaceId: session.profileId,
        rows: populated,
        duplicatesAcknowledged: reviewed,
      });
    }
    if (session.demo) {
      setError("This is a sample preview. Sign in to save a batch.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      await session.request(
        `transactions/batch?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "POST", body: pending.current },
      );
      setSaved(populated.length);
      setExistingDuplicates(false);
      setReviewed(false);
      setRows([emptyTableRow(Crypto.randomUUID())]);
      setEditing(null);
      setUncertain(false);
      id.current = Crypto.randomUUID();
      session.refresh();
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.message.startsWith("Possible duplicates")
      ) {
        setExistingDuplicates(true);
        setReviewed(false);
      }
      setUncertain(!(e instanceof ApiError) || e.status >= 500);
      setError(
        e instanceof Error
          ? e.message
          : "Unable to confirm the save. Retry safely.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Body>Enter multiple transactions, then save them together.</Body>
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Body>{saved} transactions saved.</Body> : null}
      {uncertain ? (
        <Notice>
          The save result is uncertain. Keep this draft unchanged and retry
          safely.
        </Notice>
      ) : null}
      {row ? (
        <Card>
          <Body>
            Row {editing! + 1} of {rows.length}
          </Body>
          <Field
            label="Date *"
            value={row.date}
            placeholder="YYYY-MM-DD"
            editable={!busy && !uncertain}
            onChangeText={(v) => patch("date", v)}
          />
          <Field
            label="Name *"
            value={row.merchant}
            editable={!busy && !uncertain}
            onChangeText={(v) => patch("merchant", v)}
          />
          <ChoiceField
            label="Type"
            value={row.type}
            options={["expense", "income", "transfer"].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(v) => patch("type", v)}
          />
          <ChoiceField
            label="Account"
            value={row.accountId}
            options={options.accounts
              .filter((a) => a.type !== "investment")
              .map((a) => ({
                value: a.id,
                label: `${a.name} · ${a.currency}`,
              }))}
            onChange={(v) => patch("accountId", v)}
          />
          {row.type === "transfer" ? (
            <ChoiceField
              label="To account"
              value={row.destinationAccountId}
              options={options.accounts
                .filter(
                  (a) =>
                    a.id !== row.accountId &&
                    a.currency === row.currency &&
                    a.type !== "investment",
                )
                .map((a) => ({ value: a.id, label: a.name }))}
              onChange={(v) => patch("destinationAccountId", v)}
            />
          ) : (
            <ChoiceField
              label="Category"
              value={row.categoryId}
              options={options.categories
                .filter((c) => c.type === row.type)
                .map((c) => ({ value: c.id, label: c.name }))}
              onChange={(v) => patch("categoryId", v)}
            />
          )}
          <Field
            label={`Amount * · ${row.currency}`}
            value={row.amount}
            keyboardType="decimal-pad"
            editable={!busy && !uncertain}
            onChangeText={(v) => patch("amount", v)}
          />
          <Field
            label="Tags · optional, separated by commas"
            value={row.tags}
            editable={!busy && !uncertain}
            onChangeText={(v) => patch("tags", v)}
          />
          <Field
            label="Notes · optional"
            value={row.notes}
            editable={!busy && !uncertain}
            onChangeText={(v) => patch("notes", v)}
          />
          <Button
            secondary
            title="Back to rows"
            onPress={() => setEditing(null)}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              secondary
              title="Previous"
              disabled={editing === 0}
              onPress={() => setEditing((i) => i! - 1)}
            />
            <Button
              secondary
              title="Next"
              disabled={editing === rows.length - 1}
              onPress={() => setEditing((i) => i! + 1)}
            />
          </View>
          <Button
            secondary
            title="Delete row"
            disabled={busy || uncertain}
            onPress={() => {
              setRows((list) => list.filter((_, i) => i !== editing));
              setEditing(null);
            }}
          />
        </Card>
      ) : (
        rows.map((r, i) => (
          <Button
            key={r.key}
            secondary
            title={`${i + 1}. ${r.merchant || "New transaction"} · ${r.amount ? `${r.currency} ${r.amount}` : "Add details"}${duplicates.has(r.key) ? " · Possible duplicate" : ""}`}
            onPress={() => setEditing(i)}
          />
        ))
      )}
      <Button
        secondary
        title="+ Add row"
        disabled={busy || uncertain || rows.length >= 50}
        onPress={() => {
          setRows((list) => [...list, emptyTableRow(Crypto.randomUUID())]);
          setEditing(rows.length);
        }}
      />
      {duplicates.size || existingDuplicates ? (
        <Button
          secondary
          title={
            reviewed
              ? "Duplicate rows reviewed"
              : "Confirm duplicate rows are intentional"
          }
          disabled={busy || uncertain}
          onPress={() => setReviewed(!reviewed)}
        />
      ) : null}
      <Body>{populated.length} transactions · blank rows are ignored</Body>
      <Button
        title={
          busy
            ? "Saving…"
            : uncertain
              ? "Retry safely"
              : `Save ${populated.length || "all"} transactions`
        }
        disabled={busy}
        onPress={() => void save()}
      />
    </View>
  );
}
