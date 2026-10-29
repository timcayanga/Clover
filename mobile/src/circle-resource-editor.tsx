import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSession } from "./session";
import { Text } from "./app-text";
import { PersonAvatar } from "./person-avatar";
import {
  Body,
  Field,
  Notice,
  Screen,
  money,
  useTheme,
  CategoryMark,
} from "./ui";
import { PlanAction, PlanHeader } from "./plan-ui";
import { Choices, ChoiceField } from "./transaction-entry";
import { properLabel, suggestCircleDate } from "../../shared/circle-experience";
import { displayDate, parseDisplayDate } from "../../shared/localized-date";
import { useCircleDateFormat } from "./circle-dates";
import type { TransactionPage } from "./types";
export type CircleAction = {
  action: string;
  id?: string;
  name?: string;
  displayName?: string;
  targetAmount?: number;
  title?: string;
  amount?: number;
  role?: string;
  status?: string;
  isOwner?: boolean;
  isActive?: boolean;
  notes?: string | null;
  currency?: string;
  recurrence?: string;
  cadence?: string;
  nextDueDate?: string | null;
  targetDate?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  assignedMemberId?: string | null;
  assignedMemberIds?: string[];
};
export function CircleResourceEditor({
  circleId,
  currency,
  initial,
  members = [],
  organizer = false,
  onClose,
  onSaved,
}: {
  circleId: string;
  currency: string;
  initial: CircleAction;
  members?: {
    id: string;
    displayName: string;
    status: string;
    isMe?: boolean;
    avatarUrl?: string | null;
  }[];
  goals?: { id: string; name: string }[];
  organizer?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useSession(),
    { colors } = useTheme(),
    format = useCircleDateFormat();
  const [listRevision, setListRevision] = useState(0);
  const listLoading = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setPage(1);
      setListRevision((n) => n + 1);
    }, []),
  );
  const action = initial.action,
    isMember = action.includes("member") || action === "add_participant",
    isShare = action === "share_transaction",
    isRemove = action === "unshare_transaction",
    isContribution = action === "add_contribution",
    isRecurring = action.includes("commitment"),
    isBudget = action.includes("budget"),
    isGoal = action.includes("goal");
  const [name, setName] = useState(
      initial.name ?? initial.displayName ?? initial.title ?? "",
    ),
    [amount, setAmount] = useState(
      String(initial.targetAmount ?? initial.amount ?? ""),
    ),
    [selectedCurrency, setCurrency] = useState(initial.currency ?? currency),
    [note, setNote] = useState(initial.notes ?? ""),
    [memberId, setMemberId] = useState(members.find((m) => m.isMe)?.id ?? ""),
    [assigned, setAssigned] = useState(
      initial.assignedMemberIds ??
        (initial.assignedMemberId
          ? [initial.assignedMemberId]
          : members.filter((m) => m.status === "active").map((m) => m.id)),
    ),
    [role, setRole] = useState(initial.role ?? "participant"),
    [status, setStatus] = useState(initial.status ?? "active"),
    [active, setActive] = useState(initial.isActive !== false),
    [cadence, setCadence] = useState(
      initial.recurrence ?? initial.cadence ?? "monthly",
    ),
    [date, setDate] = useState(
      initial.nextDueDate?.slice(0, 10) ??
        initial.targetDate?.slice(0, 10) ??
        suggestCircleDate(
          isGoal
            ? "quarterly"
            : isContribution
              ? "once"
              : (initial.recurrence ?? "monthly"),
        ),
    ),
    [starts, setStarts] = useState(
      initial.startsAt?.slice(0, 10) ?? suggestCircleDate("once"),
    ),
    [ends, setEnds] = useState(
      initial.endsAt?.slice(0, 10) ?? suggestCircleDate("quarterly"),
    ),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [transactions, setTransactions] = useState<TransactionPage["transactions"]>(
      [],
    ),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [shared, setShared] = useState<string[]>([]);
  const lock = useRef(false),
    live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!isShare) return;
    listLoading.current = true;
    let live = true;
    const timer = setTimeout(() => {
      void session
        .request<TransactionPage>(
          `transactions?workspaceId=${encodeURIComponent(session.profileId)}&query=${encodeURIComponent(search)}&page=${page}&pageSize=30&summaryMode=rows&types=expense`,
        )
        .then((r) => {
          if (live) {
            setTransactions((old) =>
              page === 1
                ? r.transactions.filter(
                    (t) => t.type === "expense" && !t.isExcluded,
                  )
                : [
                    ...old,
                    ...r.transactions.filter(
                      (t) => t.type === "expense" && !t.isExcluded,
                    ),
                  ].filter(
                    (t, i, a) => a.findIndex((x) => x.id === t.id) === i,
                  ),
            );
            setTotal(r.totalCount);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) listLoading.current = false;
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [isShare, search, page, session.request, session.profileId, listRevision]);
  const payload = (transactionId?: string) => {
    const base = { action, ...(initial.id ? { id: initial.id } : {}) };
    if (isShare) return { ...base, transactionId, visibility: "item" };
    if (isRemove) return base;
    if (isMember)
      return {
        ...base,
        displayName: name.trim(),
        role,
        ...(initial.id ? { status } : {}),
      };
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0)
      throw new Error("Enter a positive amount.");
    const values = { ...base, currency: selectedCurrency };
    if (isContribution)
      return {
        ...values,
        amount: Number(amount),
        memberId: organizer ? memberId || null : undefined,
        contributionDate: date ? parseDisplayDate(date, format) : undefined,
        note,
      };
    if (!name.trim()) throw new Error("Enter a name.");
    if (isRecurring) {
      if (!assigned.length) throw new Error("Choose at least one person.");
      return {
        ...values,
        title: name.trim(),
        amount: Number(amount),
        assignedMemberIds: assigned,
        recurrence: cadence,
        nextDueDate: date ? parseDisplayDate(date, format) : null,
        notes: note,
        isActive: active,
      };
    }
    if (isBudget)
      return {
        ...values,
        name: name.trim(),
        targetAmount: Number(amount),
        cadence,
        startsAt: cadence === "once" ? parseDisplayDate(starts, format) : null,
        endsAt: cadence === "once" ? parseDisplayDate(ends, format) : null,
        isActive: active,
      };
    return {
      ...values,
      name: name.trim(),
      targetAmount: Number(amount),
      targetDate: date ? parseDisplayDate(date, format) : null,
      purpose: note,
      ...(initial.id ? { status } : {}),
    };
  };
  const save = async (transactionId?: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (session.demo) throw new Error("Sign in to save Circle changes.");
      const body = payload(transactionId);
      await session.request(
        `circles/${circleId}/resources?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (live.current) {
        if (isShare && transactionId)
          setShared((old) => [...old, transactionId]);
        else onSaved();
      }
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  };
  const dateField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <Field
      label={`${label} (${format})`}
      value={displayDate(value, format)}
      onChangeText={(v) => {
        try {
          const iso = parseDisplayDate(v, format);
          onChange(iso?.slice(0, 10) ?? "");
          setError("");
        } catch {
          onChange(v);
        }
      }}
      onBlur={() => {
        try {
          const iso = parseDisplayDate(value, format);
          onChange(iso?.slice(0, 10) ?? "");
        } catch (e) {
          setError((e as Error).message);
        }
      }}
      keyboardType="numbers-and-punctuation"
    />
  );
  const people = members.filter((m) => m.status === "active");
  return (
    <Screen>
      <PlanHeader
        title={properLabel(
          action
            .replace("commitment", "recurring")
            .replace("share_transaction", "share transaction"),
        )}
        back={() => {
          if (!busy) {
            if (isShare && shared.length) onSaved();
            else onClose();
          }
        }}
      />
      {!isShare && !isRemove && !isContribution ? (
        <Field
          label={isMember ? "Name" : "Name"}
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
      ) : null}
      {!isShare && !isRemove && !isMember ? (
        <>
          <ChoiceField
            label="Currency"
            value={selectedCurrency}
            onChange={setCurrency}
            options={(
              session.data?.currencyChoices ?? [
                { code: "PHP", name: "Philippine Peso" },
                { code: "USD", name: "US Dollar" },
                { code: "IDR", name: "Indonesian Rupiah" },
              ]
            ).map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))}
          />
          <Field
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
        </>
      ) : null}
      {isMember && !initial.isOwner ? (
        <>
          <Body>Role</Body>
          <Choices
            value={role}
            onChange={setRole}
            options={["participant", "member", "organizer"].map((value) => ({
              value,
              label: properLabel(value),
            }))}
          />
          {initial.id ? (
            <Choices
              value={status}
              onChange={setStatus}
              options={["active", "removed"].map((value) => ({
                value,
                label: properLabel(value),
              }))}
            />
          ) : null}
        </>
      ) : null}
      {isRecurring || (isContribution && organizer) ? (
        <>
          <Body>{isRecurring ? "Assigned To" : "Contributed By"}</Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {people.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                accessibilityState={{
                  selected: isRecurring
                    ? assigned.includes(m.id)
                    : memberId === m.id,
                }}
                onPress={() =>
                  isRecurring
                    ? setAssigned((old) =>
                        old.includes(m.id)
                          ? old.filter((id) => id !== m.id)
                          : [...old, m.id],
                      )
                    : setMemberId(m.id)
                }
                style={{
                  padding: 10,
                  gap: 6,
                  alignItems: "center",
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: (
                    isRecurring ? assigned.includes(m.id) : memberId === m.id
                  )
                    ? colors.teal
                    : colors.line,
                }}
              >
                <PersonAvatar name={m.displayName} imageUrl={m.avatarUrl} />
                <Body>{m.isMe ? "Me" : m.displayName}</Body>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      {isRecurring || isBudget ? (
        <>
          <Body>Time Period</Body>
          <Choices
            value={cadence}
            onChange={(v) => {
              setCadence(v);
              if (isRecurring) setDate(suggestCircleDate(v));
            }}
            options={(isRecurring
              ? ["once", "weekly", "biweekly", "monthly", "quarterly", "annual"]
              : ["once", "weekly", "monthly", "quarterly", "annual"]
            ).map((value) => ({
              value,
              label: value === "once" ? "One-Time" : properLabel(value),
            }))}
          />
        </>
      ) : null}
      {isGoal ? <Body>Time Period</Body> : null}
      {isRecurring || isGoal || isContribution
        ? dateField(
            isContribution
              ? "Contribution Date"
              : isGoal
                ? "Target Date"
                : "Next Due Date",
            date,
            setDate,
          )
        : null}
      {isBudget && cadence === "once" ? (
        <>
          {dateField("Start Date", starts, setStarts)}
          {dateField("End Date", ends, setEnds)}
        </>
      ) : null}
      {initial.id && (isBudget || isRecurring) ? (
        <Choices
          value={active ? "active" : "paused"}
          onChange={(v) => setActive(v === "active")}
          options={[
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
          ]}
        />
      ) : null}
      {isShare ? (
        <>
          <PlanAction
            title="+ Add Transaction"
            tone="primary"
            onPress={() =>
              router.push({
                pathname: "/add-transaction",
                params: { entry: "manual", circleId },
              })
            }
          />
          <Field
            label="Search Transactions"
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <ScrollView
            nestedScrollEnabled
            style={{ maxHeight: 520 }}
            scrollEventThrottle={100}
            onScroll={(e) => {
              const n = e.nativeEvent;
              if (
                n.contentOffset.y + n.layoutMeasurement.height >=
                  n.contentSize.height - 200 &&
                !listLoading.current &&
                page * 30 < total
              )
                setPage((v) => v + 1);
            }}
          >
            {transactions.map((t) => (
              <View
                key={t.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <CategoryMark name={t.categoryName ?? "Other"} />
                <View style={{ flex: 1 }}>
                  <Body muted={false}>{t.merchantClean || t.merchantRaw}</Body>
                  <Body>{displayDate(t.date, format)}</Body>
                </View>
                <Text style={{ color: colors.ink, fontSize: 12 }}>
                  {money(t.amount, t.currency)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${t.merchantClean || t.merchantRaw}`}
                  disabled={busy || shared.includes(t.id)}
                  onPress={() => void save(t.id)}
                  style={{ padding: 10 }}
                >
                  <Text style={{ color: colors.teal, fontSize: 24 }}>
                    {shared.includes(t.id) ? "✓" : "+"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
      {!isMember && !isShare && !isRemove ? (
        <Field
          label="Note (Optional)"
          value={note}
          onChangeText={setNote}
          maxLength={240}
        />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {!isShare ? (
        <PlanAction
          title={busy ? "Saving…" : "Save"}
          tone="primary"
          disabled={busy}
          onPress={() => void save()}
        />
      ) : null}
    </Screen>
  );
}
