import { AccountSummaryGrid } from "./account-summary-grid";
import { circleExpensePayerTotals } from "../../shared/circle-expense-payers";
import { circleSplitRevision, validateCircleExpenseSplit } from "../../shared/circle-expense-split";
import { MerchantLogo } from "./merchant-logo";
import { Modal } from "./adaptive-modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useExchangeRates } from "./use-exchange-rates";
import {
  circleActivityEmoji,
  circleConvertedTotal,
  circleCategoryTotals,
} from "../../shared/circle-overview";
import { useState } from "react";
import { Pressable, View, Alert, ScrollView } from "react-native";
import { router } from "expo-router";
import { Text } from "./app-text";
import { Body, Card, Notice, money, useTheme, CategoryMark, Icon, SectionTitle } from "./ui";
import { PersonAvatar } from "./person-avatar";
import { SpendingDonut } from "./spending-donut";
import { CloverEmptyState } from "./clover-mascot";
import { ChoiceField } from "./transaction-entry";
import {
  PlanAction,
  Progress,

  PlanDirectoryCard,
} from "./plan-ui";
import { SplitItemGrid } from "./split-item-grid";
import { useSession } from "./session";
import { useCircleDateFormat } from "./circle-dates";
import { displayDate } from "../../shared/localized-date";
import { properLabel } from "../../shared/circle-experience";
import type { CircleAction } from "./circle-resource-editor";
import {
  type SplitItem,
} from "../../shared/split-bill-experience";
export type CircleDetail = {
  id: string;
  currency: string;
  role: string;
  isOwner?: boolean;
  splitBillGroupId?: string | null;
  expenseTotalThisMonth: number;
  contributionTotalThisMonth: number;
  expenseCurrencyTotals?: Record<string, number>;
  contributionCurrencyTotals?: Record<string, number>;
  members?: {
    id: string;
    displayName: string;
    avatarUrl?: string | null;
    status: string;
    role: string;
    isOwner?: boolean;
    isMe?: boolean;
  }[];
  expenses?: {
    id: string;
    kind?: string;
    title: string;
    amount: number;
    currency: string;
    date: string;
    visibility: string;
    transactionId?: string;
    categoryName?: string | null;
    canEditSplit?: boolean;
    paidByMemberId?: string | null;
    merchantLogoUrl?: string | null;
    paidByName?: string | null;
    canUnshare?: boolean;
    lineItems?: { description: string; amount: string | null }[];
    splitItems?: SplitItem[];
  }[];
  budgets?: {
    id: string;
    name: string;
    targetAmount: number;
    spentAmount: number;
    currency: string;
    progressPercent: number;
    cadence?: string;
    startsAt?: string | null;
    endsAt?: string | null;
  }[];
  goals?: {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    currency: string;
    progressPercent: number;
    targetDate?: string | null;
  }[];
  commitments?: {
    id: string;
    title: string;
    amount: number | null;
    currency: string;
    recurrence?: string;
    nextDueDate?: string | null;
    assignedMemberId?: string | null;
    assignedMemberIds?: string[];
    assignedMemberName?: string | null;
    isActive: boolean;
    notes?: string | null;
  }[];
  contributions?: {
    id: string;
    memberId?: string | null;
    memberName: string | null;
    amount: number;
    currency: string;
    contributionDate: string;
    destinationLabel?: string | null;
    note?: string | null;
  }[];
  activities?: {
    id: string;
    expenseId?: string | null;
    action?: string;
    summary: string;
    createdAt: string;
  }[];
};
export function CircleDetailPanels({
  circle,
  tab,
  onEdit,
  onCategory,
  onAddExpense,
  onInvite,
  onRefresh,
  onArchive,
  onMember,
  displayCurrency,
}: {
  displayCurrency?: string;
  circle: CircleDetail;
  tab: string;
  onAddExpense: () => void;
  onCategory: (category: string) => void;
  onEdit: (action: CircleAction) => void;
  onInvite: () => void;
  onRefresh: () => void;
  onArchive: () => void;
  onMember: (name: string) => void;
}) {
  const { colors, dark } = useTheme(),
    format = useCircleDateFormat(),
    session = useSession(),
    [detail, setDetail] = useState<{id: string; index?: number} | null>(null);
  const targetCurrency = displayCurrency ?? circle.currency;
  const expenseTotals = circle.expenseCurrencyTotals ?? {
    [circle.currency]: circle.expenseTotalThisMonth,
  };
  const contributionTotals = circle.contributionCurrencyTotals ?? {
    [circle.currency]: circle.contributionTotalThisMonth,
  };
  const fx = useExchangeRates(
    [
      ...Object.keys(expenseTotals),
      ...Object.keys(contributionTotals),
      ...(circle.expenses ?? []).map((e) => e.currency),
    ],
    targetCurrency,
    tab === "Overview",
  );
  const convertedValue = (totals: Record<string, number>) => {
    const n = circleConvertedTotal(totals, targetCurrency, fx.rates);
    return n === null
      ? fx.loading
        ? "Converting…"
        : "Conversion unavailable"
      : money(String(n), targetCurrency);
  };
  const canEdit = circle.role !== "participant",
    members = (circle.members ?? []).filter((m) => m.status === "active"),
    people = members.map((m) => ({
      id: m.id,
      name: m.isMe ? "Me" : m.displayName,
      avatarUrl: m.avatarUrl,
    }));
  const action = (title: string, press: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={press}
      style={{ paddingVertical: 12 }}
    >
      <Text style={{ color: colors.teal }}>{title}</Text>
    </Pressable>
  );
  const menu = (label: string, press: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={press}
      style={{ padding: 10 }}
    >
      <Icon name="ellipsis-horizontal" size={22} />
    </Pressable>
  );
  const row = (
    key: string,
    main: string,
    sub: string,
    amount?: string,
    avatar?: string | null,
    trailing?: React.ReactNode,
    activity?: string,
  ) => (
    <View
      key={key}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      {activity ? (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{ fontSize: 24, width: 28, textAlign: "center" }}
        >
          {circleActivityEmoji(activity)}
        </Text>
      ) : (
        <PersonAvatar name={main} imageUrl={avatar} size={32} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 14,
            color: colors.ink,
            fontFamily: "Poppins-Regular",
          }}
        >
          {main}
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>{sub}</Text>
      </View>
      {amount ? (
        <Text
          style={{
            fontSize: 12,
            color: colors.ink,
            fontVariant: ["tabular-nums"],
          }}
        >
          {amount}
        </Text>
      ) : null}
      {trailing}
    </View>
  );
  if (tab === "Overview") {
    const entries = circleCategoryTotals(
      circle.expenses ?? [],
      targetCurrency,
      fx.rates,
    );
    const unavailable =
      entries === null ||
      circleConvertedTotal(expenseTotals, targetCurrency, fx.rates) === null ||
      circleConvertedTotal(contributionTotals, targetCurrency, fx.rates) ===
        null;
    return (
      <>
        <AccountSummaryGrid metrics={[
          {label:"Shared Expenses",value:convertedValue(expenseTotals)},
          {label:"Contributions",value:convertedValue(contributionTotals)},
        ]}/>
        {canEdit && <View style={{flexDirection:"row", flexWrap:"wrap", gap:8}}>
          <PlanAction title="Add Expense" tone="primary" onPress={onAddExpense}/>
          <PlanAction title="Add Contribution" onPress={() => onEdit({action:"add_contribution"})}/>
        </View>}
        {unavailable && !fx.loading ? (
          <PlanAction title="Retry Conversion" onPress={fx.retry} />
        ) : null}
        <Card>
          <SectionTitle>Where It Went</SectionTitle>
          {entries === null ? (
            <Body>{fx.loading ? "Converting…" : "Conversion unavailable"}</Body>
          ) : !entries.length ? (
            <CloverEmptyState pose="reports">
              Share your first expense to see your category report
            </CloverEmptyState>
          ) : (
            <>
              <SpendingDonut
                variant="category"
                onCategoryPress={onCategory}
                currency={targetCurrency}
                categories={entries.map(([name, amount]) => ({ name, amount }))}
              />
              {entries.map(([name, amount]) => (
                <Pressable accessibilityRole="button" onPress={() => onCategory(name)}
                  key={name}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderColor: colors.line,
                  }}
                >
                  <CategoryMark name={name} size={28} />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.ink }}>
                    {name}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.ink }}>
                    {money(String(amount), targetCurrency)}
                  </Text>
                </Pressable>
              ))}
            </>
          )}
        </Card>
        <SectionTitle>Budgets</SectionTitle>
        {!circle.budgets?.length ? (
          <CloverEmptyState pose="budget">
            No shared budgets yet
          </CloverEmptyState>
        ) : (
          (circle.budgets ?? []).slice(0, 2).map((e) => (
            <PlanDirectoryCard compact
              key={e.id}
              color={
                e.progressPercent >= 100
                  ? "#e65064"
                  : e.progressPercent >= 80
                    ? "#d8841e"
                    : "#00abc0"
              }
            >
              <Icon name="wallet-outline" size={32} />
              <SectionTitle>{e.name}</SectionTitle>
              <Body>
                {money(String(e.spentAmount), e.currency)} of{" "}
                {money(String(e.targetAmount), e.currency)}
              </Body>
              <Progress value={e.progressPercent} />
            </PlanDirectoryCard>
          ))
        )}
        <SectionTitle>Goals</SectionTitle>
        {!circle.goals?.length ? (
          <CloverEmptyState pose="savings">
            No shared goals yet
          </CloverEmptyState>
        ) : (
          (circle.goals ?? []).slice(0, 2).map((e) => (
            <PlanDirectoryCard compact key={e.id} color="#35b875">
              <Icon name="flag-outline" size={32} />
              <SectionTitle>{e.name}</SectionTitle>
              <Body>
                {money(String(e.currentAmount), e.currency)} saved of{" "}
                {money(String(e.targetAmount), e.currency)}
              </Body>
              <Progress value={e.progressPercent} />
            </PlanDirectoryCard>
          ))
        )}
        {circle.isOwner ? (
          <PlanAction
            title="Archive Circle"
            tone="delete"
            onPress={onArchive}
          />
        ) : null}
      </>
    );
  }
  const expenses = circle.expenses ?? [];
  const openExpense = (expense: Expense, index?: number) => {
    setDetail({id: expense.id, index});
  };
  const current = expenses.find(expense => expense.id === detail?.id);
  const sheet = current && detail ? <ExpenseSheet key={current.id} expense={current} index={detail.index}
    people={people} editable={current.kind === "shared_transaction" && canEdit && current.canEditSplit !== false} format={format}
    onClose={() => setDetail(null)} onUpdate={async (action, values) => {
      try { await session.request(`circles/${circle.id}/resources?workspaceId=${encodeURIComponent(session.profileId)}`, {
        method: "POST", body: JSON.stringify({action, id: current.id, ...values})
      }); } finally { onRefresh(); }
    }}/> : null;
  if (tab === "Expenses") {
    const totals = circleExpensePayerTotals(expenses);
    const splittable = expenses.filter(e => e.kind === "shared_transaction" && e.visibility !== "summary" && canEdit && e.canEditSplit !== false);
    return <>
      {expenses.map(e => <Pressable key={e.id} accessibilityRole="button" onPress={() => openExpense(e)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line }}>
        <ExpenseMark expense={e}/>
        <View style={{flex: 1}}><Body muted={false}>{e.title}</Body>
          <Text style={{color: colors.muted, fontSize: 11}}>{displayDate(e.date, format)}{e.paidByName ? ` · Paid by ${e.paidByName}` : ""}</Text></View>
        <Text style={{color: colors.ink}}>{money(String(e.amount), e.currency)}</Text>
      </Pressable>)}
      {!expenses.length && <CloverEmptyState pose="circles">No matching expenses</CloverEmptyState>}
      {canEdit && action("+ Share Transaction", () => onEdit({action: "share_transaction"}))}
      {!!totals.length && <Card><SectionTitle>Paid by Member</SectionTitle>{totals.map(t => <Body key={t.id}>{t.name} · {money(String(t.amount), t.currency)}</Body>)}</Card>}
      {!!splittable.length && <Card><SectionTitle>Split Together</SectionTitle>
        {splittable.flatMap(e => expenseItems(e, people).map((item, index) =>
          <Pressable key={e.id + ":" + index} accessibilityRole="button" accessibilityLabel={`Split ${item.description}`} onPress={() => openExpense(e, index)}
            style={{flexDirection: "row", alignItems: "center", minHeight: 48, gap: 8}}>
            <View style={{flex: 1}}><Body muted={false}>{item.description}</Body></View><Body>{money(item.amount, e.currency)}</Body><Icon line name="ellipsis-horizontal" size={20}/>
          </Pressable>))}
      </Card>}
      {sheet}
    </>;
  }
  if (tab === "People")
    return (
      <>
        <View>
          {(circle.members ?? []).map((m) =>
            row(
              m.id,
              m.isMe ? "Me" : m.displayName,
              properLabel(m.role),
              undefined,
              m.avatarUrl,
              menu(`View ${m.displayName}`, () =>
                onEdit({ ...m, action: "update_member" }),
              ),
            ),
          )}
          {circle.role === "organizer"
            ? action("+ Add Person", () =>
                onEdit({ action: "add_participant" }),
              )
            : null}
        </View>
        {circle.role === "organizer" ? (
          <PlanAction title="Invite People" tone="primary" onPress={onInvite} />
        ) : null}
      </>
    );
  if (tab === "Activity")
    return (
      <View>
        {(circle.activities ?? []).map(event => {
          const expense = expenses.find(e => e.id === event.expenseId);
          const content = row(event.id, expense ? event.summary + " · " + expense.title : event.summary, displayDate(event.createdAt, format), undefined, undefined, undefined, event.action || "activity");
          return expense ? <Pressable key={event.id} accessibilityRole="button" onPress={() => openExpense(expense)}>{content}</Pressable> : content;
        })}
        {sheet}
        {!circle.activities?.length ? (
          <CloverEmptyState pose="circles">
            No Circle activity yet
          </CloverEmptyState>
        ) : null}
      </View>
    );
  if (tab === "Contributions")
    return (
      <>
        {!circle.contributions?.length ? (
          <CloverEmptyState pose="savings">
            No contributions yet
          </CloverEmptyState>
        ) : null}
        <View>
          {(circle.contributions ?? []).map((e) =>
            row(
              e.id,
              `${e.memberName ?? "Me"}${e.destinationLabel ? ` → ${e.destinationLabel}` : ""}`,
              displayDate(e.contributionDate, format),
              money(String(e.amount), e.currency),
              members.find((m) => m.id === e.memberId)?.avatarUrl,
            ),
          )}
        </View>
        {canEdit
          ? action("+ Add Contribution", () =>
              onEdit({ action: "add_contribution" }),
            )
          : null}
      </>
    );
  if (tab === "Recurring")
    return (
      <>
        {!circle.commitments?.length ? (
          <CloverEmptyState pose="calendar">
            No shared recurring payments yet
          </CloverEmptyState>
        ) : null}
        {(circle.commitments ?? []).map((e) => (
          <View
            key={e.id}
            style={{
              paddingVertical: 10,
              gap: 6,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Icon name="repeat-outline" size={28} />
              <View style={{ flex: 1 }}>
                <Body muted={false}>{e.title}</Body>
              </View>
              {canEdit
                ? menu("Edit Recurring", () =>
                    onEdit({
                      ...e,
                      amount: e.amount ?? undefined,
                      action: "update_commitment",
                    }),
                  )
                : null}
            </View>
            <Body>
              {money(String(e.amount ?? 0), e.currency)} ·{" "}
              {properLabel(e.recurrence ?? "monthly")}
            </Body>
            <Body>
              {(e.assignedMemberIds?.length
                ? members
                    .filter((m) => e.assignedMemberIds!.includes(m.id))
                    .map((m) => (m.isMe ? "Me" : m.displayName))
                : e.assignedMemberName
                  ? [e.assignedMemberName]
                  : ["Everyone"]
              ).join(", ")}
            </Body>
            {e.nextDueDate ? (
              <Body>Next Due · {displayDate(e.nextDueDate, format)}</Body>
            ) : null}
          </View>
        ))}
        {canEdit
          ? action("+ Add Recurring", () =>
              onEdit({ action: "create_commitment" }),
            )
          : null}
      </>
    );
  const budgets = tab === "Budgets",
    list = budgets ? (circle.budgets ?? []) : (circle.goals ?? []);
  return (
    <>
      {!list.length ? (
        <CloverEmptyState pose={budgets ? "budget" : "savings"}>
          {budgets ? "No shared budgets yet" : "No shared goals yet"}
        </CloverEmptyState>
      ) : null}
      {list.map((e) => (
        <PlanDirectoryCard compact
          key={e.id}
          color={
            budgets
              ? e.progressPercent >= 100
                ? "#e65064"
                : e.progressPercent >= 80
                  ? "#d8841e"
                  : "#00abc0"
              : "#35b875"
          }
        >
          <Icon name={budgets ? "wallet-outline" : "flag-outline"} size={32} />
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <SectionTitle>{e.name}</SectionTitle>
            </View>
            {canEdit
              ? menu(budgets ? "Edit Budget" : "Edit Goal", () =>
                  onEdit({
                    ...e,
                    action: budgets ? "update_budget" : "update_goal",
                  }),
                )
              : null}
          </View>
          <Body>
            {money(
              String("spentAmount" in e ? e.spentAmount : e.currentAmount),
              e.currency,
            )}{" "}
            of {money(String(e.targetAmount), e.currency)}
          </Body>
          <View
            style={{
              height: 8,
              borderRadius: 4,
              overflow: "hidden",
              backgroundColor: colors.line,
            }}
          >
            <View
              style={{
                height: 8,
                width: `${Math.min(100, e.progressPercent)}%`,
                backgroundColor:
                  budgets && e.progressPercent >= 100
                    ? "#E65064"
                    : budgets && e.progressPercent >= 80
                      ? "#E9A23B"
                      : colors.teal,
              }}
            />
          </View>
          <Body>{e.progressPercent}%</Body>
        </PlanDirectoryCard>
      ))}
      {canEdit
        ? action(budgets ? "+ Add Budget" : "+ Add Goal", () =>
            onEdit({ action: budgets ? "create_budget" : "create_goal" }),
          )
        : null}
    </>
  );
}
type Expense = NonNullable<CircleDetail["expenses"]>[number];
type Member = {id: string; name: string; avatarUrl?: string | null};

function ExpenseMark({expense}: {expense: Expense}) {
  return <MerchantLogo transaction={{merchantRaw: expense.title, merchantClean: null, merchantLogoUrl: expense.merchantLogoUrl,
    merchantLogoNameKey: JSON.stringify([expense.title, null]), categoryName: expense.categoryName ?? null}}/>;
}

function expenseItems(expense: Expense, members: Member[]): SplitItem[] {
  const participantIds = members.map(member => member.id);
  if (expense.splitItems?.length) return expense.splitItems;
  if (!expense.lineItems?.length) return [{description: expense.title, amount: String(expense.amount), participantIds}];
  const items = expense.lineItems.map(item => ({description: item.description, amount: item.amount ?? "", participantIds}));
  const difference = Math.round((expense.amount - items.reduce((sum, item) => sum + Number(item.amount), 0)) * 100);
  if (difference > 0) items.push({description: "Other Charges", amount: String(difference / 100), participantIds});
  return items;
}

function ExpenseSheet({expense, index, people, editable, format, onClose, onUpdate}: {
  expense: Expense; index?: number; people: Member[]; editable: boolean; format: string; onClose: () => void;
  onUpdate: (action: string, values: Record<string, unknown>) => Promise<void>;
}) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState(() => expenseItems(expense, people));
  const [revision, setRevision] = useState(() => circleSplitRevision(expense.splitItems ?? []));
  const [scope, setScope] = useState(index === undefined ? "all" : String(index));
  const [payer, setPayer] = useState(expense.paidByMemberId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);
  function close() {
    if (busy) return;
    if (dirty) Alert.alert("Discard unsaved split?", error, [{text: "Keep Editing"}, {text: "Discard", style: "destructive", onPress: onClose}]);
    else onClose();
  }
  async function save(next: SplitItem[]) {
    setItems(next);
    setDirty(true);
    setFailed(false);
    try { validateCircleExpenseSplit(people.map(p => ({id: p.id, displayName: p.name})), next, expense.amount); }
    catch (reason) { setError((reason as Error).message); return; }
    setBusy(true);
    setError("");
    try { await onUpdate("update_expense_split", {items: next, previousRevision: revision}); setRevision(circleSplitRevision(next)); setDirty(false); }
    catch (reason) {setError((reason as Error).message); setFailed(true);}
    finally {setBusy(false);}
  }
  const selection = scope === "all" ? items : [items[Number(scope)]];
  const splitBy = <ChoiceField label="Split By" value={scope} onChange={setScope}
    options={[{value: "all", label: "All Line Items"}, ...items.map((item, i) => ({value: String(i), label: item.description}))]}/>;
  return <Modal transparent visible animationType="slide" onRequestClose={close}>
    <View style={{flex: 1, justifyContent: "flex-end", paddingTop: insets.top, backgroundColor: "#0006"}}>
      <Pressable accessibilityLabel="Close expense details" onPress={close} style={{flex: 1}}/>
      <View accessibilityViewIsModal style={{maxHeight: "90%", backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Math.max(16, insets.bottom)}}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: 16, gap: 12}}>
          <View style={{flexDirection: "row", alignItems: "center", gap: 8}}><ExpenseMark expense={expense}/>
            <View style={{flex: 1}}><SectionTitle>{expense.title}</SectionTitle></View>
            <Pressable accessibilityLabel="Close" onPress={close} style={{padding: 10}}><Icon line name="close"/></Pressable>
          </View>
          <Body>{money(String(expense.amount), expense.currency)} · {displayDate(expense.date, format)}{expense.categoryName ? " · " + expense.categoryName : ""}</Body>
          {editable ? <ChoiceField label="Paid By" value={payer} disabled={busy || dirty}
            options={people.map(person => ({value: person.id, label: person.name, icon: <PersonAvatar name={person.name} imageUrl={person.avatarUrl} size={28}/>}))}
            onChange={async id => {
              if (id === payer) return;
              setBusy(true); setError("");
              try {await onUpdate("update_expense_payer", {paidByMemberId: id}); setPayer(id);}
              catch (reason) {setError((reason as Error).message);}
              finally {setBusy(false);}
            }}/> : expense.paidByName ? <Body>Paid by {expense.paidByName}</Body> : null}
          {expense.visibility !== "summary" && (editable ?
            <View pointerEvents={busy ? "none" : "auto"} style={{gap: 12}}>
              <SplitItemGrid circleSplitControls={splitBy} fixedItems people={people} items={selection} currency={expense.currency}
                onChange={next => void save(scope === "all" ? next : items.map((item, i) => i === Number(scope) ? next[0] : item))}/>
            </View> : items.map((item, i) => <Body key={i}>{item.description} · {money(item.amount, expense.currency)}</Body>))}
          {expense.kind === "split_bill" && <PlanAction title="Open Bill Details" onPress={() => {onClose(); router.push({pathname: "/split-bills", params: {billId: expense.id}});}}/>}
          {error ? <Notice>{error}</Notice> : null}
          {failed && <PlanAction title="Retry" disabled={busy} onPress={() => void save(items)}/>}
          {busy && <Body>Saving…</Body>}
          {editable && expense.canUnshare && <PlanAction title="Remove From Circle" disabled={busy} onPress={() => Alert.alert("Remove this expense from the Circle?", undefined, [
            {text: "Cancel"}, {text: "Remove", style: "destructive", onPress: async () => {
              setBusy(true);
              try {await onUpdate("unshare_transaction", {}); onClose();}
              catch (reason) {setError((reason as Error).message);}
              finally {setBusy(false);}
            }}
          ])}/>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
