import { useEffect, useRef, useState } from "react";
import { useSession } from "./session";
import { Body, Card, Field, Notice, Screen, money } from "./ui";
import { PlanAction, PlanHeader } from "./plan-ui";
import { Choices } from "./transaction-entry";
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
};
export function CircleResourceEditor({
  circleId,
  currency,
  initial,
  onClose,
  onSaved,
}: {
  circleId: string;
  currency: string;
  initial: CircleAction;
  onClose: () => void;
  onSaved: () => void;
}) {
  const session = useSession();
  const [name, setName] = useState(
    initial.name ?? initial.displayName ?? initial.title ?? "",
  );
  const [amount, setAmount] = useState(
    String(initial.targetAmount ?? initial.amount ?? ""),
  );
  const [note, setNote] = useState("");
  const [role, setRole] = useState(initial.role ?? "participant");
  const [status, setStatus] = useState(initial.status ?? "active");
  const [active, setActive] = useState(initial.isActive !== false);
  const [cadence, setCadence] = useState("monthly");
  const [date, setDate] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [transactions, setTransactions] = useState<
    TransactionPage["transactions"]
  >([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lock = useRef(false);
  const live = useRef(true);
  const action = initial.action;
  const isMember = action.includes("member") || action === "add_participant";
  const isShare = action === "share_transaction";
  const isRemove = action === "unshare_transaction";
  const needsName = !isShare && !isRemove && action !== "add_contribution";
  const needsAmount = !isShare && !isRemove && !isMember;
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  useEffect(() => {
    if (!isShare) return;
    let live = true;
    setError("");
    const timer = setTimeout(() => {
      void session
        .request<TransactionPage>(
          `transactions?workspaceId=${encodeURIComponent(session.profileId)}&search=${encodeURIComponent(search)}&page=${page}&pageSize=30`,
        )
        .then((r) => {
          if (live) {
            setTransactions(
              r.transactions.filter(
                (t) => t.type === "expense" && !t.isExcluded,
              ),
            );
            setTotal(r.totalCount);
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [isShare, session.profileId, session.request, search, page]);
  const payload = () => {
    const base = { action, ...(initial.id ? { id: initial.id } : {}) };
    if (isRemove) return base;
    if (isShare) {
      if (!transactionId) throw new Error("Choose an expense to share.");
      return { ...base, transactionId, visibility: "item", note };
    }
    if (isMember)
      return {
        ...base,
        displayName: name.trim(),
        role,
        ...(action === "update_member" ? { status } : {}),
      };
    if (!(Number(amount) > 0) || !Number.isFinite(Number(amount)))
      throw new Error("Enter a positive amount.");
    if (action === "add_contribution")
      return { ...base, amount: Number(amount), currency, note };
    if (action.includes("commitment"))
      return {
        ...base,
        title: name.trim(),
        amount: Number(amount),
        ...(action === "create_commitment"
          ? { currency, recurrence: cadence, notes: note }
          : { isActive: active }),
        ...(date ? { nextDueDate: new Date(date).toISOString() } : {}),
      };
    return {
      ...base,
      name: name.trim(),
      targetAmount: Number(amount),
      ...(action.startsWith("create")
        ? {
            currency,
            ...(action.includes("budget")
              ? { cadence }
              : {
                  purpose: note,
                  ...(date ? { targetDate: new Date(date).toISOString() } : {}),
                }),
          }
        : action.includes("budget")
          ? { isActive: active }
          : { status }),
    };
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = payload();
      if (session.demo) throw new Error("Sign in to save Circle changes.");
      await session.request(
        `circles/${circleId}/resources?workspaceId=${encodeURIComponent(session.profileId)}`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (live.current) onSaved();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <Screen>
      <PlanHeader
        title={action
          .replaceAll("_", " ")
          .replace(/^./, (v) => v.toUpperCase())}
        back={() => {
          if (!busy) onClose();
        }}
      />
      {needsName ? (
        <Field
          label={isMember ? "Person’s name" : "Name"}
          value={name}
          onChangeText={(v) => {
            setName(v);
            setConfirm(false);
          }}
          maxLength={100}
        />
      ) : null}
      {needsAmount ? (
        <Field
          label={`Amount (${currency})`}
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setConfirm(false);
          }}
          keyboardType="decimal-pad"
        />
      ) : null}
      {isMember && !initial.isOwner ? (
        <>
          <Body>Role</Body>
          <Choices
            value={role}
            options={["participant", "member", "organizer"].map((value) => ({
              value,
              label: value,
            }))}
            onChange={(v) => {
              setRole(v);
              setConfirm(false);
            }}
          />
          {initial.id ? (
            <Choices
              value={status}
              options={["active", "removed"].map((value) => ({
                value,
                label: value,
              }))}
              onChange={(v) => {
                setStatus(v);
                setConfirm(false);
              }}
            />
          ) : null}
          <Body>
            Participants can view shared information. Members can contribute.
            Organizers can manage people and Circle settings.
          </Body>
        </>
      ) : null}
      {action === "create_budget" || action === "create_commitment" ? (
        <Choices
          value={cadence}
          options={["weekly", "monthly", "quarterly", "annual"].map(
            (value) => ({ value, label: value }),
          )}
          onChange={setCadence}
        />
      ) : null}
      {action === "create_goal" || action.includes("commitment") ? (
        <Field
          label="Target / next due date (YYYY-MM-DD, optional)"
          value={date}
          onChangeText={setDate}
        />
      ) : null}
      {action === "update_goal" ? (
        <Choices
          value={status}
          options={["active", "paused", "completed", "archived"].map(
            (value) => ({ value, label: value }),
          )}
          onChange={setStatus}
        />
      ) : null}
      {action === "update_budget" || action === "update_commitment" ? (
        <Choices
          value={active ? "active" : "paused"}
          options={[
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
          ]}
          onChange={(v) => setActive(v === "active")}
        />
      ) : null}
      {isShare ? (
        <>
          <Body>
            Only the selected expense is shared with this Circle. Personal
            accounts remain private.
          </Body>
          <Field
            label="Find an expense"
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          {transactions.map((t) => (
            <PlanAction
              key={t.id}
              title={`${t.merchantClean || t.merchantRaw} · ${money(t.amount, t.currency)}${t.id === transactionId ? " ✓" : ""}`}
              onPress={() => {
                setTransactionId(t.id);
                setConfirm(false);
              }}
            />
          ))}
          {page > 1 ? (
            <PlanAction
              title="Previous"
              onPress={() => setPage((v) => v - 1)}
            />
          ) : null}
          {page * 30 < total ? (
            <PlanAction
              title="More transactions"
              onPress={() => setPage((v) => v + 1)}
            />
          ) : null}
        </>
      ) : null}
      {!isMember && !isRemove ? (
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={240}
        />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {confirm ? (
        <Card>
          <Body>
            {isRemove
              ? "Stop sharing this expense? The original transaction is preserved."
              : "Apply these changes to this shared Circle? Other Circle members may see the updated information."}
          </Body>
          <PlanAction
            title="Confirm changes"
            tone={isRemove || status === "removed" ? "delete" : "primary"}
            disabled={busy}
            onPress={() => void save()}
          />
        </Card>
      ) : (
        <PlanAction
          title="Review changes"
          tone="primary"
          onPress={() => {
            try {
              payload();
              setError("");
              setConfirm(true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      )}
      <PlanAction title="Cancel" disabled={busy} onPress={onClose} />
    </Screen>
  );
}
