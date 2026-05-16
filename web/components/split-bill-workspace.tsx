"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import { formatSplitBillAmount, mergeSplitBillItemSplitMetadata, type SplitBillSerializedBill } from "@/lib/split-bill";
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
    return "Fully settled";
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
  const [bills, setBills] = useState(initialBills);
  const [groups, setGroups] = useState(initialGroups);
  const [people, setPeople] = useState(initialPeople);
  const [selected, setSelected] = useState<DetailSelection>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [transferSettlementDrafts, setTransferSettlementDrafts] = useState<Record<string, string>>({});
  const [transferSettlementNotes, setTransferSettlementNotes] = useState<Record<string, string>>({});

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

    if (transfers.length === 0) {
      const recordedSettlements = formatRecordedTransferSettlements(bill);
      return (
        <div className="split-bill-detail-modal__settlement-panel split-bill-detail-modal__settlement-panel--settled">
          <strong>{bill.settlement.transfers.length === 0 ? "Fully settled" : "No open transfer for this person"}</strong>
          {recordedSettlements && bill.settlement.transfers.length === 0 ? <span>{recordedSettlements}</span> : null}
        </div>
      );
    }

    return (
      <div className="split-bill-detail-modal__settlement-panel">
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
              <Link className="button button-secondary button-small" href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                Edit split
              </Link>
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
                  <Link className="button button-secondary button-small" href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                    Edit split
                  </Link>
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
      <SplitBillHome bills={bills} groups={groups} people={people} onOpenBill={openBill} onOpenGroup={openGroup} onOpenPerson={openPerson} />

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
                </div>
                <div className="split-bill-detail-modal__chips">
                  {selectedBill.participants.map((participant) => (
                    <span key={participant.id} className="split-bill-table__chip split-bill-table__chip--editable">
                      {participant.name}
                      <button className="split-bill-table__chip-remove" type="button" aria-label={`Remove ${participant.name}`} onClick={() => void removeParticipantFromBill(selectedBill.id, participant.id)}>
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
                <div className="split-bill-detail-modal__list">
                  {selectedBill.items.map((item) => (
                    <div key={item.id} className="split-bill-detail-modal__list-row">
                      <strong>{item.description}</strong>
                      <span>
                        {formatSplitBillAmount(Number(item.amount), selectedBill.currency)}
                        {item.splitMethod && item.splitMethod !== "equal" ? ` · ${item.splitMethod}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
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
                  <Link className="button button-secondary button-small" href={`/split-bill/${selectedBill.id}/edit`} prefetch={false}>
                    Edit people, payments, and line items
                  </Link>
                </div>
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
