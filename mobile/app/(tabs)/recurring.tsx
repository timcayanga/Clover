import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSession } from "../../src/session";
import { Choices } from "../../src/transaction-entry";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Screen,
  money,
  useTheme,
} from "../../src/ui";
import {
  RecurringEditor,
  type RecurringItem as Item,
  type Suggestion,
} from "../../src/recurring-editor";
type Occurrence = Pick<
  Item,
  "id" | "title" | "kind" | "amount" | "currency"
> & { date: string; dueDate: string; completed: boolean };
type Data = {
  items: Item[];
  occurrences: Occurrence[];
  suggestions: Suggestion[];
};
const kinds = [
  { value: "", label: "Overview" },
  { value: "planned_payment", label: "Planned Payments" },
  { value: "debt", label: "Debt & Loans" },
  { value: "receivable", label: "Money Owed" },
  { value: "reminder", label: "Installments" },
];
export default function Recurring() {
  const { colors, styles } = useTheme();
  const session = useSession();
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [account, setAccount] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [editor, setEditor] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!session.demo) setData(null);
      setError("");
      setDay(null);
      setSelected(null);
      const load = session.demo
        ? Promise.resolve({ items: [], occurrences: [], suggestions: [] })
        : session.request<Data>(
            `recurring?workspaceId=${encodeURIComponent(session.profileId)}&year=${month.getFullYear()}&month=${month.getMonth()}`,
          );
      void load
        .then((value) => {
          if (active)
            setData((current) => (session.demo && current ? current : value));
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [session.demo, session.profileId, session.request, month, revision]),
  );
  const matches = (item: Item) =>
    (!kind || item.kind === kind) &&
    (!account || item.accountName === account) &&
    item.title.toLowerCase().includes(query.toLowerCase());
  const items = data?.items.filter(matches) ?? [];
  const ids = new Set(items.map((item) => item.id));
  const occurrences =
    data?.occurrences.filter((item) => ids.has(item.id)) ?? [];
  const due = occurrences.filter((item) => item.date === day);
  const amount = (item: Occurrence | Item) =>
    item.amount === null
      ? "Variable amount"
      : money(String(item.amount), item.currency);
  const navigateMonth = (offset: number) =>
    setMonth(
      (value) => new Date(value.getFullYear(), value.getMonth() + offset, 1),
    );
  const mutate = async (path: string, method: string, body?: unknown) => {
    setBusy(true);
    setError("");
    try {
      if (!session.demo)
        await session.request(
          `${path}?workspaceId=${encodeURIComponent(session.profileId)}`,
          { method, ...(body ? { body: JSON.stringify(body) } : {}) },
        );
      if (session.demo && method === "DELETE")
        setData((d) =>
          d ? { ...d, items: d.items.filter((i) => i.id !== selected?.id) } : d,
        );
      setSelected(null);
      setConfirmDelete(false);
      setRevision((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (editor)
    return (
      <RecurringEditor
        initial={selected}
        suggestion={suggestion}
        onClose={() => {
          setEditor(false);
          setSuggestion(null);
        }}
        onSaved={(item) => {
          if (session.demo)
            setData((d) => ({
              items: [
                ...(d?.items ?? []).filter((i) => i.id !== item.id),
                item,
              ],
              occurrences: d?.occurrences ?? [],
              suggestions: [],
            }));
          setEditor(false);
          setSuggestion(null);
          setSelected(null);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <Screen>
      <Button
        title="Add recurring"
        onPress={() => {
          setSelected(null);
          setSuggestion(null);
          setEditor(true);
        }}
      />
      <Choices options={kinds} value={kind} onChange={setKind} />
      <Field label="Search recurring" value={query} onChangeText={setQuery} />
      <Button
        title="Filters"
        secondary
        onPress={() => setFilters((value) => !value)}
      />
      {filters ? (
        <Card>
          <Body>Account</Body>
          <Choices
            options={[
              { value: "", label: "All accounts" },
              ...Array.from(
                new Set(
                  data?.items
                    .map((item) => item.accountName)
                    .filter((name): name is string => Boolean(name)),
                ),
              ).map((name) => ({ value: name, label: name })),
            ]}
            value={account}
            onChange={setAccount}
          />
        </Card>
      ) : null}
      {error ? (
        <Notice>{error}</Notice>
      ) : !data ? (
        <Body>Loading recurring…</Body>
      ) : (
        <>
          <Card>
            <Text
              style={{ color: colors.ink, fontWeight: "600", fontSize: 18 }}
            >
              Payment calendar
            </Text>
            <View style={[styles.row, { justifyContent: "space-between" }]}>
              <Button title="‹" secondary onPress={() => navigateMonth(-1)} />
              <Body muted={false}>
                {month.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </Body>
              <Button title="›" secondary onPress={() => navigateMonth(1)} />
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((name, index) => (
                <Text
                  key={index}
                  style={{
                    width: "14.2857%",
                    color: colors.muted,
                    textAlign: "center",
                    paddingBottom: 8,
                  }}
                >
                  {name}
                </Text>
              ))}
              {Array.from({ length: month.getDay() }, (_, index) => (
                <View key={`blank-${index}`} style={{ width: "14.2857%" }} />
              ))}
              {Array.from(
                {
                  length: new Date(
                    month.getFullYear(),
                    month.getMonth() + 1,
                    0,
                  ).getDate(),
                },
                (_, index) => {
                  const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`;
                  const bills = occurrences.filter(
                    (item) => item.date === date,
                  );
                  return (
                    <Pressable
                      key={date}
                      accessibilityRole="button"
                      accessibilityLabel={`${date}, ${bills.length} bills due. Show full list`}
                      onPress={() => setDay(date)}
                      style={{
                        width: "14.2857%",
                        minHeight: 76,
                        padding: 3,
                        borderWidth: 1,
                        borderColor: colors.line,
                        backgroundColor:
                          day === date ? colors.pale : colors.white,
                      }}
                    >
                      <Text style={{ color: colors.ink, fontSize: 12 }}>
                        {index + 1}
                      </Text>
                      {bills.slice(0, 1).map((item) => (
                        <View key={item.id}>
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.teal, fontSize: 8 }}
                          >
                            {item.title}
                          </Text>
                          <Text
                            numberOfLines={1}
                            style={{ color: colors.muted, fontSize: 8 }}
                          >
                            {amount(item)}
                          </Text>
                        </View>
                      ))}
                      {bills.length > 1 ? (
                        <Text style={{ color: colors.teal, fontSize: 10 }}>
                          +{bills.length - 1}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                },
              )}
            </View>
            {day ? (
              <View style={{ gap: 8 }}>
                <Body muted={false}>{day} · All bills due</Body>
                {due.length ? (
                  due.map((item) => (
                    <Button
                      key={item.id}
                      title={`${item.title} · ${amount(item)}`}
                      secondary
                      onPress={() =>
                        setSelected(
                          items.find((record) => record.id === item.id) ?? null,
                        )
                      }
                    />
                  ))
                ) : (
                  <Body>No bills due.</Body>
                )}
              </View>
            ) : null}
          </Card>
          {data.suggestions?.length ? (
            <Card>
              <Heading>Review suggestions</Heading>
              {data.suggestions.map((s) => (
                <View key={s.id} style={{ gap: 8 }}>
                  <Body muted={false}>
                    {s.title} · {s.confidence}% confidence
                  </Body>
                  <Body>{s.reason}</Body>
                  <Button
                    title={`Review ${s.title}`}
                    secondary
                    onPress={() => {
                      setSelected(null);
                      setSuggestion(s);
                      setEditor(true);
                    }}
                  />
                  <Button
                    title={`Dismiss ${s.title}`}
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void mutate("recurring-suggestions/dismiss", "POST", {
                        suggestionId: s.id,
                      })
                    }
                  />
                </View>
              ))}
            </Card>
          ) : null}
          <Card>
            <Text
              style={{ color: colors.ink, fontWeight: "600", fontSize: 18 }}
            >
              All saved items
            </Text>
            {items.length ? (
              items.map((item) => (
                <Button
                  key={item.id}
                  title={`${item.title} · ${amount(item)}`}
                  secondary
                  onPress={() => setSelected(item)}
                />
              ))
            ) : (
              <Body>No recurring items match these filters.</Body>
            )}
          </Card>
        </>
      )}
      {selected ? (
        <Card>
          <Heading>{selected.title}</Heading>
          <Body>{amount(selected)}</Body>
          <Body>
            {selected.date?.slice(0, 10) || "No date"} · {selected.recurrence} ·{" "}
            {selected.status}
          </Body>
          {selected.accountName ? <Body>{selected.accountName}</Body> : null}
          {selected.categoryName ? <Body>{selected.categoryName}</Body> : null}
          {selected.notes ? <Body>{selected.notes}</Body> : null}
          <Button
            title="Edit recurring"
            onPress={() => {
              setSuggestion(null);
              setEditor(true);
            }}
          />
          {occurrences
            .filter((o) => o.id === selected.id)
            .map((o) => (
              <View key={o.date} style={{ gap: 8 }}>
                <Body>
                  {o.date} · {o.completed ? "Completed" : "Due"}
                </Body>
                <Button
                  title={`${o.completed ? "Undo completion" : "Mark completed"} · ${o.date}`}
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void mutate(
                      `recurring/${selected.id}/completion`,
                      "PATCH",
                      { dueDate: o.dueDate, completed: !o.completed },
                    )
                  }
                />
              </View>
            ))}
          <Body>
            Completion tracks this payment only; it does not create a
            transaction or move money.
          </Body>
          <Button
            title="Delete recurring"
            secondary
            onPress={() => setConfirmDelete(true)}
          />
          {confirmDelete ? (
            <Notice>
              <Body>
                Delete this schedule and its completion history? Existing
                transactions stay unchanged.
              </Body>
              <Button
                title="Confirm recurring deletion"
                disabled={busy}
                onPress={() =>
                  void mutate(`recurring/${selected.id}`, "DELETE")
                }
              />
              <Button
                title="Keep recurring"
                secondary
                disabled={busy}
                onPress={() => setConfirmDelete(false)}
              />
            </Notice>
          ) : null}
          <Button
            title="Close details"
            secondary
            onPress={() => setSelected(null)}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
