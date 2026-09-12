import { useEffect, useRef, useState } from "react";
import { Body, Button, Card, Field, Heading, Notice, Screen } from "./ui";
import { Choices } from "./transaction-entry";
import { useSession } from "./session";
export type Tracking = {
  version: 1;
  amountType: "fixed" | "variable";
  paymentAmount: number | null;
  totalPayments: number | null;
  paymentsMade: number;
  endDate: string | null;
  debtType: string;
  balanceDate: string | null;
  liabilityAccountId: string | null;
  interestRate: number | null;
  reminderDays: 0 | 1 | 3 | null;
  reference: string;
  monthEnd: boolean;
};
export type RecurringItem = {
  id: string;
  title: string;
  kind: string;
  amount: number | null;
  principalAmount?: string | null;
  currency: string;
  date: string | null;
  status: string;
  recurrence: string;
  accountName: string | null;
  accountId?: string | null;
  categoryName: string | null;
  notes: string | null;
  counterparty?: string | null;
  dueDate?: string | null;
  plannedPaymentDate?: string | null;
  nextDueDate?: string | null;
  tracking?: Tracking | null;
  completedDates?: string[];
};
export type Suggestion = {
  id: string;
  title: string;
  amount: string | null;
  currency: string;
  dueDate: string | null;
  recurrence: string;
  accountId: string | null;
  accountName: string | null;
  categoryName: string | null;
  notes: string | null;
  confidence: number;
  reason: string | null;
  evidenceTransactionIds: string[];
  statementCheckpointId: string | null;
};
export const recurringKinds = [
  { value: "planned_payment", label: "Planned payment" },
  { value: "debt", label: "Debt & loans" },
  { value: "receivable", label: "Money owed" },
  { value: "reminder", label: "Installments" },
];
const emptyTracking: Tracking = {
  version: 1,
  amountType: "fixed",
  paymentAmount: null,
  totalPayments: null,
  paymentsMade: 0,
  endDate: null,
  debtType: "",
  balanceDate: null,
  liabilityAccountId: null,
  interestRate: null,
  reminderDays: null,
  reference: "",
  monthEnd: false,
};
export function RecurringEditor({
  initial,
  suggestion,
  onClose,
  onSaved,
}: {
  initial: RecurringItem | null;
  suggestion?: Suggestion | null;
  onClose: () => void;
  onSaved: (item: RecurringItem) => void;
}) {
  const session = useSession();
  const original = {
    title: initial?.title ?? suggestion?.title ?? "",
    kind: initial?.kind ?? "planned_payment",
    amount: initial?.principalAmount ?? suggestion?.amount ?? "",
    currency: initial?.currency ?? suggestion?.currency ?? "PHP",
    dueDate: (initial?.dueDate ?? suggestion?.dueDate ?? "").slice(0, 10),
    plannedPaymentDate: (initial?.plannedPaymentDate ?? "").slice(0, 10),
    recurrence: initial?.recurrence ?? suggestion?.recurrence ?? "monthly",
    accountId: initial?.accountId ?? suggestion?.accountId ?? "",
    counterparty: initial?.counterparty ?? "",
    categoryName: initial?.categoryName ?? suggestion?.categoryName ?? "",
    notes: initial?.notes ?? suggestion?.notes ?? "",
    status: initial?.status ?? "active",
  };
  const [draft, setDraft] = useState(original);
  const [tracking, setTracking] = useState<Tracking>(
    initial?.tracking ?? emptyTracking,
  );
  const [trackingEnabled, setTrackingEnabled] = useState(
    Boolean(initial?.tracking),
  );
  const [accounts, setAccounts] = useState<
    { id: string; name: string; currency: string }[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!session.demo)
      void session
        .request<{ accounts: typeof accounts }>(
          `accounts?workspaceId=${encodeURIComponent(session.profileId)}`,
        )
        .then((r) => {
          if (alive.current) setAccounts(r.accounts);
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        });
    return () => {
      alive.current = false;
    };
  }, [session.demo, session.profileId, session.request]);
  const save = async () => {
    setError("");
    if (
      !draft.title.trim() ||
      !/^[A-Z]{3}$/.test(draft.currency) ||
      (draft.amount && !/^\d{1,12}(\.\d{1,2})?$/.test(draft.amount))
    )
      return setError("Enter a title, valid currency and non-negative amount.");
    for (const value of [
      draft.dueDate,
      draft.plannedPaymentDate,
      tracking.endDate,
      tracking.balanceDate,
    ].filter(Boolean)) {
      const d = new Date(`${value}T00:00:00Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value!) ||
        !Number.isFinite(+d) ||
        d.toISOString().slice(0, 10) !== value
      )
        return setError("Use valid dates in YYYY-MM-DD format.");
    }
    if (
      draft.plannedPaymentDate &&
      draft.dueDate &&
      draft.plannedPaymentDate > draft.dueDate
    )
      return setError("Planned payment must be on or before the due date.");
    if (
      draft.kind === "reminder" &&
      (!tracking.totalPayments || !draft.dueDate || draft.recurrence === "once")
    )
      return setError(
        "Installments need a due date, repeating schedule and total number of payments.",
      );
    if (
      tracking.totalPayments !== null &&
      tracking.paymentsMade > tracking.totalPayments
    )
      return setError("Payments made cannot exceed total payments.");
    for (const value of [
      tracking.paymentAmount,
      tracking.interestRate,
      tracking.totalPayments,
      tracking.paymentsMade,
    ])
      if (value !== null && (!Number.isFinite(value) || value < 0))
        return setError("Enter valid, non-negative payment details.");
    if (
      !Number.isInteger(tracking.paymentsMade) ||
      (tracking.totalPayments !== null &&
        (!Number.isInteger(tracking.totalPayments) ||
          tracking.totalPayments < 1 ||
          tracking.totalPayments > 1200))
    )
      return setError("Use whole numbers for payment counts (1–1200 total).");
    if (tracking.endDate && draft.dueDate && tracking.endDate < draft.dueDate)
      return setError("End date cannot precede the first due date.");
    const body: Record<string, unknown> = {};
    for (const key of Object.keys(draft) as (keyof typeof draft)[])
      if (!initial || draft[key] !== original[key])
        body[key] = draft[key].trim() || null;
    if (trackingEnabled || draft.kind === "reminder") {
      if (
        !initial ||
        JSON.stringify(tracking) !== JSON.stringify(initial.tracking)
      )
        body.tracking = tracking;
    }
    if (suggestion) {
      body.evidenceTransactionIds = suggestion.evidenceTransactionIds;
      body.statementCheckpointId = suggestion.statementCheckpointId;
    }
    if (initial && !Object.keys(body).length) return onClose();
    setBusy(true);
    try {
      let id = initial?.id ?? `sample-${Date.now()}`;
      if (!session.demo) {
        const r = await session.request<{ commitment: { id: string } }>(
          `recurring${initial ? `/${initial.id}` : ""}?workspaceId=${encodeURIComponent(session.profileId)}`,
          { method: initial ? "PATCH" : "POST", body: JSON.stringify(body) },
        );
        id = r.commitment.id;
      }
      if (alive.current)
        onSaved({
          ...initial,
          ...draft,
          id,
          amount: draft.amount ? Number(draft.amount) : null,
          principalAmount: draft.amount || null,
          date: draft.plannedPaymentDate || draft.dueDate || null,
          accountName:
            accounts.find((a) => a.id === draft.accountId)?.name ?? null,
          tracking:
            trackingEnabled || draft.kind === "reminder"
              ? tracking
              : initial?.tracking,
        });
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Screen>
      <Heading>
        {initial
          ? "Edit recurring"
          : suggestion
            ? "Review suggestion"
            : "Add recurring"}
      </Heading>
      {suggestion ? (
        <Notice>
          Suggested · {suggestion.confidence}% confidence. {suggestion.reason}{" "}
          Review the details before saving.
        </Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <Card>
        <Choices
          value={draft.kind}
          options={recurringKinds}
          onChange={(kind) => setDraft((d) => ({ ...d, kind }))}
        />
        {(
          [
            ["title", "Title"],
            ["counterparty", "Person or merchant"],
            [
              "amount",
              draft.kind === "debt" || draft.kind === "receivable"
                ? "Total outstanding amount"
                : "Payment amount",
            ],
            ["currency", "Currency"],
            ["dueDate", "Due date (YYYY-MM-DD)"],
            ["plannedPaymentDate", "Planned payment date (YYYY-MM-DD)"],
            ["categoryName", "Category"],
            ["notes", "Notes"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={draft[key]}
            keyboardType={key === "amount" ? "decimal-pad" : "default"}
            multiline={key === "notes"}
            onChangeText={(v) =>
              setDraft((d) => ({
                ...d,
                [key]: key === "currency" ? v.toUpperCase() : v,
              }))
            }
          />
        ))}
        <Body>Repeat</Body>
        <Choices
          value={draft.recurrence}
          options={[
            "once",
            "weekly",
            "biweekly",
            "monthly",
            "quarterly",
            "annual",
          ].map((value) => ({ value, label: value }))}
          onChange={(recurrence) => setDraft((d) => ({ ...d, recurrence }))}
        />
        <Body>Account</Body>
        <Choices
          value={draft.accountId}
          options={[
            { value: "", label: "No linked account" },
            ...accounts.map((a) => ({
              value: a.id,
              label: `${a.name} · ${a.currency}`,
            })),
          ]}
          onChange={(accountId) => setDraft((d) => ({ ...d, accountId }))}
        />
        {initial ? (
          <>
            <Body>Status</Body>
            <Choices
              value={draft.status}
              options={[
                { value: "active", label: "Open" },
                { value: "paused", label: "Paused" },
                { value: "resolved", label: "Fulfilled" },
              ]}
              onChange={(status) => setDraft((d) => ({ ...d, status }))}
            />
          </>
        ) : null}
        <Button
          title="Payment and installment details"
          secondary
          onPress={() => setTrackingEnabled(true)}
        />
        {trackingEnabled || draft.kind === "reminder" ? (
          <>
            <Choices
              value={tracking.amountType}
              options={[
                { value: "fixed", label: "Fixed amount" },
                { value: "variable", label: "Variable amount" },
              ]}
              onChange={(v) =>
                setTracking((t) => ({
                  ...t,
                  amountType: v as Tracking["amountType"],
                }))
              }
            />
            {(
              [
                ["paymentAmount", "Regular payment amount"],
                ["totalPayments", "Total payments"],
                ["paymentsMade", "Payments already made"],
                ["interestRate", "Interest rate (%)"],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={tracking[key] === null ? "" : String(tracking[key])}
                keyboardType="decimal-pad"
                onChangeText={(v) =>
                  setTracking((t) => ({
                    ...t,
                    [key]:
                      v === ""
                        ? key === "paymentsMade"
                          ? 0
                          : null
                        : Number(v),
                  }))
                }
              />
            ))}
            <Field
              label="End date (YYYY-MM-DD)"
              value={tracking.endDate ?? ""}
              onChangeText={(endDate) =>
                setTracking((t) => ({ ...t, endDate: endDate || null }))
              }
            />
            <Field
              label="Reference"
              value={tracking.reference}
              onChangeText={(reference) =>
                setTracking((t) => ({ ...t, reference }))
              }
            />
            <Choices
              value={String(tracking.reminderDays)}
              options={[
                { value: "null", label: "No reminder" },
                { value: "0", label: "On due date" },
                { value: "1", label: "1 day before" },
                { value: "3", label: "3 days before" },
              ]}
              onChange={(v) =>
                setTracking((t) => ({
                  ...t,
                  reminderDays: v === "null" ? null : (Number(v) as 0 | 1 | 3),
                }))
              }
            />
          </>
        ) : null}
        <Button
          title={busy ? "Saving…" : "Save recurring"}
          disabled={busy}
          onPress={() => void save()}
        />
        <Button title="Cancel" secondary disabled={busy} onPress={onClose} />
      </Card>
    </Screen>
  );
}
