"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import {
  formatSplitBillAmount,
  mergeSplitBillItemSplitMetadata,
  parseAmountValue,
  splitBillDraftFromSerializedBill,
  type SplitBillDraft,
  type SplitBillSerializedBill,
} from "@/lib/split-bill";
import type { SplitBillGroupSummary, SplitBillPersonSummary } from "@/lib/split-bill-entities";
import { getSplitBillBillsForGroup, getSplitBillBillsForPerson } from "@/lib/split-bill-view-models";

type SplitBillWorkspaceProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  people: SplitBillPersonSummary[];
  currentUserName: string;
};

type DetailSelection =
  | { kind: "bill"; id: string }
  | { kind: "group"; id: string }
  | { kind: "person"; id: string }
  | null;

type DetailTab = "overview" | "bills" | "settle" | "activity";

const getParticipantName = (bill: SplitBillSerializedBill, participantId: string) =>
  bill.participants.find((participant) => participant.id === participantId)?.name ?? "Unknown";

type SplitBillTransferRow = SplitBillSerializedBill["settlement"]["transfers"][number];

type BillEditorParticipant = {
  id: string;
  name: string;
};

type BillEditorPayment = SplitBillDraft["payments"][number];
type BillEditorItem = SplitBillDraft["items"][number];

const createSplitBillDraftId = () => globalThis.crypto?.randomUUID?.() ?? `split-bill-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const getPersonInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?"

const ensureDraftDefaults = (draft: SplitBillDraft): SplitBillDraft => {
  const next = draft.id ? draft : { ...draft, id: createSplitBillDraftId() };

  if (next.participants.length === 0) {
    next.participants = [{ id: createSplitBillDraftId(), name: "" }];
  }

  if (next.items.length === 0) {
    next.items = [{ id: createSplitBillDraftId(), description: "Total", amount: "", participantIds: [], splitMethod: "equal", allocations: [] }];
  }

  if (next.payments.length === 0) {
    next.payments = [{ id: createSplitBillDraftId(), participantId: next.participants[0]?.id ?? "", amount: "", note: "" }];
  }

  return next;
};

const buildBillEditorDraft = (bill: SplitBillSerializedBill): SplitBillDraft => ensureDraftDefaults(splitBillDraftFromSerializedBill(bill));

const getBillEditorValidationError = (
  participants: BillEditorParticipant[],
  items: BillEditorItem[],
  payments: BillEditorPayment[]
) => {
  if (participants.length === 0) {
    return "Add at least one person before saving.";
  }

  if (items.length === 0) {
    return "Add at least one item before saving.";
  }

  const participantIds = new Set(participants.map((participant) => participant.id));

  for (const [index, item] of items.entries()) {
    const itemAmount = parseAmountValue(item.amount);
    const label = item.description.trim() || `Item ${index + 1}`;

    if (itemAmount === null || itemAmount <= 0) {
      return `${label} needs an amount greater than zero.`;
    }

    if (item.participantIds.length > 0 && item.participantIds.some((participantId) => !participantIds.has(participantId))) {
      return `${label} has an invalid person selected.`;
    }
  }

  for (const payment of payments) {
    if (!participantIds.has(payment.participantId) && payment.participantId) {
      return "Every payment must be assigned to a listed person.";
    }

    const amount = parseAmountValue(payment.amount);
    if (amount === null || amount < 0) {
      return "Payments cannot be negative or invalid.";
    }
  }

  return null;
};

const getTransferDraftKey = (billId: string, transfer: SplitBillTransferRow) =>
  `${billId}:${transfer.fromParticipantId}:${transfer.toParticipantId}`;

const formatPaymentContributions = (bill: SplitBillSerializedBill) => {
  if (bill.payments.length === 0) {
    return "No payments recorded";
  }

  return bill.payments
    .map((payment) => `${getParticipantName(bill, payment.participantId)} contributed ${formatSplitBillAmount(Number(payment.amount), bill.currency)}`)
    .join(" · ");
};

const formatSettlementTransfers = (bill: SplitBillSerializedBill) => {
  if (bill.settlement.transfers.length === 0) {
    return bill.payments.length > 0 ? "No open transfers" : "No payments recorded";
  }

  return bill.settlement.transfers
    .map((transfer) => `${transfer.fromParticipantName} owes ${transfer.toParticipantName} ${formatSplitBillAmount(transfer.amount, bill.currency)}`)
    .join(" · ");
};

const formatParticipantShare = (bill: SplitBillSerializedBill, participantName: string) => {
  const participant = bill.settlement.participants.find((entry) => entry.name === participantName);
  if (!participant) {
    return "No settlement share";
  }

  return `Paid ${formatSplitBillAmount(participant.paid, bill.currency)} · Owes ${formatSplitBillAmount(participant.owed, bill.currency)}`;
};

const formatRecordedTransferSettlements = (bill: SplitBillSerializedBill) => {
  const transferSettlements = bill.transferSettlements ?? [];
  if (transferSettlements.length === 0) {
    return null;
  }

  return transferSettlements
    .map(
      (transferSettlement) =>
        `${transferSettlement.fromParticipantName} paid ${transferSettlement.toParticipantName} ${formatSplitBillAmount(Number(transferSettlement.amount), bill.currency)}`
    )
    .join(" · ");
};

const getSettlementProgress = (bill: SplitBillSerializedBill) => {
  const remaining = bill.settlement.transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  const recorded = (bill.transferSettlements ?? []).reduce((sum, transferSettlement) => sum + Number(transferSettlement.amount), 0);
  const total = remaining + recorded;

  if (total <= 0.005) {
    return {
      percent: 100,
      remaining,
      recorded,
    };
  }

  return {
    percent: Math.min(100, Math.round((recorded / total) * 100)),
    remaining,
    recorded,
  };
};

const getPersonBalanceSummary = (bills: SplitBillSerializedBill[], personName: string) => {
  const summary = bills.reduce(
    (totals, bill) => {
      for (const transfer of bill.settlement.transfers) {
        if (transfer.fromParticipantName === personName) {
          totals.owes += transfer.amount;
        }
        if (transfer.toParticipantName === personName) {
          totals.isOwed += transfer.amount;
        }
      }

      if (bill.settlement.transfers.length === 0) {
        totals.settledBills += 1;
      }

      return totals;
    },
    { owes: 0, isOwed: 0, settledBills: 0 }
  );

  return summary;
};

const buildAggregateTransfers = (bills: SplitBillSerializedBill[]) => {
  const balancesByCurrency = new Map<string, Map<string, number>>();

  for (const bill of bills) {
    const currencyBalances = balancesByCurrency.get(bill.currency) ?? new Map<string, number>();
    for (const transfer of bill.settlement.transfers) {
      currencyBalances.set(transfer.fromParticipantName, (currencyBalances.get(transfer.fromParticipantName) ?? 0) - transfer.amount);
      currencyBalances.set(transfer.toParticipantName, (currencyBalances.get(transfer.toParticipantName) ?? 0) + transfer.amount);
    }
    balancesByCurrency.set(bill.currency, currencyBalances);
  }

  return Array.from(balancesByCurrency.entries()).flatMap(([currency, balances]) => {
    const creditors = Array.from(balances.entries())
      .filter(([, balance]) => balance > 0.01)
      .map(([name, balance]) => ({ name, balance }))
      .sort((left, right) => right.balance - left.balance);
    const debtors = Array.from(balances.entries())
      .filter(([, balance]) => balance < -0.01)
      .map(([name, balance]) => ({ name, balance }))
      .sort((left, right) => left.balance - right.balance);
    const transfers: Array<{ fromName: string; toName: string; amount: number; currency: string }> = [];
    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
      const creditor = creditors[creditorIndex];
      const debtor = debtors[debtorIndex];
      const amount = Math.min(creditor.balance, Math.abs(debtor.balance));

      if (amount > 0.01) {
        transfers.push({
          fromName: debtor.name,
          toName: creditor.name,
          amount: Number(amount.toFixed(2)),
          currency,
        });
      }

      creditor.balance -= amount;
      debtor.balance += amount;

      if (creditor.balance <= 0.01) {
        creditorIndex += 1;
      }
      if (debtor.balance >= -0.01) {
        debtorIndex += 1;
      }
    }

    return transfers;
  });
};

const formatActivityTime = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const getRecentActivityForBills = (bills: SplitBillSerializedBill[]) =>
  bills
    .flatMap((bill) => (bill.activity ?? []).map((activity) => ({ ...activity, billTitle: bill.title })))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 6);

const buildBillUpdatePayload = (bill: SplitBillSerializedBill, participants: SplitBillSerializedBill["participants"]) => {
  const participantIds = new Set(participants.map((participant) => participant.id));

  return {
    transactionId: bill.transactionId,
    title: bill.title,
    note: bill.note,
    billDate: bill.billDate,
    currency: bill.currency,
    sourceType: bill.sourceType,
    groupId: bill.groupId,
    merchantName: bill.merchantName,
    receiptFileName: bill.receiptFileName,
    receiptMimeType: bill.receiptMimeType,
    receiptText: bill.receiptText,
    receiptConfidence: bill.receiptConfidence,
    subtotal: bill.subtotal,
    tax: bill.tax,
    tip: bill.tip,
    discount: bill.discount,
    total: bill.total,
    rawPayload: mergeSplitBillItemSplitMetadata(bill.rawPayload, bill.items),
    participants,
    items: bill.items.map((item) => ({
      id: item.id,
      description: item.description,
      amount: item.amount,
      participantIds: item.participantIds.filter((participantId) => participantIds.has(participantId)),
    })),
    payments: bill.payments
      .filter((payment) => participantIds.has(payment.participantId))
      .map((payment) => ({
        id: payment.id,
        participantId: payment.participantId,
        amount: payment.amount,
        note: payment.note,
      })),
  };
};

const loadFullSplitBill = async (billId: string) => {
  const response = await fetch(`/api/split-bills/${billId}`);
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { bill?: SplitBillSerializedBill };
  return payload.bill ?? null;
};

export function SplitBillWorkspace({
  bills: initialBills,
  groups: initialGroups,
  people: initialPeople,
  currentUserName,
}: SplitBillWorkspaceProps) {
  const searchParams = useSearchParams();
  const [bills, setBills] = useState(initialBills);
  const [groups, setGroups] = useState(initialGroups);
  const [people, setPeople] = useState(initialPeople);
  const [selected, setSelected] = useState<DetailSelection>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [transferSettlementDrafts, setTransferSettlementDrafts] = useState<Record<string, string>>({});
  const [transferSettlementNotes, setTransferSettlementNotes] = useState<Record<string, string>>({});
  const [selectedBillDraft, setSelectedBillDraft] = useState<SplitBillDraft | null>(null);
  const [isEditingBill, setIsEditingBill] = useState(false);
  const [billEditError, setBillEditError] = useState<string | null>(null);
  const [isSavingBillEdit, setIsSavingBillEdit] = useState(false);

  const selectedBill = selected?.kind === "bill" ? bills.find((bill) => bill.id === selected.id) ?? null : null;
  const selectedGroup = selected?.kind === "group" ? groups.find((group) => group.id === selected.id) ?? null : null;
  const selectedPerson = selected?.kind === "person" ? people.find((person) => person.id === selected.id) ?? null : null;
  const selectedGroupBills = selectedGroup ? getSplitBillBillsForGroup(bills, selectedGroup.id) : [];
  const selectedPersonBills = selectedPerson ? getSplitBillBillsForPerson(bills, selectedPerson.name) : [];
  const selectedGroupBalance = selectedGroup ? getPersonBalanceSummary(selectedGroupBills, currentUserName) : null;
  const selectedPersonBalance = selectedPerson ? getPersonBalanceSummary(selectedPersonBills, selectedPerson.name) : null;
  const selectedGroupSimplifiedTransfers = selectedGroup ? buildAggregateTransfers(selectedGroupBills) : [];
  const selectedGroupActivity = selectedGroup ? getRecentActivityForBills(selectedGroupBills) : [];
  const selectedPersonActivity = selectedPerson ? getRecentActivityForBills(selectedPersonBills) : [];

  const openBill = (billId: string) => setSelected({ kind: "bill", id: billId });
  const openGroup = (groupId: string) => setSelected({ kind: "group", id: groupId });
  const openPerson = (personId: string) => setSelected({ kind: "person", id: personId });

  const upsertPeople = (nextPeople: SplitBillPersonSummary[]) => {
    setPeople((current) => {
      const map = new Map(current.map((person) => [person.id, person] as const));
      nextPeople.forEach((person) => {
        map.set(person.id, person);
      });
      return Array.from(map.values()).sort((left, right) => right.name.localeCompare(left.name));
    });
  };

  const handleBillSaved = (bill: SplitBillSerializedBill) => {
    setBills((current) => {
      const next = current.filter((entry) => entry.id !== bill.id);
      return [bill, ...next];
    });
    setSelected({ kind: "bill", id: bill.id });
  };

  const handleGroupSaved = (group: SplitBillGroupSummary, people: SplitBillPersonSummary[] = []) => {
    setGroups((current) => {
      const next = current.filter((entry) => entry.id !== group.id);
      return [group, ...next];
    });
    upsertPeople(people);
    setSelected({ kind: "group", id: group.id });
  };

  const handlePersonSaved = (person: SplitBillPersonSummary) => {
    upsertPeople([person]);
    setSelected({ kind: "person", id: person.id });
  };

  const removeGroup = async (groupId: string) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group || !window.confirm(`Remove ${group.name}?`)) {
      return;
    }

    const response = await fetch(`/api/split-bill-groups/${groupId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return;
    }

    setGroups((current) => current.filter((entry) => entry.id !== groupId));
    if (selected?.kind === "group" && selected.id === groupId) {
      setSelected(null);
    }
  };

  const removePerson = async (personId: string) => {
    const person = people.find((entry) => entry.id === personId);
    if (!person || !window.confirm(`Remove ${person.name}?`)) {
      return;
    }

    const response = await fetch(`/api/split-bill-people/${personId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return;
    }

    setPeople((current) => current.filter((entry) => entry.id !== personId));
    if (selected?.kind === "person" && selected.id === personId) {
      setSelected(null);
    }
  };

  const removeBill = async (billId: string) => {
    const bill = bills.find((entry) => entry.id === billId);
    if (!bill || !window.confirm(`Delete ${bill.title}?`)) {
      return;
    }

    const response = await fetch(`/api/split-bills/${billId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return;
    }

    setBills((current) => current.filter((entry) => entry.id !== billId));
    if (selected?.kind === "bill" && selected.id === billId) {
      setSelected(null);
    }
  };

  const removeParticipantFromBill = async (billId: string, participantId: string) => {
    const summaryBill = bills.find((entry) => entry.id === billId);
    const participant = summaryBill?.participants.find((entry) => entry.id === participantId);
    if (!summaryBill || !participant) {
      return;
    }

    if (summaryBill.participants.length <= 1) {
      window.alert("A split bill needs at least one person.");
      return;
    }

    if (!window.confirm(`Remove ${participant.name} from ${summaryBill.title}?`)) {
      return;
    }

    const bill = await loadFullSplitBill(billId);
    if (!bill) {
      return;
    }

    const nextParticipants = bill.participants.filter((entry) => entry.id !== participantId);
    const response = await fetch(`/api/split-bills/${billId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildBillUpdatePayload(bill, nextParticipants)),
    });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { bill?: SplitBillSerializedBill };
    if (!payload.bill) {
      return;
    }

    setBills((current) => current.map((entry) => (entry.id === billId ? payload.bill! : entry)));
  };

  const recordTransferSettlementAmount = async (bill: SplitBillSerializedBill, transfer: SplitBillTransferRow, amount: number, note: string) => {
    const response = await fetch(`/api/split-bills/${bill.id}/transfer-settlements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromParticipantId: transfer.fromParticipantId,
        fromParticipantName: transfer.fromParticipantName,
        toParticipantId: transfer.toParticipantId,
        toParticipantName: transfer.toParticipantName,
        amount: amount.toFixed(2),
        note,
      }),
    });

    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { bill?: SplitBillSerializedBill };
    if (!payload.bill) {
      return;
    }

    setBills((current) => current.map((entry) => (entry.id === bill.id ? payload.bill! : entry)));
    return payload.bill;
  };

  const recordTransferSettlement = async (bill: SplitBillSerializedBill, transfer: SplitBillTransferRow, mode: "manual" | "full") => {
    const draftKey = getTransferDraftKey(bill.id, transfer);
    const draftAmount = Number(transferSettlementDrafts[draftKey]);
    const amount = mode === "full" ? transfer.amount : draftAmount;

    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("Enter a transfer amount greater than zero.");
      return;
    }

    if (amount > transfer.amount + 0.005) {
      window.alert(`This transfer only has ${formatSplitBillAmount(transfer.amount, bill.currency)} left to settle.`);
      return;
    }

    const note = transferSettlementNotes[draftKey]?.trim();
    const savedBill = await recordTransferSettlementAmount(
      bill,
      transfer,
      amount,
      note || (mode === "full" ? "Marked fully settled" : "Manual settlement")
    );
    if (!savedBill) {
      return;
    }

    setTransferSettlementDrafts((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
    setTransferSettlementNotes((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  };

  const settleAllTransfers = async (targetBills: SplitBillSerializedBill[]) => {
    for (const bill of targetBills) {
      for (const transfer of bill.settlement.transfers) {
        await recordTransferSettlementAmount(bill, transfer, transfer.amount, "Group settle all");
      }
    }
  };

  const renderTransferSettlementControls = (bill: SplitBillSerializedBill, participantName?: string) => {
    const transfers = participantName
      ? bill.settlement.transfers.filter(
          (transfer) => transfer.fromParticipantName === participantName || transfer.toParticipantName === participantName
        )
      : bill.settlement.transfers;
    const progress = getSettlementProgress(bill);

    if (transfers.length === 0) {
      const recordedSettlements = formatRecordedTransferSettlements(bill);
      return (
        <div className="split-bill-detail-modal__settlement-panel split-bill-detail-modal__settlement-panel--settled">
          <strong>{bill.settlement.transfers.length === 0 ? "No open transfers" : "No open transfer for this person"}</strong>
          {recordedSettlements && bill.settlement.transfers.length === 0 ? <span>{recordedSettlements}</span> : null}
        </div>
      );
    }

    return (
      <div className="split-bill-detail-modal__settlement-panel">
        <div className="split-bill-settlement-story">
          <div>
            <strong>{participantName ? "Settle this person's open transfers" : "Settle this bill"}</strong>
            <span>
              {progress.remaining > 0 ? `${formatSplitBillAmount(progress.remaining, bill.currency)} left` : "No open transfers"}
              {progress.recorded > 0 ? ` · ${formatSplitBillAmount(progress.recorded, bill.currency)} already recorded` : ""}
            </span>
          </div>
          <div className="split-bill-settlement-story__meter" aria-label={`${progress.percent}% settled`}>
            <span style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
        {transfers.map((transfer) => {
          const draftKey = getTransferDraftKey(bill.id, transfer);

          return (
            <div key={draftKey} className="split-bill-detail-modal__settlement-control">
              <div className="split-bill-detail-modal__settlement-copy">
                <strong>
                  {transfer.fromParticipantName} pays {transfer.toParticipantName}
                </strong>
                <span>{formatSplitBillAmount(transfer.amount, bill.currency)} remaining</span>
              </div>
              <div className="split-bill-detail-modal__settlement-actions">
                <input
                  className="split-bill-detail-modal__settlement-input"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={transferSettlementDrafts[draftKey] ?? ""}
                  onChange={(event) =>
                    setTransferSettlementDrafts((current) => ({
                      ...current,
                      [draftKey]: event.target.value,
                    }))
                  }
                />
                <input
                  className="split-bill-detail-modal__settlement-input split-bill-detail-modal__settlement-input--note"
                  type="text"
                  placeholder="Payment method or note"
                  value={transferSettlementNotes[draftKey] ?? ""}
                  onChange={(event) =>
                    setTransferSettlementNotes((current) => ({
                      ...current,
                      [draftKey]: event.target.value,
                    }))
                  }
                />
                <button className="button button-secondary button-small" type="button" onClick={() => void recordTransferSettlement(bill, transfer, "manual")}>
                  Record amount
                </button>
                <button className="button button-primary button-small" type="button" onClick={() => void recordTransferSettlement(bill, transfer, "full")}>
                  Mark settled
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const selectedDetailLabel = useMemo(() => {
    if (selectedBill) {
      return selectedBill.title;
    }
    if (selectedGroup) {
      return selectedGroup.name;
    }
    if (selectedPerson) {
      return selectedPerson.name;
    }
    return "";
  }, [selectedBill, selectedGroup, selectedPerson]);

  const selectedDetailKind = selected?.kind ?? null;
  const closeDetail = () => setSelected(null);

  useEffect(() => {
    setDetailTab("overview");
  }, [selected?.kind, selected?.id]);

  useEffect(() => {
    if (!selectedBill) {
      setSelectedBillDraft(null);
      setIsEditingBill(false);
      setBillEditError(null);
      setIsSavingBillEdit(false);
      return;
    }

    const draft = buildBillEditorDraft(selectedBill);
    const normalizedCurrentUserName = currentUserName.trim().toLowerCase();
    if (normalizedCurrentUserName && !draft.participants.some((participant) => participant.name.trim().toLowerCase() === normalizedCurrentUserName)) {
      draft.participants = [...draft.participants, { id: createSplitBillDraftId(), name: currentUserName.trim() }];
    }

    setSelectedBillDraft(draft);
    setIsEditingBill(false);
    setBillEditError(null);
    setIsSavingBillEdit(false);
  }, [currentUserName, selectedBill]);

  useEffect(() => {
    const billId = searchParams.get("bill");
    if (!billId || selected?.kind === "bill") {
      return;
    }

    const bill = bills.find((entry) => entry.id === billId);
    if (!bill) {
      return;
    }

    setSelected({ kind: "bill", id: billId });
  }, [bills, searchParams, selected?.kind]);

  const billEditorParticipants = selectedBillDraft?.participants ?? [];
  const billEditorItems = selectedBillDraft?.items ?? [];
  const billEditorPayments = selectedBillDraft?.payments ?? [];

  const updateSelectedBillDraft = (updater: (draft: SplitBillDraft) => SplitBillDraft) => {
    setSelectedBillDraft((current) => {
      if (!current) {
        return current;
      }

      return ensureDraftDefaults(updater({ ...current }));
    });
  };

  const startEditingSelectedBill = () => {
    setIsEditingBill(true);
    setBillEditError(null);
  };

  const cancelEditingSelectedBill = () => {
    if (!selectedBill) {
      setIsEditingBill(false);
      setSelectedBillDraft(null);
      return;
    }

    setSelectedBillDraft(buildBillEditorDraft(selectedBill));
    setIsEditingBill(false);
    setBillEditError(null);
  };

  const addBillEditorParticipant = () => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      participants: [...draft.participants, { id: createSplitBillDraftId(), name: "" }],
    }));
  };

  const updateBillEditorParticipant = (participantId: string, value: string) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      participants: draft.participants.map((participant) => (participant.id === participantId ? { ...participant, name: value } : participant)),
    }));
  };

  const removeBillEditorParticipant = (participantId: string) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      participants: draft.participants.filter((participant) => participant.id !== participantId),
      items: draft.items.map((item) => ({
        ...item,
        participantIds: item.participantIds.filter((id) => id !== participantId),
      })),
      payments: draft.payments.filter((payment) => payment.participantId !== participantId),
    }));
  };

  const addBillEditorPayment = () => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      payments: [...draft.payments, { id: createSplitBillDraftId(), participantId: draft.participants[0]?.id ?? "", amount: "", note: "" }],
    }));
  };

  const updateBillEditorPayment = (paymentId: string, patch: Partial<BillEditorPayment>) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      payments: draft.payments.map((payment) => (payment.id === paymentId ? { ...payment, ...patch } : payment)),
    }));
  };

  const removeBillEditorPayment = (paymentId: string) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      payments: draft.payments.filter((payment) => payment.id !== paymentId),
    }));
  };

  const addBillEditorItem = () => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      items: [
        ...draft.items,
        {
          id: createSplitBillDraftId(),
          description: "",
          amount: "",
          participantIds: [],
          splitMethod: "equal",
          allocations: [],
        },
      ],
    }));
  };

  const updateBillEditorItem = (itemId: string, patch: Partial<BillEditorItem>) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      items: draft.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  };

  const toggleBillEditorItemParticipant = (itemId: string, participantId: string) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      items: draft.items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const participantIds = item.participantIds.includes(participantId)
          ? item.participantIds.filter((id) => id !== participantId)
          : [...item.participantIds, participantId];

        return {
          ...item,
          participantIds,
        };
      }),
    }));
  };

  const removeBillEditorItem = (itemId: string) => {
    updateSelectedBillDraft((draft) => ({
      ...draft,
      items: draft.items.filter((item) => item.id !== itemId),
    }));
  };

  const saveSelectedBillDraft = async () => {
    if (!selectedBill || !selectedBillDraft) {
      return;
    }

    const participants = billEditorParticipants
      .filter((participant) => participant.name.trim())
      .map((participant) => ({
      id: participant.id,
      name: participant.name.trim(),
    }));
    const items = billEditorItems
      .filter((item) => item.description.trim() || item.amount.trim())
      .map((item) => ({
      id: item.id,
      description: item.description.trim(),
      amount: item.amount,
      participantIds: item.participantIds.filter((participantId) => participants.some((participant) => participant.id === participantId)),
      splitMethod: item.splitMethod ?? "equal",
      allocations: item.allocations ?? [],
    }));
    const payments = billEditorPayments
      .filter((payment) => payment.participantId && payment.amount.trim())
      .map((payment) => ({
        id: payment.id,
        participantId: payment.participantId,
        amount: payment.amount,
        note: payment.note?.trim() || null,
      }));
    const validationError = getBillEditorValidationError(participants, items, payments);

    if (validationError) {
      setBillEditError(validationError);
      return;
    }

    setIsSavingBillEdit(true);
    setBillEditError(null);

    try {
      const response = await fetch(`/api/split-bills/${selectedBill.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionId: selectedBill.transactionId,
          title: selectedBillDraft.title.trim(),
          note: selectedBillDraft.note?.trim() || null,
          billDate: selectedBillDraft.billDate,
          currency: selectedBillDraft.currency,
          sourceType: selectedBillDraft.sourceType,
          groupId: selectedBillDraft.groupId || null,
          merchantName: selectedBillDraft.merchantName?.trim() || null,
          receiptFileName: selectedBillDraft.receiptFileName?.trim() || null,
          receiptMimeType: selectedBillDraft.receiptMimeType?.trim() || null,
          receiptText: selectedBillDraft.receiptText?.trim() || null,
          receiptConfidence: selectedBillDraft.receiptConfidence ?? 0,
          subtotal: selectedBillDraft.subtotal?.trim() || null,
          tax: selectedBillDraft.tax?.trim() || null,
          tip: selectedBillDraft.tip?.trim() || null,
          discount: selectedBillDraft.discount?.trim() || null,
          total: selectedBillDraft.total?.trim() || null,
          rawPayload: mergeSplitBillItemSplitMetadata(selectedBillDraft.rawPayload, items),
          participants,
          items,
          payments,
        }),
      });

      const payload = (await response.json()) as { bill?: SplitBillSerializedBill; error?: string };
      if (!response.ok || !payload.bill) {
        throw new Error(payload.error ?? "Unable to save split bill");
      }

      setBills((current) => current.map((entry) => (entry.id === selectedBill.id ? payload.bill! : entry)));
      setSelectedBillDraft(buildBillEditorDraft(payload.bill));
      setIsEditingBill(false);
      setSelected({ kind: "bill", id: payload.bill.id });
    } catch (error) {
      setBillEditError(error instanceof Error ? error.message : "Unable to save split bill");
    } finally {
      setIsSavingBillEdit(false);
    }
  };

  const renderDetailTabs = () => {
    if (!selectedGroup && !selectedPerson) {
      return null;
    }

    const tabs: Array<{ id: DetailTab; label: string }> = [
      { id: "overview", label: "Overview" },
      { id: "bills", label: "Bills" },
      { id: "settle", label: "Settle" },
      { id: "activity", label: "Activity" },
    ];

    return (
      <div className="split-bill-detail-tabs" role="tablist" aria-label={`${selectedDetailLabel} sections`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`split-bill-detail-tabs__button${detailTab === tab.id ? " is-selected" : ""}`}
            type="button"
            role="tab"
            aria-selected={detailTab === tab.id}
            onClick={() => setDetailTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  const renderActivityList = (activities: ReturnType<typeof getRecentActivityForBills>, emptyLabel = "No activity yet") => (
    <div className="split-bill-activity">
      <div className="split-bill-activity__head">
        <strong>Recent activity</strong>
        <span>{activities.length} updates</span>
      </div>
      {activities.length > 0 ? (
        activities.map((activity) => (
          <div key={activity.id} className="split-bill-activity__row">
            <span>
              {activity.billTitle}: {activity.message}
            </span>
            <small>{formatActivityTime(activity.createdAt)}</small>
          </div>
        ))
      ) : (
        <span className="split-bill-subtle-empty">{emptyLabel}</span>
      )}
    </div>
  );

  const renderBillRows = (targetBills: SplitBillSerializedBill[], participantName?: string) => (
    <div className="split-bill-detail-modal__list">
      {targetBills.length > 0 ? (
        targetBills.map((bill) => (
          <div key={bill.id} className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--split">
            <button type="button" className="split-bill-detail-modal__list-main" onClick={() => openBill(bill.id)}>
              <strong>{bill.title}</strong>
              <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
              <span className="split-bill-detail-modal__row-meta">
                {participantName ? formatParticipantShare(bill, participantName) : formatPaymentContributions(bill)}
              </span>
              <span className="split-bill-detail-modal__row-meta">{formatSettlementTransfers(bill)}</span>
            </button>
            <div className="split-bill-detail-modal__row-actions">
              <button className="button button-secondary button-small" type="button" onClick={() => openBill(bill.id)}>
                Open
              </button>
              <button className="button button-danger button-small" type="button" onClick={() => void removeBill(bill.id)}>
                Delete
              </button>
            </div>
          </div>
        ))
      ) : (
        <p className="split-bill-detail-modal__empty">No bills here yet.</p>
      )}
    </div>
  );

  const renderSettlementBoard = (targetBills: SplitBillSerializedBill[], participantName?: string) => {
    const openBills = targetBills.filter((bill) =>
      participantName
        ? bill.settlement.transfers.some(
            (transfer) => transfer.fromParticipantName === participantName || transfer.toParticipantName === participantName
          )
        : bill.settlement.transfers.length > 0
    );

    return (
      <div className="split-bill-settlement-board">
        <div className="split-bill-settlement-board__head">
          <div>
            <strong>{participantName ? `${participantName}'s settlement view` : "Settle all view"}</strong>
            <span>
              {openBills.length > 0
                ? `${openBills.length} bill${openBills.length === 1 ? "" : "s"} with open transfers`
                : "No open settlement work right now."}
            </span>
          </div>
          {!participantName ? (
            <button
              className="button button-primary button-small"
              type="button"
              disabled={openBills.length === 0}
              onClick={() => void settleAllTransfers(targetBills)}
            >
              Mark group settled
            </button>
          ) : null}
        </div>

        {!participantName ? (
          <div className="split-bill-settle-all">
            <div>
              <strong>Simplified transfers</strong>
              {selectedGroupSimplifiedTransfers.length > 0 ? (
                selectedGroupSimplifiedTransfers.map((transfer) => (
                  <span key={`${transfer.currency}-${transfer.fromName}-${transfer.toName}`}>
                    {transfer.fromName} pays {transfer.toName} {formatSplitBillAmount(transfer.amount, transfer.currency)}
                  </span>
                ))
              ) : (
                <span>No group settlement needed.</span>
              )}
            </div>
          </div>
        ) : null}

        <div className="split-bill-settlement-board__list">
          {targetBills.length > 0 ? (
            targetBills.map((bill) => (
              <article key={bill.id} className="split-bill-settlement-board__bill">
                <div className="split-bill-settlement-board__bill-head">
                  <div>
                    <strong>{bill.title}</strong>
                    <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                  </div>
                  <button className="button button-secondary button-small" type="button" onClick={() => openBill(bill.id)}>
                    Open
                  </button>
                </div>
                {renderTransferSettlementControls(bill, participantName)}
              </article>
            ))
          ) : (
            <p className="split-bill-detail-modal__empty">No bills to settle yet.</p>
          )}
        </div>
      </div>
    );
  };

  const renderBillItemsTable = (bill: SplitBillSerializedBill, editable: boolean) => {
    const participants = editable
      ? billEditorParticipants
      : bill.participants;
    const items = editable
      ? billEditorItems
      : bill.items;

    return (
      <div className="split-bill-detail-modal__table-wrap">
        <table className="split-bill-detail-modal__items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="split-bill-detail-modal__amount-col">Amount</th>
              {participants.map((participant) => (
                <th key={participant.id} title={participant.name}>
                  {getPersonInitials(participant.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {editable ? (
                      <div className="split-bill-detail-modal__item-fields">
                        <input
                          className="settings-input"
                          value={item.description}
                          onChange={(event) => updateBillEditorItem(item.id, { description: event.target.value })}
                          placeholder="Item description"
                        />
                        <button className="button button-secondary button-small" type="button" onClick={() => removeBillEditorItem(item.id)}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <strong>{item.description}</strong>
                    )}
                  </td>
                  <td className="split-bill-detail-modal__amount-col">
                    {editable ? (
                      <input
                        className="settings-input"
                        value={item.amount}
                        onChange={(event) => updateBillEditorItem(item.id, { amount: event.target.value })}
                        placeholder="Amount"
                      />
                    ) : (
                      formatSplitBillAmount(Number(item.amount), bill.currency)
                    )}
                  </td>
                  {participants.map((participant) => {
                    const checked = item.participantIds.includes(participant.id);
                    return (
                      <td key={participant.id} className="split-bill-detail-modal__check-cell">
                        {editable ? (
                          <label className="split-bill-detail-modal__check-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleBillEditorItemParticipant(item.id, participant.id)}
                              aria-label={`${item.description || "Item"} for ${participant.name}`}
                            />
                          </label>
                        ) : (
                          <span className={`split-bill-detail-modal__checkmark${checked ? " is-checked" : ""}`}>{checked ? "✓" : ""}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2 + participants.length} className="split-bill-detail-modal__table-empty">
                  No line items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  useEffect(() => {
    const createdBill = sessionStorage.getItem("split-bill:created-bill");
    if (!createdBill) {
      return;
    }

    try {
      const bill = JSON.parse(createdBill) as SplitBillSerializedBill;
      setBills((current) => {
        const next = current.filter((entry) => entry.id !== bill.id);
        return [bill, ...next];
      });
    } catch {
      // ignore malformed state
    } finally {
      sessionStorage.removeItem("split-bill:created-bill");
    }
  }, []);

  return (
    <CloverShell
      active="split-bill"
      title="Split Bill"
      actions={
        <SplitBillPageActions
          currentUserName={currentUserName}
          people={people}
          groups={groups}
          onBillSaved={handleBillSaved}
          onGroupSaved={handleGroupSaved}
          onPersonSaved={handlePersonSaved}
        />
      }
    >
      <SplitBillHome
        bills={bills}
        groups={groups}
        people={people}
        currentUserName={currentUserName}
        onOpenBill={openBill}
        onOpenGroup={openGroup}
        onOpenPerson={openPerson}
      />

      {selected ? (
        <div className="split-bill-modal" role="presentation" onClick={closeDetail}>
          <section className="split-bill-modal__card glass split-bill-detail-modal" role="dialog" aria-modal="true" aria-label={selectedDetailLabel} onClick={(event) => event.stopPropagation()}>
            <div className="split-bill-manual-modal__head">
              <div>
                <p className="eyebrow">
                  {selectedDetailKind === "bill" ? "Bill details" : selectedDetailKind === "group" ? "Group details" : "Person details"}
                </p>
                <h3>{selectedDetailLabel}</h3>
              </div>
              <button className="split-bill-icon-button" type="button" onClick={closeDetail} aria-label="Close details">
                ×
              </button>
            </div>

            {selectedBill ? (
              <div className="split-bill-detail-modal__body">
                <div className="split-bill-detail-modal__summary">
                  <span>Total</span>
                  <strong>{selectedBill.total ? formatSplitBillAmount(Number(selectedBill.total), selectedBill.currency) : "No total"}</strong>
                  <span className="split-bill-detail-modal__summary-status">
                    {selectedBill.settlement.transfers.length === 0
                      ? selectedBill.payments.length > 0
                        ? "No open transfers"
                        : "Awaiting allocation"
                      : `${selectedBill.settlement.transfers.length} open transfer${selectedBill.settlement.transfers.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="split-bill-detail-modal__summary-actions">
                  {isEditingBill ? (
                    <>
                      <button className="button button-primary button-small" type="button" onClick={() => void saveSelectedBillDraft()} disabled={isSavingBillEdit}>
                        {isSavingBillEdit ? "Saving..." : "Save changes"}
                      </button>
                      <button className="button button-secondary button-small" type="button" onClick={cancelEditingSelectedBill}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button className="button button-secondary button-small" type="button" onClick={startEditingSelectedBill}>
                      Edit bill
                    </button>
                  )}
                </div>
                {isEditingBill && selectedBillDraft ? (
                  <>
                    <div className="split-bill-detail-modal__editor-grid">
                      <label className="settings-field">
                        <span>Title</span>
                        <input
                          className="settings-input"
                          value={selectedBillDraft.title}
                          onChange={(event) => setSelectedBillDraft((current) => (current ? { ...current, title: event.target.value } : current))}
                        />
                      </label>
                      <label className="settings-field">
                        <span>Date</span>
                        <input
                          className="settings-input"
                          type="date"
                          value={selectedBillDraft.billDate}
                          onChange={(event) => setSelectedBillDraft((current) => (current ? { ...current, billDate: event.target.value } : current))}
                        />
                      </label>
                      <label className="settings-field">
                        <span>Currency</span>
                        <input
                          className="settings-input"
                          value={selectedBillDraft.currency}
                          onChange={(event) =>
                            setSelectedBillDraft((current) => (current ? { ...current, currency: event.target.value.toUpperCase() } : current))
                          }
                        />
                      </label>
                      <label className="settings-field">
                        <span>Group</span>
                        <select
                          className="settings-input"
                          value={selectedBillDraft.groupId ?? ""}
                          onChange={(event) => setSelectedBillDraft((current) => (current ? { ...current, groupId: event.target.value } : current))}
                        >
                          <option value="">Ad hoc people</option>
                          {groups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="settings-field">
                        <span>Merchant</span>
                        <input
                          className="settings-input"
                          value={selectedBillDraft.merchantName ?? ""}
                          onChange={(event) => setSelectedBillDraft((current) => (current ? { ...current, merchantName: event.target.value } : current))}
                        />
                      </label>
                      <label className="settings-field">
                        <span>Note</span>
                        <textarea
                          className="settings-input split-bill-editor__textarea"
                          value={selectedBillDraft.note ?? ""}
                          onChange={(event) => setSelectedBillDraft((current) => (current ? { ...current, note: event.target.value } : current))}
                        />
                      </label>
                    </div>

                    <div className="split-bill-detail-modal__section-head">
                      <strong>People</strong>
                      <button className="button button-secondary button-small" type="button" onClick={addBillEditorParticipant}>
                        Add person
                      </button>
                    </div>
                    <div className="split-bill-detail-modal__stack">
                      {billEditorParticipants.map((participant) => (
                        <div key={participant.id} className="split-bill-detail-modal__edit-row">
                          <input
                            className="settings-input"
                            value={participant.name}
                            onChange={(event) => updateBillEditorParticipant(participant.id, event.target.value)}
                            placeholder="Person name"
                          />
                          <button className="button button-secondary button-small" type="button" onClick={() => removeBillEditorParticipant(participant.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="split-bill-detail-modal__section-head">
                      <strong>Payments</strong>
                      <button className="button button-secondary button-small" type="button" onClick={addBillEditorPayment}>
                        Add payment
                      </button>
                    </div>
                    <div className="split-bill-detail-modal__stack">
                      {billEditorPayments.map((payment) => (
                        <div key={payment.id} className="split-bill-detail-modal__edit-payment">
                          <select
                            className="settings-input"
                            value={payment.participantId}
                            onChange={(event) => updateBillEditorPayment(payment.id, { participantId: event.target.value })}
                          >
                            <option value="">Select payer</option>
                            {billEditorParticipants.map((participant) => (
                              <option key={participant.id} value={participant.id}>
                                {participant.name}
                              </option>
                            ))}
                          </select>
                          <input
                            className="settings-input"
                            value={payment.amount}
                            onChange={(event) => updateBillEditorPayment(payment.id, { amount: event.target.value })}
                            placeholder="Amount"
                          />
                          <input
                            className="settings-input"
                            value={payment.note ?? ""}
                            onChange={(event) => updateBillEditorPayment(payment.id, { note: event.target.value })}
                            placeholder="Note"
                          />
                          <button className="button button-secondary button-small" type="button" onClick={() => removeBillEditorPayment(payment.id)}>
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="split-bill-detail-modal__section-head">
                      <strong>Line items</strong>
                      <button className="button button-secondary button-small" type="button" onClick={addBillEditorItem}>
                        Add line item
                      </button>
                    </div>
                    {renderBillItemsTable(selectedBill, true)}

                    {billEditError ? <p className="split-bill-editor__error">{billEditError}</p> : null}
                  </>
                ) : (
                  <>
                    <div className="split-bill-detail-modal__chips">
                      {selectedBill.participants.map((participant) => (
                        <span key={participant.id} className="split-bill-table__chip split-bill-table__chip--editable">
                          {participant.name}
                          <button
                            className="split-bill-table__chip-remove"
                            type="button"
                            aria-label={`Remove ${participant.name}`}
                            onClick={() => void removeParticipantFromBill(selectedBill.id, participant.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="split-bill-detail-modal__list">
                      <div className="split-bill-detail-modal__list-row">
                        <strong>Contributions</strong>
                        <span>{formatPaymentContributions(selectedBill)}</span>
                      </div>
                      <div className="split-bill-detail-modal__list-row">
                        <strong>Settlement</strong>
                        <span>{formatSettlementTransfers(selectedBill)}</span>
                      </div>
                    </div>
                    {renderBillItemsTable(selectedBill, false)}
                    <div className="split-bill-activity">
                      <strong>Activity</strong>
                      {(selectedBill.activity ?? []).length > 0 ? (
                        (selectedBill.activity ?? []).slice(0, 6).map((activity) => (
                          <div key={activity.id} className="split-bill-activity__row">
                            <span>{activity.message}</span>
                            <small>{formatActivityTime(activity.createdAt)}</small>
                          </div>
                        ))
                      ) : (
                        <span className="split-bill-subtle-empty">No activity yet</span>
                      )}
                    </div>
                    <div className="split-bill-detail-modal__actions">
                      <button className="button button-danger button-small" type="button" onClick={() => void removeBill(selectedBill.id)}>
                        Delete bill
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            {selectedGroup ? (
              <div className="split-bill-detail-modal__body">
                <div className="split-bill-detail-modal__identity">
                  <SplitBillEntityAvatar name={selectedGroup.name} avatarUrl={selectedGroup.avatarUrl} sizeClass="split-bill-person-avatar--medium" />
                  <div>
                    <strong>{selectedGroup.name}</strong>
                  </div>
                </div>
                {renderDetailTabs()}
                {detailTab === "overview" ? (
                  <>
                    <div className="split-bill-balance-dashboard">
                      <article>
                        <span>You owe</span>
                        <strong>{formatSplitBillAmount(selectedGroupBalance?.owes ?? 0, selectedGroupBills[0]?.currency ?? "PHP")}</strong>
                      </article>
                      <article>
                        <span>You are owed</span>
                        <strong>{formatSplitBillAmount(selectedGroupBalance?.isOwed ?? 0, selectedGroupBills[0]?.currency ?? "PHP")}</strong>
                      </article>
                      <article>
                        <span>Settled</span>
                        <strong>{selectedGroupBalance?.settledBills ?? 0}/{selectedGroupBills.length}</strong>
                      </article>
                    </div>
                    <div className="split-bill-detail-modal__quick-summary">
                      <strong>Next best action</strong>
                      <span>
                        {selectedGroupSimplifiedTransfers.length > 0
                          ? `${selectedGroupSimplifiedTransfers[0].fromName} pays ${selectedGroupSimplifiedTransfers[0].toName} ${formatSplitBillAmount(selectedGroupSimplifiedTransfers[0].amount, selectedGroupSimplifiedTransfers[0].currency)}`
                          : "This group is settled."}
                      </span>
                    </div>
                  </>
                ) : null}
                {detailTab === "bills" ? renderBillRows(selectedGroupBills) : null}
                {detailTab === "settle" ? renderSettlementBoard(selectedGroupBills) : null}
                {detailTab === "activity" ? renderActivityList(selectedGroupActivity) : null}
                <div className="split-bill-detail-modal__actions">
                  <button className="button button-danger button-small" type="button" onClick={() => void removeGroup(selectedGroup.id)}>
                    Delete group
                  </button>
                </div>
              </div>
            ) : null}

            {selectedPerson ? (
              <div className="split-bill-detail-modal__body">
                <div className="split-bill-detail-modal__identity">
                  <SplitBillEntityAvatar name={selectedPerson.name} avatarUrl={selectedPerson.avatarUrl} sizeClass="split-bill-person-avatar--medium" />
                  <div>
                    <strong>{selectedPerson.name}</strong>
                  </div>
                </div>
                {renderDetailTabs()}
                {detailTab === "overview" ? (
                  <div className="split-bill-balance-dashboard">
                    <article>
                      <span>They owe</span>
                      <strong>{formatSplitBillAmount(selectedPersonBalance?.owes ?? 0, selectedPersonBills[0]?.currency ?? "PHP")}</strong>
                    </article>
                    <article>
                      <span>They are owed</span>
                      <strong>{formatSplitBillAmount(selectedPersonBalance?.isOwed ?? 0, selectedPersonBills[0]?.currency ?? "PHP")}</strong>
                    </article>
                    <article>
                      <span>Settled</span>
                      <strong>{selectedPersonBalance?.settledBills ?? 0}/{selectedPersonBills.length}</strong>
                    </article>
                  </div>
                ) : null}
                {detailTab === "bills" ? renderBillRows(selectedPersonBills, selectedPerson.name) : null}
                {detailTab === "settle" ? renderSettlementBoard(selectedPersonBills, selectedPerson.name) : null}
                {detailTab === "activity" ? renderActivityList(selectedPersonActivity) : null}
                <div className="split-bill-detail-modal__actions">
                  <button className="button button-danger button-small" type="button" onClick={() => void removePerson(selectedPerson.id)}>
                    Delete person
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </CloverShell>
  );
}
