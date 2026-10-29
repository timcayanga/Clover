import { useEffect, useState } from "react";
import { Pressable, View, Alert } from "react-native";
import { router } from "expo-router";
import { Text } from "./app-text";
import { Body, Card, Notice, money, useTheme, CategoryMark, Icon } from "./ui";
import { PersonAvatar } from "./person-avatar";
import { SpendingDonut } from "./spending-donut";
import { CloverEmptyState } from "./clover-mascot";
import { Choices } from "./transaction-entry";
import {
  PlanAction,
  Progress,
  SummaryCard,
  PlanDirectoryCard,
} from "./plan-ui";
import { SplitItemGrid } from "./split-item-grid";
import { useSession } from "./session";
import { useCircleDateFormat } from "./circle-dates";
import { displayDate } from "../../shared/localized-date";
import { properLabel, currencyTotals } from "../../shared/circle-experience";
import type { CircleAction } from "./circle-resource-editor";
import {
  splitItemTotals,
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
    note?: string | null;
  }[];
  activities?: {
    id: string;
    action?: string;
    summary: string;
    createdAt: string;
  }[];
};
export function CircleDetailPanels({
  circle,
  tab,
  onEdit,
  onInvite,
  onRefresh,
  onArchive,
  onMember,
}: {
  circle: CircleDetail;
  tab: string;
  onEdit: (action: CircleAction) => void;
  onInvite: () => void;
  onRefresh: () => void;
  onArchive: () => void;
  onMember: (name: string) => void;
}) {
  const { colors } = useTheme(),
    format = useCircleDateFormat(),
    session = useSession(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [customExpense, setCustomExpense] = useState<string | null>(null);
  const canEdit = circle.role !== "participant",
    members = (circle.members ?? []).filter((m) => m.status === "active"),
    people = members.map((m) => ({
      id: m.id,
      name: m.isMe ? "Me" : m.displayName,
      avatarUrl: m.avatarUrl,
    }));
  const run = async (body: unknown) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await session.request(
        `circles/${circle.id}/resources?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
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
        <Icon
          name={
            /budget/.test(activity)
              ? "wallet-outline"
              : /goal/.test(activity)
                ? "flag-outline"
                : /member|invit|join/.test(activity)
                  ? "people-outline"
                  : /commitment|recurring/.test(activity)
                    ? "repeat-outline"
                    : "swap-horizontal-outline"
          }
          size={28}
        />
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
    const totals = circle.expenseCurrencyTotals ?? {
      [circle.currency]: circle.expenseTotalThisMonth,
    };
    return (
      <>
        {Array.from(
          new Set([
            ...Object.keys(totals),
            ...Object.keys(
              circle.contributionCurrencyTotals ?? {
                [circle.currency]: circle.contributionTotalThisMonth,
              },
            ),
          ]),
        ).map((currency) => (
          <View key={currency} style={{ flexDirection: "row", gap: 12 }}>
            <SummaryCard
              title="Shared Expenses"
              value={money(String(totals[currency] ?? 0), currency)}
            />
            <SummaryCard
              title="Contributions"
              value={money(
                String(
                  (circle.contributionCurrencyTotals ?? {
                    [circle.currency]: circle.contributionTotalThisMonth,
                  })[currency] ?? 0,
                ),
                currency,
              )}
            />
          </View>
        ))}
        <Card>
          <Body muted={false}>Where It Went</Body>
          {!(circle.expenses ?? []).length ? (
            <CloverEmptyState pose="reports">
              Share your first expense to see your category report
            </CloverEmptyState>
          ) : null}
          {Object.keys(currencyTotals(circle.expenses ?? [])).map(
            (currency) => {
              const entries = Object.entries(
                (circle.expenses ?? [])
                  .filter((e) => e.currency === currency)
                  .reduce<Record<string, number>>((r, e) => {
                    const name = e.categoryName ?? "Other";
                    r[name] = (r[name] ?? 0) + e.amount;
                    return r;
                  }, {}),
              ).sort((a, b) => b[1] - a[1]);
              return (
                <View key={currency}>
                  <Body>{currency}</Body>
                  <SpendingDonut
                    currency={currency}
                    categories={entries.map(([name, amount]) => ({
                      name,
                      amount,
                    }))}
                  />
                  {entries.map(([name, amount]) => (
                    <View
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
                      <Text
                        style={{ flex: 1, fontSize: 13, color: colors.ink }}
                      >
                        {name}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.ink }}>
                        {money(String(amount), currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            },
          )}
        </Card>
        <Body muted={false}>Budget Tracking</Body>
        {!circle.budgets?.length ? (
          <CloverEmptyState pose="budget">
            No shared budgets yet
          </CloverEmptyState>
        ) : (
          (circle.budgets ?? []).slice(0, 2).map((e) => (
            <PlanDirectoryCard
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
              <Body muted={false}>{e.name}</Body>
              <Body>
                {money(String(e.spentAmount), e.currency)} of{" "}
                {money(String(e.targetAmount), e.currency)}
              </Body>
              <Progress value={e.progressPercent} />
            </PlanDirectoryCard>
          ))
        )}
        <Body muted={false}>Goal Tracking</Body>
        {!circle.goals?.length ? (
          <CloverEmptyState pose="savings">
            No shared goals yet
          </CloverEmptyState>
        ) : (
          (circle.goals ?? []).slice(0, 2).map((e) => (
            <PlanDirectoryCard key={e.id} color="#35b875">
              <Icon name="flag-outline" size={32} />
              <Body muted={false}>{e.name}</Body>
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
  if (tab === "Expenses")
    return (
      <>
        <View>
          {(circle.expenses ?? []).map((e) => (
            <CircleExpenseRow
              key={e.id}
              expense={e}
              people={people}
              editable={canEdit && e.canEditSplit !== false}
              format={format}
              forceOpen={customExpense === e.id}
              onSave={(items) =>
                run({ action: "update_expense_split", id: e.id, items })
              }
              onRemove={() =>
                void run({ action: "unshare_transaction", id: e.id })
              }
            />
          ))}
          {!circle.expenses?.length ? (
            <CloverEmptyState pose="circles">
              No shared expenses yet
            </CloverEmptyState>
          ) : null}
        </View>
        {canEdit
          ? action("+ Share Transaction", () =>
              onEdit({ action: "share_transaction" }),
            )
          : null}
        {canEdit && circle.expenses?.some((e) => e.kind !== "split_bill") ? (
          <>
            {true
              ? [
                  ...new Set(
                    circle.expenses
                      .filter(
                        (e) =>
                          e.kind !== "split_bill" && e.visibility !== "summary",
                      )
                      .map((e) => e.currency),
                  ),
                ].map((currency) => (
                  <CircleWholeSplit
                    key={
                      currency +
                      JSON.stringify(
                        circle.expenses
                          ?.filter((e) => e.currency === currency)
                          .map((e) => [e.id, e.amount, e.splitItems]),
                      )
                    }
                    currency={currency}
                    onCustom={setCustomExpense}
                    expenses={circle.expenses!.filter(
                      (e) =>
                        e.kind !== "split_bill" &&
                        e.visibility !== "summary" &&
                        e.canEditSplit !== false &&
                        e.currency === currency,
                    )}
                    people={people}
                    onSave={async (items) => {
                      for (const item of items)
                        await session.request(
                          `circles/${circle.id}/resources?workspaceId=${encodeURIComponent(session.profileId)}`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              action: "update_expense_split",
                              id: item.id,
                              items: [item],
                            }),
                          },
                        );
                      onRefresh();
                    }}
                  />
                ))
              : null}
          </>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
      </>
    );
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
        {(circle.activities ?? []).map((e) =>
          row(
            e.id,
            e.summary,
            displayDate(e.createdAt, format),
            undefined,
            undefined,
            undefined,
            e.action ?? "activity",
          ),
        )}
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
              e.memberName ?? "Me",
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
        <PlanDirectoryCard
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
              <Body muted={false}>{e.name}</Body>
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
function CircleExpenseRow({
  expense: e,
  people,
  editable,
  format,
  onSave,
  onRemove,
  forceOpen,
}: {
  expense: NonNullable<CircleDetail["expenses"]>[number];
  people: { id: string; name: string; avatarUrl?: string | null }[];
  editable: boolean;
  format: string;
  onSave: (items: SplitItem[]) => Promise<void>;
  onRemove: () => void;
  forceOpen?: boolean;
}) {
  const { colors } = useTheme(),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const initial = e.splitItems?.length
    ? e.splitItems
    : e.lineItems?.length
      ? e.lineItems.map((i) => ({
          description: i.description,
          amount: i.amount ?? "0",
          participantIds: people.map((p) => p.id),
        }))
      : [
          {
            description: e.title,
            amount: String(e.amount),
            participantIds: people.map((p) => p.id),
          },
        ];
  const sum = initial.reduce((n, i) => n + Number(i.amount), 0);
  const [items, setItems] = useState<SplitItem[]>(() =>
    sum <= e.amount && Math.abs(sum - e.amount) > 0.005
      ? [
          ...initial,
          {
            description: "Other Charges",
            amount: String(Math.round((e.amount - sum) * 100) / 100),
            participantIds: people.map((p) => p.id),
          },
        ]
      : initial,
  );
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderColor: colors.line,
        paddingVertical: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <CategoryMark name={e.categoryName ?? "Shared Expenses"} />
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          onPress={() =>
            e.kind === "split_bill"
              ? router.push({
                  pathname: "/split-bills",
                  params: { billId: e.id },
                })
              : setOpen((v) => !v)
          }
        >
          <Body muted={false}>{e.title}</Body>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {displayDate(e.date, format)}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: colors.ink }}>
          {money(String(e.amount), e.currency)}
        </Text>
        {editable && e.canUnshare !== false && e.kind !== "split_bill" ? (
          <Pressable
            accessibilityLabel={`Remove ${e.title} From Circle`}
            onPress={onRemove}
            style={{ padding: 10 }}
          >
            <Text style={{ color: colors.danger }}>×</Text>
          </Pressable>
        ) : null}
      </View>
      {open && e.visibility !== "summary" ? (
        <>
          <Body muted={false}>
            Transaction Details · Line Items & Custom Split
          </Body>
          <SplitItemGrid
            fixedItems
            people={people}
            items={items}
            currency={e.currency}
            onChange={setItems}
          />
          {editable ? (
            <PlanAction
              title="Save"
              tone="primary"
              onPress={() => void onSave(items)}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
function CircleWholeSplit({
  expenses,
  people,
  currency,
  onSave,
  onCustom,
}: {
  onCustom: (id: string) => void;
  expenses: NonNullable<CircleDetail["expenses"]>;
  people: { id: string; name: string; avatarUrl?: string | null }[];
  currency: string;
  onSave: (items: SplitItem[]) => Promise<void>;
}) {
  const [items, setItems] = useState<SplitItem[]>(() =>
      expenses.map((e) => {
        if (e.splitItems?.length) {
          const totals = splitItemTotals(people, e.splitItems);
          return {
            id: e.id,
            description: e.title,
            amount: String(e.amount),
            participantIds: people
              .filter((p) => totals[p.id] > 0)
              .map((p) => p.id),
            splitMethod: "exact" as const,
            allocations: people
              .filter((p) => totals[p.id] > 0)
              .map((p) => ({
                participantId: p.id,
                value: String(totals[p.id]),
              })),
          };
        }
        return {
          id: e.id,
          description: e.title,
          amount: String(e.amount),
          participantIds: people.map((p) => p.id),
        };
      }),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [method, setMethod] = useState("transactions");
  return (
    <View style={{ gap: 12 }}>
      <Body>Split Together · {currency}</Body>
      {method === "custom" ? (
        expenses.map((e) => (
          <PlanAction
            key={e.id}
            title={`Custom Split · ${e.title}`}
            onPress={() => onCustom(e.id)}
          />
        ))
      ) : (
        <>
          <SplitItemGrid
            fixedItems
            people={people}
            items={items}
            currency={currency}
            onChange={setItems}
          />
          <PlanAction
            title="Save"
            disabled={busy}
            tone="primary"
            onPress={() => {
              setBusy(true);
              void onSave(items)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </>
      )}
      <Body>Split By</Body>
      <Choices
        value={method}
        onChange={setMethod}
        options={[
          { value: "transactions", label: "Per Transaction" },
          { value: "custom", label: "Custom Line Items" },
        ]}
      />
      {error ? <Notice>{error}</Notice> : null}
    </View>
  );
}
