"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import { formatSplitBillAmount, type SplitBillSerializedBill } from "@/lib/split-bill";
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
    rawPayload: bill.rawPayload,
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
  const [transferSettlementDrafts, setTransferSettlementDrafts] = useState<Record<string, string>>({});

  const selectedBill = selected?.kind === "bill" ? bills.find((bill) => bill.id === selected.id) ?? null : null;
  const selectedGroup = selected?.kind === "group" ? groups.find((group) => group.id === selected.id) ?? null : null;
  const selectedPerson = selected?.kind === "person" ? people.find((person) => person.id === selected.id) ?? null : null;
  const selectedGroupBills = selectedGroup ? getSplitBillBillsForGroup(bills, selectedGroup.id) : [];
  const selectedPersonBills = selectedPerson ? getSplitBillBillsForPerson(bills, selectedPerson.name) : [];

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
        note: mode === "full" ? "Marked fully settled" : "Manual settlement",
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
    setTransferSettlementDrafts((current) => {
      const next = { ...current };
      delete next[draftKey];
      return next;
    });
  };

  const renderTransferSettlementControls = (bill: SplitBillSerializedBill) => {
    if (bill.settlement.transfers.length === 0) {
      const recordedSettlements = formatRecordedTransferSettlements(bill);
      return (
        <div className="split-bill-detail-modal__settlement-panel split-bill-detail-modal__settlement-panel--settled">
          <strong>Fully settled</strong>
          {recordedSettlements ? <span>{recordedSettlements}</span> : null}
        </div>
      );
    }

    return (
      <div className="split-bill-detail-modal__settlement-panel">
        {bill.settlement.transfers.map((transfer) => {
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
                      <span>{formatSplitBillAmount(Number(item.amount), selectedBill.currency)}</span>
                    </div>
                  ))}
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
                <div className="split-bill-detail-modal__list">
                  {selectedGroupBills.map((bill) => (
                    <div key={bill.id} className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--split">
                      <button type="button" className="split-bill-detail-modal__list-main" onClick={() => openBill(bill.id)}>
                        <strong>{bill.title}</strong>
                        <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                        <span className="split-bill-detail-modal__row-meta">{formatPaymentContributions(bill)}</span>
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
                      {renderTransferSettlementControls(bill)}
                    </div>
                  ))}
                </div>
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
                <div className="split-bill-detail-modal__list">
                  {selectedPersonBills.map((bill) => (
                    <div key={bill.id} className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--split">
                      <button type="button" className="split-bill-detail-modal__list-main" onClick={() => openBill(bill.id)}>
                        <strong>{bill.title}</strong>
                        <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                        <span className="split-bill-detail-modal__row-meta">{formatParticipantShare(bill, selectedPerson.name)}</span>
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
                      {renderTransferSettlementControls(bill)}
                    </div>
                  ))}
                </div>
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
