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
type Item = {
  id: string;
  title: string;
  kind: string;
  amount: number | null;
  currency: string;
  date: string | null;
  status: string;
  recurrence: string;
  accountName: string | null;
  categoryName: string | null;
  notes: string | null;
};
type Occurrence = Pick<
  Item,
  "id" | "title" | "kind" | "amount" | "currency"
> & { date: string };
type Data = { items: Item[]; occurrences: Occurrence[] };
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
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setData(null);
      setError("");
      setDay(null);
      setSelected(null);
      const load = session.demo
        ? Promise.resolve({ items: [], occurrences: [] })
        : session.request<Data>(
            `recurring?workspaceId=${encodeURIComponent(session.profileId)}&year=${month.getFullYear()}&month=${month.getMonth()}`,
          );
      void load
        .then((value) => {
          if (active) setData(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      return () => {
        active = false;
      };
    }, [session.demo, session.profileId, session.request, month]),
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
  return (
    <Screen>
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
            title="Close details"
            secondary
            onPress={() => setSelected(null)}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
