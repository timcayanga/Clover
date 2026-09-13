import { SplitGroupDetails } from "../src/split-group-details";
import { router } from "expo-router";
import { useEffect, useState, useRef } from "react";
import { Text, View } from "react-native";
import { useSession } from "../src/session";
import {
  Body,
  Card,
  CategoryMark,
  Field,
  Notice,
  Screen,
  money,
  useTheme,
} from "../src/ui";
import {
  PlanAction,
  PlanHeader,
  PlanTabs,
  Progress,
  usePlanData,
} from "../src/plan-ui";
type Circle = {
  id: string;
  name: string;
  type: string;
  description: string;
  currency: string;
  color: string;
  role: string;
  memberCount: number;
  splitBillGroupId?: string | null;
  expenseTotalThisMonth: number;
  contributionTotalThisMonth: number;
  members?: { id: string; displayName: string; role: string; status: string }[];
  budgets?: {
    id: string;
    name: string;
    spentAmount: number;
    targetAmount: number;
    currency: string;
    progressPercent: number;
  }[];
  goals?: {
    id: string;
    name: string;
    currentAmount: number;
    targetAmount: number;
    currency: string;
    progressPercent: number;
  }[];
  expenses?: {
    id: string;
    title: string;
    amount: number;
    currency: string;
    date: string;
    visibility: string;
    kind?: string;
  }[];
  activities?: { id: string; summary: string; createdAt: string }[];
};
const sample = { circles: [] as Circle[] };
export default function Circles() {
  const session = useSession();
  const { colors, dark } = useTheme();
  const { data, setData, error, reload } = usePlanData("circles", sample);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [memberDetail,setMemberDetail] = useState<string|null>(null);
  const [tab, setTab] = useState("Overview");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{
    circle: Circle | null;
    type?: string;
  } | null>(null);
  const [detailError, setDetailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setSelected(null);
    setEditor(null);
    setSearch("");
  }, [session.profileId]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || session.demo) return;
    let active = true;
    setLoading(true);
    setDetailError("");
    void session
      .request<{ circle: Circle | null }>(
        `circles/${selectedId}?workspaceId=${encodeURIComponent(session.profileId)}`,
      )
      .then((r) => {
        if (active) {
          if (!r.circle) throw new Error("Circle is no longer available.");
          setSelected(r.circle);
        }
      })
      .catch((e) => {
        if (active) setDetailError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId, session.demo, session.profileId, session.request, revision]);
  if(memberDetail && selected?.splitBillGroupId) return <SplitGroupDetails group={{id:selected.splitBillGroupId,name:selected.name,members:[]}} person={memberDetail} onClose={()=>setMemberDetail(null)} onBill={id=>{setMemberDetail(null);router.push({pathname:"/split-bills",params:{billId:id}});}} onChanged={reload}/>;
  if (editor)
    return (
      <CircleEditor
        key={session.profileId}
        initial={editor.circle}
        type={editor.type}
        onClose={() => setEditor(null)}
        onSaved={(circle) => {
          setEditor(null);
          setSelected(null);
          if (session.demo)
            setData((current) => ({
              circles: [
                ...(current?.circles ?? []).filter((c) => c.id !== circle.id),
                circle,
              ],
            }));
          else reload();
        }}
      />
    );
  return (
    <Screen>
      <PlanHeader
        title={selected ? "Circle Details" : "Circles"}
        back={selected ? () => setSelected(null) : undefined}
        add={() => setEditor({ circle: null })}
      />
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading Circles…</Body>
      ) : selected ? (
        <>
          <Text
            style={{
              fontFamily: "Poppins-SemiBold",
              fontSize: 20,
              color: colors.ink,
            }}
          >
            {selected.name}
          </Text>
          <PlanTabs
            items={[
              "Overview",
              "Expenses",
              "Budgets",
              "Goals",
              "Activity",
              "People",
            ]}
            value={tab}
            onChange={setTab}
          />
          {loading ? (
            <Body>Loading Circle details…</Body>
          ) : detailError ? (
            <>
              <Notice>{detailError}</Notice>
              <PlanAction
                title="Retry details"
                onPress={() => setRevision((v) => v + 1)}
              />
            </>
          ) : tab === "Overview" ? (
            <>
              <Card>
                <CategoryMark
                  name={
                    selected.type === "household"
                      ? "Housing"
                      : selected.type === "travel"
                        ? "Travel"
                        : "Food & Dining"
                  }
                  size={40}
                />
                <Body>{selected.description}</Body>
                <Body>
                  {selected.memberCount} people · {selected.role}
                </Body>
                <Body muted={false}>
                  {money(
                    String(selected.expenseTotalThisMonth ?? 0),
                    selected.currency,
                  )}
                </Body>
                <Body>Shared expenses this month</Body>
                <Body>
                  Contributions{" "}
                  {money(
                    String(selected.contributionTotalThisMonth ?? 0),
                    selected.currency,
                  )}
                </Body>
              </Card>
              <Body>
                Only data shared with this Circle is shown. Personal accounts
                stay private.
              </Body>
              {selected.role === "organizer" ? (
                <PlanAction
                  title="Edit Circle"
                  tone="edit"
                  onPress={() => setEditor({ circle: selected })}
                />
              ) : null}
            </>
          ) : tab === "Expenses" ? (
            <>
              {selected.expenses?.length ? (
                selected.expenses.map((item) => (
                  <Card key={item.id}>
                    <Body muted={false}>{item.title}</Body>
                    <Body>{money(String(item.amount), item.currency)}</Body>
                    <Body>
                      {item.date.slice(0, 10)} ·{" "}
                      {item.visibility.replaceAll("_", " ")}
                    </Body>
                    {item.kind === "split_bill" ? <PlanAction title="View bill" onPress={()=>router.push({pathname:"/split-bills",params:{billId:item.id}})}/> : null}
                  </Card>
                ))
              ) : (
                <Notice>No shared expenses yet.</Notice>
              )}
            </>
          ) : tab === "Budgets" || tab === "Goals" ? (
            <>
              {(tab === "Budgets" ? selected.budgets : selected.goals)
                ?.length ? (
                (tab === "Budgets" ? selected.budgets : selected.goals)!.map(
                  (item) => (
                    <Card key={item.id}>
                      <Body muted={false}>{item.name}</Body>
                      <Body>
                        {money(
                          String(
                            "spentAmount" in item
                              ? item.spentAmount
                              : item.currentAmount,
                          ),
                          item.currency,
                        )}{" "}
                        of {money(String(item.targetAmount), item.currency)}
                      </Body>
                      <Progress value={item.progressPercent} />
                      <Body>{Math.round(item.progressPercent)}%</Body>
                    </Card>
                  ),
                )
              ) : (
                <Notice>No shared {tab.toLowerCase()} yet.</Notice>
              )}
            </>
          ) : tab === "Activity" ? (
            <>
              {selected.activities?.length ? (
                selected.activities.map((item) => (
                  <Card key={item.id}>
                    <Body muted={false}>{item.summary}</Body>
                    <Body>{item.createdAt.slice(0, 10)}</Body>
                  </Card>
                ))
              ) : (
                <Notice>No Circle activity yet.</Notice>
              )}
            </>
          ) : (
            <>
              {selected.members?.map((member) => (
                <Card key={member.id}>
                  <Body muted={false}>{member.displayName}</Body>
                  {selected.splitBillGroupId ? <PlanAction title="View member balances" onPress={()=>setMemberDetail(member.displayName)}/> : null}
                  <Body>
                    {member.role} · {member.status}
                  </Body>
                </Card>
              ))}
            </>
          )}
        </>
      ) : (
        <>
          <Body>A little more together. A lot less to juggle.</Body>
          <Body>Share what matters. Personal accounts stay private.</Body>
          <Field
            label="Find a Circle"
            value={search}
            onChangeText={setSearch}
          />
          {data.circles
            .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
            .map((circle) => (
              <Card
                key={circle.id}
                style={{
                  backgroundColor: colors.white,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <CategoryMark
                    name={
                      circle.type === "household"
                        ? "Housing"
                        : circle.type === "travel"
                          ? "Travel"
                          : "Food & Dining"
                    }
                    size={36}
                  />
                  <Text
                    style={{
                      color: colors.ink,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 16,
                      flex: 1,
                    }}
                  >
                    {circle.name}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(circle.members ?? []).slice(0, 5).map((member) => (
                    <Text
                      key={member.id}
                      accessibilityLabel={member.displayName}
                      style={{
                        backgroundColor: colors.bright,
                        borderRadius: 18,
                        padding: 8,
                        color: colors.ink,
                      }}
                    >
                      {member.displayName
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </Text>
                  ))}
                  {circle.memberCount > 5 ? (
                    <Body>+{circle.memberCount - 5}</Body>
                  ) : null}
                </View>
                <Body muted={false}>
                  {money(
                    String(circle.expenseTotalThisMonth ?? 0),
                    circle.currency,
                  )}
                </Body>
                <Body>Shared expenses this month</Body>
                <PlanAction
                  title="View Circle"
                  onPress={() => {
                    setSelected(circle);
                    setTab("Overview");
                  }}
                />
              </Card>
            ))}
          {!data.circles.length ? (
            <>
              {["household", "travel"].map((type) => (
                <Card key={type}>
                  <CategoryMark
                    name={type === "household" ? "Housing" : "Travel"}
                    size={40}
                  />
                  <Body muted={false}>
                    {type === "household" ? "Household" : "Travel"}
                  </Body>
                  <PlanAction
                    title={`Create ${type} Circle`}
                    tone="primary"
                    onPress={() => setEditor({ circle: null, type })}
                  />
                </Card>
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
function CircleEditor({
  initial,
  type,
  onClose,
  onSaved,
}: {
  initial: Circle | null;
  type?: string;
  onClose: () => void;
  onSaved: (circle: Circle) => void;
}) {
  const session = useSession();
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState(initial?.type ?? type ?? "household");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "PHP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = async () => {
    if (inFlight.current) return;
    if (!name.trim() || !/^[A-Z]{3}$/.test(currency)) {
      setError("Enter a Circle name and three-letter currency.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = {
        name: name.trim(),
        type: kind,
        description,
        currency,
        color: initial?.color ?? "teal",
      };
      const result = session.demo
        ? { circleId: initial?.id ?? `demo-${Date.now()}` }
        : await session.request<{ circleId: string }>(
            `circles${initial ? `/${initial.id}` : ""}?workspaceId=${encodeURIComponent(session.profileId)}`,
            {
              method: initial ? "PATCH" : "POST",
              body: JSON.stringify(payload),
            },
          );
      if (!alive.current) return;
      onSaved({
        ...payload,
        id: result.circleId,
        role: "organizer",
        memberCount: initial?.memberCount ?? 1,
        expenseTotalThisMonth: initial?.expenseTotalThisMonth ?? 0,
        contributionTotalThisMonth: initial?.contributionTotalThisMonth ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save Circle.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title={initial ? "Edit Circle" : "Create Circle"}
        back={() => {
          if (!busy) onClose();
        }}
      />
      <Field
        label="Circle name"
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        maxLength={300}
      />
      <Field
        label="Currency"
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        maxLength={3}
      />
      <Body>Circle type</Body>
      {[
        "household",
        "couple",
        "family",
        "travel",
        "friends",
        "goal",
        "custom",
      ].map((value) => (
        <PlanAction
          key={value}
          title={`${value}${kind === value ? " ✓" : ""}`}
          onPress={() => setKind(value)}
        />
      ))}
      {error ? <Notice>{error}</Notice> : null}
      <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
      <PlanAction
        title={busy ? "Saving…" : initial ? "Save changes" : "Create Circle"}
        tone="primary"
        disabled={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}
