import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
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
type Goal = {
  id: string;
  goal: string;
  name: string;
  category: string;
  targetAmount: number | null;
  currency: string;
  cadence: string;
  purpose: string;
  legacy: boolean;
  progress?: {
    currentAmount: number;
    targetAmount: number | null;
    progressPercent: number | null;
    currentLabel: string;
    nextAction: string;
  };
  activity?: { income: number; spending: number; start: string; end: string };
};
const sample = { goals: [] as Goal[] };
const presets = [
  { name: "Save more", key: "save_more", icon: "Income" },
  {
    name: "Emergency fund",
    key: "build_emergency_fund",
    icon: "Health & Wellness",
  },
  { name: "Invest better", key: "invest_better", icon: "Investments" },
];
export default function Goals() {
  const session = useSession();
  const { colors, dark } = useTheme();
  const { data, setData, error, reload } = usePlanData("goals", sample);
  const [selected, setSelected] = useState<Goal | null>(null);
  const [editor, setEditor] = useState<{
    goal: Goal | null;
    preset?: string;
  } | null>(null);
  const [tab, setTab] = useState("Overview");
  useEffect(() => {
    setSelected(null);
    setEditor(null);
  }, [session.profileId]);
  if (editor)
    return (
      <GoalEditor
        key={session.profileId}
        goal={editor.goal}
        preset={editor.preset}
        onClose={() => setEditor(null)}
        onSaved={(goal) => {
          setEditor(null);
          setSelected(null);
          if (session.demo)
            setData((current) => ({
              goals: [
                ...(current?.goals ?? []).filter((g) => g.id !== goal.id),
                goal,
              ],
            }));
          else reload();
        }}
      />
    );
  const icon = (goal: Goal) =>
    goal.goal === "invest_better"
      ? "Investments"
      : goal.goal === "build_emergency_fund"
        ? "Health & Wellness"
        : "Income";
  return (
    <Screen>
      <PlanHeader
        title={selected ? "Goal Details" : "Goals"}
        back={selected ? () => setSelected(null) : undefined}
        add={() => setEditor({ goal: null })}
      />
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading goals…</Body>
      ) : selected ? (
        <>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <CategoryMark name={icon(selected)} size={32} />
            <Text
              style={{
                color: colors.ink,
                fontFamily: "Poppins-SemiBold",
                fontSize: 20,
                flex: 1,
              }}
            >
              {selected.name}
            </Text>
          </View>
          <PlanTabs
            items={["Overview", "Roadmap", "Progress", "History"]}
            value={tab}
            onChange={setTab}
          />
          {tab === "Overview" ? (
            <>
              <Card>
                <Body>{selected.cadence} target</Body>
                <Body muted={false}>
                  {selected.targetAmount === null
                    ? "Set a target"
                    : money(String(selected.targetAmount), selected.currency)}
                </Body>
                {selected.progress ? (
                  <>
                    <Body muted={false}>
                      {money(
                        String(selected.progress.currentAmount),
                        selected.currency,
                      )}
                    </Body>
                    <Body>{selected.progress.currentLabel}</Body>
                    <Progress value={selected.progress.progressPercent ?? 0} />
                    <Body>
                      {Math.round(selected.progress.progressPercent ?? 0)}% of
                      target
                    </Body>
                  </>
                ) : (
                  <Body>
                    Existing account goal. Progress is not available in this
                    native view yet.
                  </Body>
                )}
              </Card>
              <Body>
                Progress reflects recent activity in this Profile and currency.
                It is not money reserved separately. Annual targets are shown as
                a monthly pace.
              </Body>
              {!selected.legacy ? (
                <PlanAction
                  title="Edit goal"
                  tone="edit"
                  onPress={() => setEditor({ goal: selected })}
                />
              ) : null}
              <PlanAction
                title="Ask Clover about this goal"
                tone="ask"
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/adviser",
                    params: {
                      page: "goals",
                      prompt: `Help me understand my goal, ${selected.name}.`,
                    },
                  })
                }
              />
            </>
          ) : tab === "Roadmap" ? (
            <>
              {selected.progress && selected.progress.targetAmount ? (
                <>
                  <Body>
                    {money(
                      String(selected.progress.currentAmount),
                      selected.currency,
                    )}{" "}
                    of{" "}
                    {money(
                      String(selected.progress.targetAmount),
                      selected.currency,
                    )}
                  </Body>
                  <Progress value={selected.progress.progressPercent ?? 0} />
                  {[35, 65, 90, 100].map((threshold, index) => {
                    const target =
                      (selected.progress!.targetAmount! * threshold) / 100;
                    const remaining = Math.max(
                      0,
                      target - selected.progress!.currentAmount,
                    );
                    return (
                      <Card key={threshold}>
                        <CategoryMark
                          name={
                            [
                              "Income",
                              "Investments",
                              "Health & Wellness",
                              "Income",
                            ][index]
                          }
                          size={40}
                        />
                        <Body muted={false}>
                          {
                            [
                              "Getting started",
                              "Building momentum",
                              "Almost there",
                              "Monthly target",
                            ][index]
                          }
                        </Body>
                        <Body>
                          {money(String(target), selected.currency)} ·{" "}
                          {threshold}%
                        </Body>
                        <Body>
                          {remaining === 0
                            ? "✓ Reached"
                            : `${money(String(remaining), selected.currency)} to go`}
                        </Body>
                      </Card>
                    );
                  })}
                </>
              ) : (
                <Notice>Set a target to build your roadmap.</Notice>
              )}
            </>
          ) : tab === "Progress" ? (
            <Card>
              {selected.activity ? (
                <>
                  <Body>
                    {selected.activity.start.slice(0, 10)} –{" "}
                    {selected.activity.end.slice(0, 10)}
                  </Body>
                  <Body muted={false}>
                    Income{" "}
                    {money(String(selected.activity.income), selected.currency)}
                  </Body>
                  <Body muted={false}>
                    Spending{" "}
                    {money(
                      String(selected.activity.spending),
                      selected.currency,
                    )}
                  </Body>
                  <Body>{selected.progress?.nextAction}</Body>
                </>
              ) : (
                <Body>No progress data available.</Body>
              )}
            </Card>
          ) : (
            <Card>
              <Body muted={false}>{selected.name}</Body>
              <Body>
                {selected.targetAmount === null
                  ? "No amount target"
                  : money(
                      String(selected.targetAmount),
                      selected.currency,
                    )}{" "}
                · {selected.cadence}
              </Body>
              <Body>
                {selected.legacy
                  ? "Existing account-wide goal; kept separately from Profile goals."
                  : "Current saved goal. Earlier revisions are not recorded for this goal."}
              </Body>
            </Card>
          )}
        </>
      ) : (
        <>
          {!data.goals.length ? (
            <>
              <Body>What would you like to work toward?</Body>
              {presets.map((preset) => (
                <Card key={preset.key}>
                  <CategoryMark name={preset.icon} size={40} />
                  <Body muted={false}>{preset.name}</Body>
                  <PlanAction
                    title={`Set up ${preset.name}`}
                    onPress={() =>
                      setEditor({ goal: null, preset: preset.key })
                    }
                  />
                </Card>
              ))}
            </>
          ) : (
            data.goals.map((goal) => (
              <Card
                key={goal.id}
                style={{
                  backgroundColor: dark
                    ? "#183137"
                    : goal.goal === "build_emergency_fund"
                      ? "#fff1f3"
                      : "#effaf5",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <CategoryMark name={icon(goal)} size={32} />
                  <Text
                    style={{
                      color: colors.ink,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 16,
                      flex: 1,
                    }}
                  >
                    {goal.name}
                  </Text>
                </View>
                <Body>
                  {goal.targetAmount === null
                    ? "Set a target"
                    : money(String(goal.targetAmount), goal.currency)}{" "}
                  · {goal.cadence}
                  {goal.legacy ? " · Account goal" : ""}
                </Body>
                {goal.progress ? (
                  <>
                    <Body muted={false}>
                      {money(
                        String(goal.progress.currentAmount),
                        goal.currency,
                      )}
                    </Body>
                    <Body>{goal.progress.currentLabel}</Body>
                    <Progress value={goal.progress.progressPercent ?? 0} />
                    <Body>
                      {Math.round(goal.progress.progressPercent ?? 0)}% of
                      target
                    </Body>
                  </>
                ) : null}
                <PlanAction
                  title="Open goal"
                  onPress={() => {
                    setSelected(goal);
                    setTab("Overview");
                  }}
                />
              </Card>
            ))
          )}
        </>
      )}
    </Screen>
  );
}
function GoalEditor({
  goal,
  preset,
  onClose,
  onSaved,
}: {
  goal: Goal | null;
  preset?: string;
  onClose: () => void;
  onSaved: (goal: Goal) => void;
}) {
  const session = useSession();
  const [kind, setKind] = useState(goal?.goal ?? preset ?? "save_more");
  const [name, setName] = useState(goal?.purpose ?? "");
  const [amount, setAmount] = useState(
    goal?.targetAmount ? String(goal.targetAmount) : "",
  );
  const [currency, setCurrency] = useState(goal?.currency ?? "PHP");
  const [cadence, setCadence] = useState(goal?.cadence ?? "monthly");
  const [saving, setSaving] = useState(false);
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
    const targetAmount = Number(amount);
    if (
      !Number.isFinite(targetAmount) ||
      targetAmount <= 0 ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      setError("Enter a positive target amount and three-letter currency.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...(goal ? { id: goal.id } : {}),
        goal: kind,
        targetAmount,
        currency,
        goalPlan: { cadence, purpose: name.trim() || null },
      };
      const result = session.demo
        ? { id: goal?.id ?? `demo-${Date.now()}` }
        : await session.request<{ id: string }>(
            `goals?workspaceId=${encodeURIComponent(session.profileId)}`,
            { method: "POST", body: JSON.stringify(payload) },
          );
      if (!alive.current) return;
      onSaved({
        id: result.id,
        goal: kind,
        name: name.trim() || presets.find((p) => p.key === kind)?.name || kind,
        category: kind,
        targetAmount,
        currency,
        cadence,
        purpose: name.trim(),
        legacy: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save goal.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title={goal ? "Edit Goal" : "Create Goal"}
        back={() => {
          if (!saving) onClose();
        }}
      />
      <Body>Goal type</Body>
      {[
        ...presets,
        { name: "Pay down debt", key: "pay_down_debt", icon: "Loans" },
        { name: "Track spending", key: "track_spending", icon: "Shopping" },
      ].map((p) => (
        <PlanAction
          key={p.key}
          title={`${p.name}${kind === p.key ? " ✓" : ""}`}
          onPress={() => setKind(p.key)}
        />
      ))}
      <Field
        label="Goal name (optional)"
        value={name}
        onChangeText={setName}
        maxLength={120}
      />
      <Field
        label="Target amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
      />
      <Field
        label="Currency"
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        maxLength={3}
      />
      <PlanAction
        title={`Monthly${cadence === "monthly" ? " ✓" : ""}`}
        onPress={() => setCadence("monthly")}
      />
      <PlanAction
        title={`Annual${cadence === "annual" ? " ✓" : ""}`}
        onPress={() => setCadence("annual")}
      />
      <Body>
        This creates an independent goal in the selected Profile. Progress uses
        matching-currency activity.
      </Body>
      {error ? <Notice>{error}</Notice> : null}
      <PlanAction title="Cancel" disabled={saving} onPress={onClose} />
      <PlanAction
        title={saving ? "Saving…" : goal ? "Save changes" : "Create Goal"}
        tone="primary"
        disabled={saving}
        onPress={() => void save()}
      />
    </Screen>
  );
}
