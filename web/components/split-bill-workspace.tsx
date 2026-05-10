"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import { formatSplitBillAmount, normalizeCurrencyCode, type SplitBillSerializedBill } from "@/lib/split-bill";
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

const buildSummaryTotal = (bills: SplitBillSerializedBill[]) => {
  const currencies = Array.from(new Set(bills.map((bill) => normalizeCurrencyCode(bill.currency))));
  if (currencies.length === 0) {
    return "No total";
  }

  if (currencies.length === 1) {
    return formatSplitBillAmount(
      bills.reduce((sum, bill) => sum + (bill.total ? Number(bill.total) || 0 : 0), 0),
      currencies[0]
    );
  }

  return "Mixed";
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
                  <span>{selectedBill.billDate}</span>
                  <span>{selectedBill.settlement.transfers.length === 0 ? "Settled" : `${selectedBill.settlement.transfers.length} transfer${selectedBill.settlement.transfers.length === 1 ? "" : "s"}`}</span>
                </div>
                <div className="split-bill-detail-modal__chips">
                  {selectedBill.participants.map((participant) => (
                    <span key={participant.id} className="split-bill-table__chip">
                      {participant.name}
                    </span>
                  ))}
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
                    Edit bill
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
                    <p>Groups use initials only now, keeping the same look everywhere.</p>
                  </div>
                </div>
                <div className="split-bill-detail-modal__summary-grid">
                  <article>
                    <span>People</span>
                    <strong>{selectedGroup.members.length}</strong>
                  </article>
                  <article>
                    <span>Bills</span>
                    <strong>{selectedGroupBills.length}</strong>
                  </article>
                  <article>
                    <span>Total</span>
                    <strong>{buildSummaryTotal(selectedGroupBills)}</strong>
                  </article>
                </div>
                <div className="split-bill-detail-modal__chips">
                  {selectedGroup.members.length > 0 ? (
                    selectedGroup.members.map((member) => (
                      <span key={member.id} className="split-bill-table__chip">
                        {member.name}
                      </span>
                    ))
                  ) : (
                    <span className="split-bill-subtle-empty">No people yet</span>
                  )}
                </div>
                <div className="split-bill-detail-modal__list">
                  {selectedGroupBills.map((bill) => (
                    <div key={bill.id} className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--split">
                      <button type="button" className="split-bill-detail-modal__list-main" onClick={() => openBill(bill.id)}>
                        <strong>{bill.title}</strong>
                        <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                      </button>
                      <button className="button button-danger button-small" type="button" onClick={() => void removeBill(bill.id)}>
                        Delete
                      </button>
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
                    <p>People use initials only now, so every view stays consistent.</p>
                  </div>
                </div>
                <div className="split-bill-detail-modal__summary-grid">
                  <article>
                    <span>Bills</span>
                    <strong>{selectedPersonBills.length}</strong>
                  </article>
                  <article>
                    <span>Lookup</span>
                    <strong>By saved name</strong>
                  </article>
                  <article>
                    <span>Format</span>
                    <strong>Initials only</strong>
                  </article>
                </div>
                <div className="split-bill-detail-modal__list">
                  {selectedPersonBills.map((bill) => (
                    <div key={bill.id} className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--split">
                      <button type="button" className="split-bill-detail-modal__list-main" onClick={() => openBill(bill.id)}>
                        <strong>{bill.title}</strong>
                        <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                        <span className="split-bill-detail-modal__row-meta">{bill.settlement.transfers.length === 0 ? "Settled" : `${bill.settlement.transfers.length} transfer${bill.settlement.transfers.length === 1 ? "" : "s"}`}</span>
                      </button>
                      <button className="button button-danger button-small" type="button" onClick={() => void removeBill(bill.id)}>
                        Delete
                      </button>
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
