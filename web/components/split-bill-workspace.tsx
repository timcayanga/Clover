"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillHome } from "@/components/split-bill-home";
import { SplitBillPageActions } from "@/components/split-bill-page-actions";
import { formatSplitBillAmount, normalizeCurrencyCode, type SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillGroupSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillPersonSummary = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

type SplitBillWorkspaceProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  people: SplitBillPersonSummary[];
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

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
    reader.readAsDataURL(file);
  });

export function SplitBillWorkspace({ bills: initialBills, groups: initialGroups, people: initialPeople }: SplitBillWorkspaceProps) {
  const [bills, setBills] = useState(initialBills);
  const [groups, setGroups] = useState(initialGroups);
  const [people, setPeople] = useState(initialPeople);
  const [selected, setSelected] = useState<DetailSelection>(null);

  const selectedBill = selected?.kind === "bill" ? bills.find((bill) => bill.id === selected.id) ?? null : null;
  const selectedGroup = selected?.kind === "group" ? groups.find((group) => group.id === selected.id) ?? null : null;
  const selectedPerson = selected?.kind === "person" ? people.find((person) => person.id === selected.id) ?? null : null;

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

  const handleGroupSaved = (group: SplitBillGroupSummary) => {
    setGroups((current) => {
      const next = current.filter((entry) => entry.id !== group.id);
      return [group, ...next];
    });
    upsertPeople(
      group.members.map((member) => ({
        id: member.id,
        name: member.name,
        avatarUrl: null,
      }))
    );
    setSelected({ kind: "group", id: group.id });
  };

  const handlePersonSaved = (person: SplitBillPersonSummary) => {
    upsertPeople([person]);
    setSelected({ kind: "person", id: person.id });
  };

  const updateGroupAvatar = async (groupId: string, avatarUrl: string | null) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) {
      return;
    }

    const response = await fetch(`/api/split-bill-groups/${groupId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: group.name,
        avatarUrl,
        members: group.members.map((member, index) => ({
          id: member.id,
          name: member.name,
          sortOrder: index,
        })),
      }),
    });
    if (!response.ok) {
      return;
    }

    setGroups((current) => current.map((entry) => (entry.id === groupId ? { ...entry, avatarUrl } : entry)));
  };

  const updatePersonAvatar = async (personId: string, avatarUrl: string | null) => {
    const person = people.find((entry) => entry.id === personId);
    if (!person) {
      return;
    }

    const response = await fetch(`/api/split-bill-people/${personId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: person.name,
        avatarUrl,
      }),
    });
    if (!response.ok) {
      return;
    }

    setPeople((current) => current.map((entry) => (entry.id === personId ? { ...entry, avatarUrl } : entry)));
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
      actions={<SplitBillPageActions people={people} groups={groups} onBillSaved={handleBillSaved} onGroupSaved={handleGroupSaved} onPersonSaved={handlePersonSaved} />}
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
                <div className="split-bill-detail-modal__photo-actions">
                  {selectedGroup.avatarUrl ? (
                    <img className="split-bill-detail-modal__avatar" src={selectedGroup.avatarUrl} alt="" />
                  ) : (
                    <span className="split-bill-detail-modal__avatar split-bill-detail-modal__avatar--placeholder">
                      {selectedGroup.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("")
                        .slice(0, 2) || "?"}
                    </span>
                  )}
                  <div className="split-bill-detail-modal__actions">
                    <label className="button button-secondary button-small split-bill-detail-modal__file-button">
                      Change photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (!file) {
                            return;
                          }
                          void readFileAsDataUrl(file).then((dataUrl) => void updateGroupAvatar(selectedGroup.id, dataUrl));
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button className="button button-secondary button-small" type="button" onClick={() => void updateGroupAvatar(selectedGroup.id, null)}>
                      Remove photo
                    </button>
                  </div>
                </div>
                <p>People: {selectedGroup.members.length}</p>
                <p>Bills: {bills.filter((bill) => bill.group?.id === selectedGroup.id).length}</p>
                <p>Total: {buildSummaryTotal(bills.filter((bill) => bill.group?.id === selectedGroup.id))}</p>
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
                  {bills.filter((bill) => bill.group?.id === selectedGroup.id).map((bill) => (
                    <button key={bill.id} type="button" className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--button" onClick={() => openBill(bill.id)}>
                      <strong>{bill.title}</strong>
                      <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedPerson ? (
              <div className="split-bill-detail-modal__body">
                <div className="split-bill-detail-modal__photo-actions">
                  {selectedPerson.avatarUrl ? (
                    <img className="split-bill-detail-modal__avatar" src={selectedPerson.avatarUrl} alt="" />
                  ) : (
                    <span className="split-bill-detail-modal__avatar split-bill-detail-modal__avatar--placeholder">
                      {selectedPerson.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .map((part) => part[0]?.toUpperCase() ?? "")
                        .join("")
                        .slice(0, 2) || "?"}
                    </span>
                  )}
                  <div className="split-bill-detail-modal__actions">
                    <label className="button button-secondary button-small split-bill-detail-modal__file-button">
                      Change photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (!file) {
                            return;
                          }
                          void readFileAsDataUrl(file).then((dataUrl) => void updatePersonAvatar(selectedPerson.id, dataUrl));
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    <button className="button button-secondary button-small" type="button" onClick={() => void updatePersonAvatar(selectedPerson.id, null)}>
                      Remove photo
                    </button>
                  </div>
                </div>
                <p>Bill count: {bills.filter((bill) => bill.participants.some((participant) => participant.name === selectedPerson.name)).length}</p>
                <div className="split-bill-detail-modal__list">
                  {bills
                    .filter((bill) => bill.participants.some((participant) => participant.name === selectedPerson.name))
                    .map((bill) => (
                      <button key={bill.id} type="button" className="split-bill-detail-modal__list-row split-bill-detail-modal__list-row--button" onClick={() => openBill(bill.id)}>
                        <strong>{bill.title}</strong>
                        <span>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</span>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </CloverShell>
  );
}
