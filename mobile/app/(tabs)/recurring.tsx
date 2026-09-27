import { registerScreenRefresh } from "../../src/screen-refresh";
import { InlineDetailRow } from "../../src/inline-detail-row";
import { PlanHeader } from "../../src/plan-ui";
import { EntryOverlay } from "../../src/entry-overlay";
import { recurringSummaryAmounts } from "../../src/recurring-summary";
import { PlanTabs } from "../../src/plan-ui";
import { Text } from "../../src/app-text";
import { useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useState, useLayoutEffect } from "react";
import { Pressable, View } from "react-native";
import { useSession } from "../../src/session";
import { Choices } from "../../src/transaction-entry";
import {
  Body,
  Button,
  Card,
  Field,
  Heading,
  Icon,
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
  summaries?: Record<string, string[][]>;
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
  const [accounts, setAccounts] = useState<{id:string;name:string;currency:string}[]>([]);
  useEffect(() => {
    let active = true;
    if (!session.demo) void session.request<{accounts:typeof accounts}>(`accounts?workspaceId=${encodeURIComponent(session.profileId)}`).then(r=>{if(active)setAccounts(r.accounts);}).catch(()=>{});
    return ()=>{active=false;};
  },[session.demo,session.profileId,session.request]);
  const [data, setData] = useState<Data | null>(null);
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [account, setAccount] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [editor, setEditor] = useState(false);
  const { add } = useLocalSearchParams<{ add?: string }>();
  useEffect(() => {
    if (add) {
      setSelected(null);
      setSuggestion(null);
      setEditor(true);
    }
  }, [add]);
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
      const load = () => session.demo
        ? Promise.resolve({ items: [], occurrences: [], suggestions: [] })
        : session.request<Data>(
            `recurring?workspaceId=${encodeURIComponent(session.profileId)}&year=${month.getFullYear()}&month=${month.getMonth()}`,
          );
      const refresh = () => load()
        .then((value) => {
          if (active) {
            setData((current) => (session.demo && current ? current : value)); setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
      void refresh();
      const unregister = registerScreenRefresh("/recurring", refresh);
      return () => {
        active = false; unregister();
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
  const monthlyAmounts = recurringSummaryAmounts(items, occurrences, kind === "receivable");
  const dueLabel = monthlyAmounts.length
    ? monthlyAmounts.map(([currency, value]) => money(String(value), currency)).join(" · ")
    : "No amount set";
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
  const navigation = useNavigation();
  useLayoutEffect(()=>{navigation.setOptions({headerShown:!selected});},[navigation,selected]);
  const entryOverlay = editor ? (
    <EntryOverlay onClose={() => setEditor(false)}>
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
    </EntryOverlay>
  ) : null;
  if (selected) return (
    <Screen key={selected.id}>
      <PlanHeader title={selected.title} back={()=>{setSelected(null);setConfirmDelete(false);}}/>
      {entryOverlay}
      {error ? <Notice>{error}</Notice> : null}
        <Card style={{gap:0}}>
          {[
            {label:"Name",key:"title",value:selected.title},
            {label:"Type",key:"kind",value:selected.kind,display:kinds.find(k=>k.value===selected.kind)?.label,options:kinds.filter(k=>k.value)},
            {label:"Account",key:"accountId",value:selected.accountId||"",display:selected.accountName||"No account",options:[{value:"",label:"No account"},...accounts.filter(a=>a.currency===selected.currency).map(a=>({value:a.id,label:a.name}))]},
            {label:"Status",key:"status",value:selected.status,display:selected.status[0].toUpperCase()+selected.status.slice(1),options:["active","paused","resolved"].map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}))},
            {label:"Payee",key:"counterparty",value:selected.counterparty||""},
            {label:"Amount",key:"amount",value:String(selected.amount??""),display:amount(selected)},
            {label:"Due Date",key:"dueDate",value:selected.dueDate?.slice(0,10)||selected.date?.slice(0,10)||""},
            {label:"Repeat",key:"recurrence",value:selected.recurrence,options:["once","weekly","biweekly","monthly","quarterly","annual"].map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}))},
            {label:"Category",key:"categoryName",value:selected.categoryName||""},
            {label:"Notes",key:"notes",value:selected.notes||""},
          ].map(field=><InlineDetailRow key={field.key} label={field.label} value={field.value} displayValue={field.display} options={field.options} numeric={field.key==="amount"} onSave={async value=>{
            if(!session.demo)await session.request(`recurring/${selected.id}?workspaceId=${encodeURIComponent(session.profileId)}`,{method:"PATCH",body:JSON.stringify({[field.key]:value||null})});
            const patch = {[field.key]:field.key==="amount"?(value?Number(value):null):value,...(field.key==="accountId"?{accountName:accounts.find(a=>a.id===value)?.name||null}:{})};
            setSelected(current=>current?{...current,...patch}:current);
            setData(current=>current?{...current,items:current.items.map(item=>item.id===selected.id?{...item,...patch}:item)}:current);
          }}/>) }
          {selected.tracking ? <View style={{marginTop:16}}>
            <Heading>Payment Details</Heading>
            {([
              {key:"paymentAmount",label:"Payment",numeric:true},
              {key:"totalPayments",label:"Payments",numeric:true},
              {key:"paymentsMade",label:"Paid",numeric:true},
              {key:"endDate",label:"End Date",numeric:false},
              {key:"interestRate",label:"Rate (%)",numeric:true},
              {key:"reference",label:"Reference",numeric:false},
            ] as const).map(field=><InlineDetailRow key={field.key} label={field.label} value={String(selected.tracking?.[field.key]??"")} numeric={field.numeric} onSave={async value=>{
              if(!selected.tracking)return;
              const tracking={...selected.tracking,[field.key]:field.numeric?(value?Number(value):field.key==="paymentsMade"?0:null):value|| (field.key==="reference"?"":null)};
              if(!session.demo)await session.request(`recurring/${selected.id}?workspaceId=${encodeURIComponent(session.profileId)}`,{method:"PATCH",body:JSON.stringify({tracking})});
              setSelected(current=>current?{...current,tracking}:current);
              setData(current=>current?{...current,items:current.items.map(item=>item.id===selected.id?{...item,tracking}:item)}:current);
            }}/>) }
          </View> : null}
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

        </Card>
    </Screen>
  );
  return (
    <Screen>
      {entryOverlay}
      <PlanTabs
        items={kinds.map((item) => item.label)}
        value={kinds.find((item) => item.value === kind)?.label ?? "Overview"}
        onChange={(label) =>
          setKind(kinds.find((item) => item.label === label)?.value ?? "")
        }
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(data.summaries?.[({ planned_payment: "planned", debt: "debt", receivable: "owed", reminder: "installments" } as Record<string, string>)[kind] ?? "overview"]?.slice(0, kind ? 3 : 1) ?? [["Due this month", dueLabel]]).map(([label, value]) => (
              <Card key={label} style={{ flex: 1, backgroundColor: colors.pale, alignItems: "center", padding: kind ? 10 : 16 }}>
                <Text style={[styles.sectionTitle, { fontSize: kind ? 11 : 16, textAlign: "center" }]}>{label}</Text>
                <Text style={{ color: colors.teal, fontFamily: "Poppins-SemiBold", fontSize: kind ? 16 : 18, textAlign: "center" }}>{value}</Text>
              </Card>
            ))}
          </View>
          <Card>
            <Text
              style={{
                color: colors.ink,
                fontFamily: "Poppins-SemiBold",
                fontSize: 16,
              }}
            >
              Payment calendar
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "nowrap",
                gap: 2,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Today"
                onPress={() =>
                  setMonth(
                    new Date(
                      new Date().getFullYear(),
                      new Date().getMonth(),
                      1,
                    ),
                  )
                }
                style={{
                  paddingHorizontal: 4,
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.teal, fontSize: 12 }}>Today</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous month"
                onPress={() => navigateMonth(-1)}
                style={styles.iconButton}
              >
                <Icon name="chevron-back" size={18} />
              </Pressable>
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Icon line name="calendar-outline" size={14} />
                <Text style={{ flex: 1, color: colors.ink, fontSize: 12 }}>
                  {month.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next month"
                onPress={() => navigateMonth(1)}
                style={styles.iconButton}
              >
                <Icon name="chevron-forward" size={18} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (name, index) => (
                  <Text
                    key={index}
                    style={{
                      width: "14.2857%",
                      color: colors.muted,
                      textAlign: "center",
                      paddingBottom: 8,
                      fontSize: 10,
                    }}
                  >
                    {name}
                  </Text>
                ),
              )}
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
                        padding: 4,
                        borderRadius: 8,
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
                        <View key={item.id} style={{ backgroundColor: colors.pale, borderLeftWidth: 2, borderLeftColor: colors.teal, borderRadius: 3, padding: 2, marginTop: 3 }}>
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
              <Text
                accessibilityRole="header"
                style={{
                  color: colors.ink,
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 16,
                }}
              >
                Review suggestions
              </Text>
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
              style={{
                color: colors.ink,
                fontFamily: "Poppins-SemiBold",
                fontSize: 16,
              }}
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
              <Body>No recurring items yet.</Body>
            )}
          </Card>
        </>
      )}

    </Screen>
  );
}
