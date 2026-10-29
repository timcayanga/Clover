import { useState } from "react";
import { Pressable, View, Alert } from "react-native";
import { router } from "expo-router";
import { Text } from "./app-text";
import { Body, Card, Notice, money, useTheme, CategoryMark, Icon } from "./ui";
import { PersonAvatar } from "./person-avatar";
import { PlanAction, Progress } from "./plan-ui";
import { SplitItemGrid } from "./split-item-grid";
import { useSession } from "./session";
import { useCircleDateFormat } from "./circle-dates";
import { displayDate } from "../../shared/localized-date";
import { properLabel, currencyTotals } from "../../shared/circle-experience";
import type { CircleAction } from "./circle-resource-editor";
import type { SplitItem } from "../../shared/split-bill-experience";
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
  activities?: { id: string; summary: string; createdAt: string }[];
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
    [whole, setWhole] = useState(false);
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
  ) => (
    <View
      key={key}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      <PersonAvatar name={main} imageUrl={avatar} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body muted={false}>{main}</Body>
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
        <Card>
          <Body muted={false}>Shared Expenses This Month</Body>
          {Object.entries(totals).map(([currency, n]) => (
            <Body key={currency}>{money(String(n), currency)}</Body>
          ))}
          <Body muted={false}>Contributions This Month</Body>
          {Object.entries(
            circle.contributionCurrencyTotals ?? {
              [circle.currency]: circle.contributionTotalThisMonth,
            },
          ).map(([currency, n]) => (
            <Body key={currency}>{money(String(n), currency)}</Body>
          ))}
        </Card>
        <Card>
          <Body muted={false}>Where It Went</Body>
          {Object.entries(
            currencyTotals(
              (circle.expenses ?? []).map((e) => ({
                currency: e.currency,
                amount: e.amount,
              })),
            ),
          ).map(([currency, total]) => (
            <View key={currency} style={{ gap: 10 }}>
              <Body>{currency}</Body>
              {Object.entries(
                (circle.expenses ?? [])
                  .filter((e) => e.currency === currency)
                  .reduce<Record<string, number>>((all, e) => {
                    const key = e.categoryName ?? "Shared Expenses";
                    all[key] = (all[key] ?? 0) + e.amount;
                    return all;
                  }, {}),
              ).map(([label, n]) => (
                <View key={label}>
                  <Body>
                    {label} · {money(String(n), currency)}
                  </Body>
                  <Progress value={total ? (n / total) * 100 : 0} />
                </View>
              ))}
            </View>
          ))}
        </Card>
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
        {canEdit
          ? action("+ Share Transaction", () =>
              onEdit({ action: "share_transaction" }),
            )
          : null}
        <Card>
          {(circle.expenses ?? []).map((e) => (
            <CircleExpenseRow
              key={e.id}
              expense={e}
              people={people}
              editable={canEdit && e.canEditSplit !== false}
              format={format}
              onSave={(items) =>
                run({ action: "update_expense_split", id: e.id, items })
              }
              onRemove={() =>
                void run({ action: "unshare_transaction", id: e.id })
              }
            />
          ))}
          {!circle.expenses?.length ? (
            <Body>No Shared Expenses Yet</Body>
          ) : null}
        </Card>
        {canEdit && circle.expenses?.some((e) => e.kind !== "split_bill") ? (
          <>
            {action(whole ? "Split Per Transaction" : "Split Together", () =>
              setWhole((v) => !v),
            )}
            {whole
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
                    key={currency}
                    currency={currency}
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
        <Card>
          {(circle.members ?? []).map((m) =>
            row(
              m.id,
              m.isMe ? "Me" : m.displayName,
              properLabel(m.role),
              undefined,
              m.avatarUrl,
              menu(`View ${m.displayName}`, () =>
                Alert.alert(m.displayName, undefined, [
                  ...(circle.role === "organizer"
                    ? [
                        {
                          text: "Edit Person",
                          onPress: () =>
                            onEdit({ ...m, action: "update_member" }),
                        },
                      ]
                    : []),
                  ...(circle.splitBillGroupId
                    ? [
                        {
                          text: "View Balances",
                          onPress: () => onMember(m.displayName),
                        },
                      ]
                    : []),
                  { text: "Close", style: "cancel" },
                ]),
              ),
            ),
          )}
          {circle.role === "organizer"
            ? action("+ Add Person", () =>
                onEdit({ action: "add_participant" }),
              )
            : null}
        </Card>
        {circle.role === "organizer" ? (
          <PlanAction title="Invite People" tone="primary" onPress={onInvite} />
        ) : null}
      </>
    );
  if (tab === "Activity")
    return (
      <Card>
        {(circle.activities ?? []).map((e) =>
          row(e.id, e.summary, displayDate(e.createdAt, format)),
        )}
        {!circle.activities?.length ? (
          <Body>No Circle Activity Yet</Body>
        ) : null}
      </Card>
    );
  if (tab === "Contributions")
    return (
      <>
        <Card>
          {(circle.contributions ?? []).map((e) =>
            row(
              e.id,
              e.memberName ?? "Me",
              displayDate(e.contributionDate, format),
              money(String(e.amount), e.currency),
              members.find((m) => m.id === e.memberId)?.avatarUrl,
            ),
          )}
        </Card>
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
        {(circle.commitments ?? []).map((e) => (
          <Card key={e.id}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
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
          </Card>
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
      {list.map((e) => (
        <Card key={e.id}>
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
        </Card>
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
}: {
  expense: NonNullable<CircleDetail["expenses"]>[number];
  people: { id: string; name: string; avatarUrl?: string | null }[];
  editable: boolean;
  format: string;
  onSave: (items: SplitItem[]) => Promise<void>;
  onRemove: () => void;
}) {
  const { colors } = useTheme(),
    [open, setOpen] = useState(false);
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
          <SplitItemGrid
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
}: {
  expenses: NonNullable<CircleDetail["expenses"]>;
  people: { id: string; name: string; avatarUrl?: string | null }[];
  currency: string;
  onSave: (items: SplitItem[]) => Promise<void>;
}) {
  const [items, setItems] = useState<SplitItem[]>(() =>
      expenses.map((e) => ({
        id: e.id,
        description: e.title,
        amount: String(e.amount),
        participantIds: people.map((p) => p.id),
      })),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Card>
      <Body>Split Together · {currency}</Body>
      <SplitItemGrid
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
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}
