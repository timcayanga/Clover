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
  PlanHeader,
  PlanTabs,
  PlanAction,
  Progress,
  usePlanData,
} from "../src/plan-ui";
type Budget = {
  id: string;
  name: string;
  currency: string;
  actualAmount: number;
  targetAmount: number;
  progressPercent: number;
  statusLabel: string;
  periodLabel: string;
  isActive: boolean;
  kind: "spend_limit" | "savings_target";
  scope: "global" | "category" | "account";
  cadence: string;
  accountId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  appearance?: { color: string; emoji: string };
};
type History = {
  points: {
    periodStart: string;
    label: string;
    actualAmount: number;
    targetAmount: number;
    progressPercent: number;
  }[];
  recentTransactions: {
    id: string;
    merchantName: string;
    categoryName: string | null;
    date: string;
    amount: number;
  }[];
};
const sample = { budgets: [] as Budget[] };
const optionSample = {
  categories: [
    { id: "demo-food", name: "Food & Dining" },
    { id: "demo-transport", name: "Transport" },
  ],
  accounts: [] as { id: string; name: string; currency: string }[],
};
export default function Budgeting() {
  const session = useSession();
  const { colors, dark } = useTheme();
  const { data, setData, error, reload } = usePlanData("budgets", sample);
  const [selected, setSelected] = useState<Budget | null>(null);
  const [tab, setTab] = useState("Overview");
  const [editor, setEditor] = useState<{
    budget: Budget | null;
    preset?: string;
  } | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    setSelected(null);
    setEditor(null);
  }, [session.profileId]);
  useEffect(() => {
    let active = true;
    setHistory(null);
    setHistoryError("");
    if (selected)
      void (
        session.demo
          ? Promise.resolve({ history: { points: [], recentTransactions: [] } })
          : session.request<{ history: History }>(
              `budgets/${selected.id}?workspaceId=${encodeURIComponent(session.profileId)}`,
            )
      )
        .then((r) => {
          if (active) setHistory(r.history);
        })
        .catch((e) => {
          if (active) setHistoryError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected, session.demo, session.profileId, session.request]);
  if (editor)
    return (
      <BudgetEditor
        key={session.profileId}
        budget={editor.budget}
        preset={editor.preset}
        onClose={() => setEditor(null)}
        onSaved={(budget) => {
          setEditor(null);
          setSelected(null);
          if (session.demo)
            setData((current) => ({
              budgets: budget
                ? [
                    ...(current?.budgets ?? []).filter(
                      (b) => b.id !== budget.id,
                    ),
                    budget,
                  ]
                : (current?.budgets ?? []).filter(
                    (b) => b.id !== editor.budget?.id,
                  ),
            }));
          else reload();
        }}
      />
    );
  return (
    <Screen>
      <PlanHeader
        title={selected ? "Budget Details" : "Budgeting"}
        back={selected ? () => setSelected(null) : undefined}
        add={() => setEditor({ budget: null })}
      />
      {error ? (
        <>
          <Notice>{error}</Notice>
          <PlanAction title="Try again" onPress={reload} />
        </>
      ) : !data ? (
        <Body>Loading budgets…</Body>
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
          <Body>
            {selected.periodLabel} · {selected.isActive ? "Active" : "Paused"}
          </Body>
          <PlanTabs
            items={["Overview", "Reports", "Transactions"]}
            value={tab}
            onChange={setTab}
          />
          {tab === "Overview" ? (
            <>
              <Card>
                <Text
                  style={{
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 24,
                    color: colors.ink,
                  }}
                >
                  {money(
                    String(
                      Math.abs(selected.targetAmount - selected.actualAmount),
                    ),
                    selected.currency,
                  )}{" "}
                  {selected.actualAmount > selected.targetAmount
                    ? "over target"
                    : "left"}
                </Text>
                <Body>
                  {money(String(selected.actualAmount), selected.currency)} of{" "}
                  {money(String(selected.targetAmount), selected.currency)}
                </Body>
                <Progress value={selected.progressPercent} />
                <Body>
                  {Math.round(selected.progressPercent)}% ·{" "}
                  {selected.statusLabel}
                </Body>
              </Card>
              <Body>
                {selected.kind === "savings_target"
                  ? "Income left after spending in this Profile and currency. This is not money reserved separately."
                  : `Only ${selected.categoryName ?? (selected.scope === "account" ? "this account’s" : "matching")} expenses count. Transfers are excluded.`}
              </Body>
              <PlanAction
                title="View transactions"
                onPress={() => setTab("Transactions")}
              />
              <PlanAction
                title="Edit budget"
                tone="edit"
                onPress={() => setEditor({ budget: selected })}
              />
              <PlanAction
                title="Ask Clover about this budget"
                tone="ask"
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/adviser",
                    params: {
                      page: "budgeting",
                      prompt: `Help me understand my budget, ${selected.name}.`,
                    },
                  })
                }
              />
              <PlanAction
                title="Delete budget"
                tone="delete"
                onPress={() => setEditor({ budget: selected })}
              />
            </>
          ) : historyError ? (
            <Notice>{historyError}</Notice>
          ) : !history ? (
            <Body>Loading {tab.toLowerCase()}…</Body>
          ) : tab === "Reports" ? (
            <Card>
              {history.points.length ? (
                history.points.map((point) => (
                  <View key={point.periodStart} style={{ gap: 10 }}>
                    <Body muted={false}>{point.label}</Body>
                    <Progress value={point.progressPercent} />
                    <Body>
                      {money(String(point.actualAmount), selected.currency)} of{" "}
                      {money(String(point.targetAmount), selected.currency)} ·{" "}
                      {Math.round(point.progressPercent)}%
                    </Body>
                  </View>
                ))
              ) : (
                <Body>No earlier periods yet.</Body>
              )}
            </Card>
          ) : (
            <Card>
              {history.recentTransactions.length ? (
                history.recentTransactions.map((tx) => (
                  <View
                    key={tx.id}
                    style={{
                      gap: 6,
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                      paddingVertical: 12,
                    }}
                  >
                    <Body muted={false}>{tx.merchantName}</Body>
                    <Body>
                      {tx.categoryName ?? "Uncategorized"} ·{" "}
                      {tx.date.slice(0, 10)}
                    </Body>
                    <Body>{money(String(tx.amount), selected.currency)}</Body>
                    <PlanAction
                      title="View transaction"
                      onPress={() =>
                        router.push({
                          pathname: "/transaction/[id]",
                          params: { id: tx.id },
                        })
                      }
                    />
                  </View>
                ))
              ) : (
                <Body>No matching transactions yet.</Body>
              )}
            </Card>
          )}
        </>
      ) : (
        <>
          {!data.budgets.length ? (
            <>
              <Body>
                Start with a budget. Choose a starting point and set your own
                amount.
              </Body>
              {["Food & Dining", "Transport", "Monthly savings"].map((name) => (
                <Card key={name}>
                  <CategoryMark
                    name={name === "Monthly savings" ? "Income" : name}
                    size={40}
                  />
                  <Body muted={false}>{name}</Body>
                  <PlanAction
                    title={`Set up ${name}`}
                    onPress={() => setEditor({ budget: null, preset: name })}
                  />
                </Card>
              ))}
            </>
          ) : (
            data.budgets.map((budget) => (
              <Card
                key={budget.id}
                style={{
                  backgroundColor: dark ? "#183137" : "#effaf5",
                  borderColor: budget.appearance?.color ?? colors.line,
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
                      budget.categoryName ??
                      (budget.kind === "savings_target"
                        ? "Income"
                        : budget.name)
                    }
                    size={32}
                  />
                  <Text
                    style={{
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 16,
                      color: colors.ink,
                      flex: 1,
                    }}
                  >
                    {budget.name}
                  </Text>
                </View>
                <Body>
                  {budget.periodLabel} · {budget.isActive ? "Active" : "Paused"}
                </Body>
                <Body muted={false}>
                  {money(
                    String(Math.abs(budget.targetAmount - budget.actualAmount)),
                    budget.currency,
                  )}{" "}
                  {budget.actualAmount > budget.targetAmount
                    ? "over target"
                    : "left"}
                </Body>
                <Body>
                  {money(String(budget.actualAmount), budget.currency)} of{" "}
                  {money(String(budget.targetAmount), budget.currency)}
                </Body>
                <Progress value={budget.progressPercent} />
                <Body>{Math.round(budget.progressPercent)}%</Body>
                <PlanAction
                  title="Open budget"
                  onPress={() => {
                    setTab("Overview");
                    setSelected(budget);
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
function BudgetEditor({
  budget,
  preset,
  onClose,
  onSaved,
}: {
  budget: Budget | null;
  preset?: string;
  onClose: () => void;
  onSaved: (budget: Budget | null) => void;
}) {
  const session = useSession();
  const {
    data: options,
    error: optionsError,
    reload,
  } = usePlanData("budgets/options", optionSample);
  const [name, setName] = useState(budget?.name ?? preset ?? "");
  const [amount, setAmount] = useState(
    budget ? String(budget.targetAmount) : "",
  );
  const [currency, setCurrency] = useState(budget?.currency ?? "PHP");
  const [kind, setKind] = useState<Budget["kind"]>(
    budget?.kind ??
      (preset === "Monthly savings" ? "savings_target" : "spend_limit"),
  );
  const [scope, setScope] = useState<Budget["scope"]>(
    budget?.scope ?? "global",
  );
  const [categoryId, setCategory] = useState(budget?.categoryId ?? null);
  const [accountId, setAccount] = useState(budget?.accountId ?? null);
  const [cadence, setCadence] = useState(budget?.cadence ?? "monthly");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!budget && preset && options) {
      const category = options.categories.find((c) => c.name === preset);
      if (category) {
        setScope("category");
        setCategory(category.id);
      }
    }
  }, [options, budget, preset]);
  const save = async (action: "save" | "delete" | "toggle") => {
    if (inFlight.current) return;
    const targetAmount = Number(amount);
    if (
      action !== "delete" &&
      (!name.trim() ||
        !Number.isFinite(targetAmount) ||
        targetAmount <= 0 ||
        !/^[A-Z]{3}$/.test(currency))
    ) {
      setError("Enter a name, positive amount and three-letter currency.");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError("");
    const payload = {
      name: name.trim(),
      kind,
      scope: kind === "savings_target" ? "global" : scope,
      cadence,
      currency,
      targetAmount,
      accountId:
        kind !== "savings_target" && scope === "account" ? accountId : null,
      categoryId:
        kind !== "savings_target" && scope === "category" ? categoryId : null,
      ...(action === "toggle" ? { isActive: !budget?.isActive } : {}),
    };
    try {
      if (!session.demo)
        await session.request(
          `budgets${budget ? `/${budget.id}` : ""}?workspaceId=${encodeURIComponent(session.profileId)}`,
          {
            method: action === "delete" ? "DELETE" : budget ? "PATCH" : "POST",
            ...(action === "delete" ? {} : { body: JSON.stringify(payload) }),
          },
        );
      if (!alive.current) return;
      onSaved(
        action === "delete"
          ? null
          : ({
              ...budget,
              ...payload,
              id: budget?.id ?? `demo-${Date.now()}`,
              actualAmount: budget?.actualAmount ?? 0,
              progressPercent: budget?.progressPercent ?? 0,
              statusLabel: "Within target",
              periodLabel: cadence,
              isActive:
                action === "toggle"
                  ? !budget?.isActive
                  : (budget?.isActive ?? true),
              categoryName:
                options?.categories.find((c) => c.id === categoryId)?.name ??
                null,
            } as Budget),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save budget.");
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title={budget ? "Edit Budget" : "Create Budget"}
        back={() => {
          if (!saving) onClose();
        }}
      />
      {optionsError ? (
        <>
          <Notice>{optionsError}</Notice>
          <PlanAction title="Retry options" onPress={reload} />
        </>
      ) : null}
      <Field label="Budget name" value={name} onChangeText={setName} />
      <Field
        label="Amount"
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
      <Body>Type</Body>
      <PlanAction
        title={kind === "spend_limit" ? "Spending limit ✓" : "Spending limit"}
        onPress={() => setKind("spend_limit")}
      />
      <PlanAction
        title={
          kind === "savings_target" ? "Savings target ✓" : "Savings target"
        }
        onPress={() => {
          setKind("savings_target");
          setScope("global");
        }}
      />
      {kind === "spend_limit" ? (
        <>
          <Body>Applies to</Body>
          <PlanAction
            title={scope === "global" ? "All spending ✓" : "All spending"}
            onPress={() => setScope("global")}
          />
          {options?.categories.map((c) => (
            <PlanAction
              key={c.id}
              title={`${c.name}${scope === "category" && categoryId === c.id ? " ✓" : ""}`}
              onPress={() => {
                setScope("category");
                setCategory(c.id);
              }}
            />
          ))}
          {options?.accounts.map((a) => (
            <PlanAction
              key={a.id}
              title={`${a.name} · ${a.currency}${scope === "account" && accountId === a.id ? " ✓" : ""}`}
              onPress={() => {
                setScope("account");
                setAccount(a.id);
                setCurrency(a.currency);
              }}
            />
          ))}
        </>
      ) : (
        <Body>
          Savings means income left after spending, not a reserved account
          balance.
        </Body>
      )}
      <Body>Cadence</Body>
      {["daily", "weekly", "biweekly", "monthly", "quarterly", "annual"].map(
        (value) => (
          <PlanAction
            key={value}
            title={`${value}${cadence === value ? " ✓" : ""}`}
            onPress={() => setCadence(value)}
          />
        ),
      )}
      {error ? <Notice>{error}</Notice> : null}
      {deleting ? (
        <Card>
          <Body>
            Delete this budget? Your transactions will stay unchanged.
          </Body>
          <PlanAction
            title="Keep budget"
            disabled={saving}
            onPress={() => setDeleting(false)}
          />
          <PlanAction
            title="Confirm delete"
            tone="delete"
            disabled={saving}
            onPress={() => void save("delete")}
          />
        </Card>
      ) : null}
      {budget ? (
        <>
          <PlanAction
            title={budget.isActive ? "Pause budget" : "Resume budget"}
            disabled={saving}
            onPress={() => void save("toggle")}
          />
          <PlanAction
            title="Delete budget"
            tone="delete"
            disabled={saving}
            onPress={() => setDeleting(true)}
          />
        </>
      ) : null}
      <PlanAction title="Cancel" disabled={saving} onPress={onClose} />
      <PlanAction
        title={saving ? "Saving…" : budget ? "Save changes" : "Create Budget"}
        tone="primary"
        disabled={saving || !options}
        onPress={() => void save("save")}
      />
    </Screen>
  );
}
