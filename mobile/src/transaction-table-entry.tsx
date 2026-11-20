import { usePreventRemove } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "./session";
import { Body, Button, Icon, Notice, useTheme } from "./ui";
import { Text, TextInput } from "./app-text";
import { Modal } from "./adaptive-modal";
import { ApiError } from "./api";
import {
  tableLabels,
  emptyTableRow,
  populatedRow,
  tableRowIssues,
  duplicateTableKeys,
  type TableRow,
  type TableOptions,
} from "../../shared/transaction-table";
const typeOptions = [
  { value: "expense", label: "↑ Expense" },
  { value: "income", label: "↓ Income" },
  { value: "transfer", label: "⇄ Transfer" },
];
const columns = [
  ["merchant", 155],
  ["amount", 96],
  ["type", 104],
  ["accountId", 160],
  ["categoryId", 150],
  ["date", 128],
  ["destinationAccountId", 160],
  ["tags", 135],
  ["notes", 190],
] as const;
type Column = (typeof columns)[number][0];
type Picker = "type" | "accountId" | "categoryId" | "destinationAccountId";
const isPicker = (column: Column): column is Picker =>
  ["type", "accountId", "categoryId", "destinationAccountId"].includes(column);
const newRows = () =>
  Array.from({ length: 3 }, () => emptyTableRow(Crypto.randomUUID()));

export function TransactionTableEntry() {
  const session = useSession();
  const { colors, styles } = useTheme();
  const [rows, setRows] = useState<TableRow[]>(newRows);
  const [picker, setPicker] = useState<{ key: string; column: Picker } | null>(
    null,
  );
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
  const patch = (rowKey: string, key: Column, value: string) => {
    if (busy || uncertain) return;
    setRows((list) =>
      list.map((r) =>
        r.key === rowKey
          ? {
              ...r,
              [key]: value,
              ...(key === "accountId"
                ? {
                    destinationAccountId: "",
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
  usePreventRemove(busy || uncertain, () => {
    Alert.alert(
      "Keep this draft open",
      "Wait for the save to finish, or retry the same draft safely if the result is uncertain.",
    );
  });
  const populated = rows.filter(populatedRow);
  const duplicates = duplicateTableKeys(rows);
  const selectedRow = rows.find((row) => row.key === picker?.key);
  const accounts = options.accounts.filter(
    (account) => account.type !== "investment",
  );
  function choices(row: TableRow, column: Picker) {
    if (column === "type") return typeOptions;
    if (column === "categoryId")
      return options.categories
        .filter((c) => c.type === row.type)
        .map((c) => ({ value: c.id, label: c.name }));
    return accounts
      .filter(
        (a) =>
          column === "accountId" ||
          (a.id !== row.accountId && a.currency === row.currency),
      )
      .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }));
  }
  const labels = useMemo(() => {
    const accounts = new Map(
      options.accounts.map((a) => [a.id, `${a.name} · ${a.currency}`]),
    );
    return {
      accountId: accounts,
      destinationAccountId: accounts,
      categoryId: new Map(options.categories.map((c) => [c.id, c.name])),
      type: new Map(typeOptions.map((type) => [type.value, type.label])),
    };
  }, [options]);
  const pickerOptions =
    picker && selectedRow ? choices(selectedRow, picker.column) : [];
  const visibleColumns = columns.filter(
    ([key]) =>
      key !== "destinationAccountId" ||
      rows.some((row) => row.type === "transfer"),
  );
  const cellBorder = {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  };
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
        setError(
          `Row ${invalid + 1}: ${Object.values(tableRowIssues(rows[invalid], options)).join(" ")}`,
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
      setRows(newRows());
      setPicker(null);
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
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Body>{saved} transactions saved.</Body> : null}
      {uncertain ? (
        <Notice>
          The save result is uncertain. Keep this draft unchanged and retry
          safely.
        </Notice>
      ) : null}
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Transaction spreadsheet"
      >
        <View
          style={{
            borderTopWidth: 1,
            borderLeftWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View style={{ flexDirection: "row", backgroundColor: colors.pale }}>
            <Text style={[styles.label, cellBorder, { width: 44, padding: 8 }]}>
              #
            </Text>
            {visibleColumns.map(([key, width]) => (
              <Text
                key={key}
                style={[styles.label, cellBorder, { width, padding: 8 }]}
              >
                {tableLabels[key]}
              </Text>
            ))}
            <View style={[cellBorder, { width: 44 }]} />
          </View>
          {rows.map((row, index) => (
            <View key={row.key} style={{ flexDirection: "row" }}>
              <View
                style={[
                  cellBorder,
                  { width: 44, alignItems: "center", justifyContent: "center" },
                ]}
              >
                <Text style={styles.label}>{index + 1}</Text>
                {duplicates.has(row.key) && (
                  <Text
                    accessibilityLabel="Possible duplicate"
                    style={{ color: colors.ink }}
                  >
                    !
                  </Text>
                )}
              </View>
              {visibleColumns.map(([key, width]) => {
                const label = `Row ${index + 1}, ${tableLabels[key]}`;
                const cell = [
                  cellBorder,
                  {
                    width,
                    minHeight: 48,
                    paddingHorizontal: 8,
                    justifyContent: "center" as const,
                  },
                ];
                if (isPicker(key)) {
                  const available =
                    (key !== "categoryId" || row.type !== "transfer") &&
                    (key !== "destinationAccountId" || row.type === "transfer");
                  const value = labels[key].get(row[key]);
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityLabel={`${label}, ${value ?? "Choose"}`}
                      disabled={!available || busy || uncertain}
                      onPress={() => setPicker({ key: row.key, column: key })}
                      style={cell}
                    >
                      <Text
                        numberOfLines={2}
                        style={{ color: value ? colors.ink : colors.muted }}
                      >
                        {available ? value || "Choose ▾" : "—"}
                      </Text>
                    </Pressable>
                  );
                }
                return (
                  <TextInput
                    key={key}
                    accessibilityLabel={label}
                    value={row[key]}
                    editable={!busy && !uncertain}
                    placeholder={
                      key === "date"
                        ? "YYYY-MM-DD"
                        : key === "amount"
                          ? "0.00"
                          : tableLabels[key]
                    }
                    placeholderTextColor={colors.muted}
                    keyboardType={key === "amount" ? "decimal-pad" : "default"}
                    onChangeText={(value) => patch(row.key, key, value)}
                    style={[cell, { color: colors.ink }]}
                  />
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove row ${index + 1}`}
                disabled={busy || uncertain}
                onPress={() => {
                  setRows((list) =>
                    list.length === 1
                      ? [emptyTableRow(Crypto.randomUUID())]
                      : list.filter((r) => r.key !== row.key),
                  );
                  setReviewed(false);
                }}
                style={[
                  cellBorder,
                  { width: 44, alignItems: "center", justifyContent: "center" },
                ]}
              >
                <Icon line name="close" size={16} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        disabled={busy || uncertain || rows.length >= 50}
        onPress={() =>
          setRows((list) => [...list, emptyTableRow(Crypto.randomUUID())])
        }
        style={{ minHeight: 44, justifyContent: "center" }}
      >
        <Text style={{ color: colors.teal }}>+ Add row</Text>
      </Pressable>
      {picker && selectedRow && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setPicker(null)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "#0006",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Pressable
              accessibilityLabel="Close choices"
              onPress={() => setPicker(null)}
              style={{ position: "absolute", inset: 0 }}
            />
            <View
              style={{
                backgroundColor: colors.white,
                borderRadius: 18,
                padding: 16,
                maxHeight: "80%",
              }}
            >
              <Text style={styles.label}>{tableLabels[picker.column]}</Text>
              <ScrollView>
                {pickerOptions.map((option) => (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: selectedRow[picker.column] === option.value,
                    }}
                    onPress={() => {
                      patch(selectedRow.key, picker.column, option.value);
                      setPicker(null);
                    }}
                    style={{
                      minHeight: 48,
                      justifyContent: "center",
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text style={{ color: colors.ink }}>{option.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              {!pickerOptions.length && <Body>No matching options.</Body>}
              <Button secondary title="Close" onPress={() => setPicker(null)} />
            </View>
          </View>
        </Modal>
      )}
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
