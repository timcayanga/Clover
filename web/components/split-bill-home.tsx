"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatSplitBillAmount, type SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillGroupSummary = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
  _count?: {
    bills: number;
  };
};

type SplitBillHomeProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const parseMembers = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

export function SplitBillHome({ bills: initialBills, groups: initialGroups }: SplitBillHomeProps) {
  const router = useRouter();
  const [bills, setBills] = useState(initialBills);
  const [groups, setGroups] = useState(initialGroups);
  const [groupName, setGroupName] = useState("");
  const [memberText, setMemberText] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeletingBillId, setIsDeletingBillId] = useState<string | null>(null);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  const totalSettledBills = bills.length;
  const totalPeople = new Set([
    ...groups.flatMap((group) => group.members.map((member) => member.name)),
    ...bills.flatMap((bill) => bill.participants.map((participant) => participant.name)),
  ]).size;
  const totalOwed = bills.reduce((sum, bill) => sum + bill.settlement.totalOwed, 0);
  const totalPaid = bills.reduce((sum, bill) => sum + bill.settlement.totalPaid, 0);

  const loadGroupIntoForm = () => {
    if (!selectedGroup) {
      return;
    }

    setGroupName(selectedGroup.name);
    setMemberText(selectedGroup.members.map((member) => member.name).join("\n"));
  };

  const clearGroupForm = () => {
    setSelectedGroupId("");
    setGroupName("");
    setMemberText("");
  };

  const saveGroup = async () => {
    setIsSavingGroup(true);
    setGroupError(null);

    try {
      const members = parseMembers(memberText).map((name, index) => ({ name, sortOrder: index }));
      const payload = {
        name: groupName.trim(),
        members,
      };

      if (selectedGroupId) {
        const response = await fetch(`/api/split-bill-groups/${selectedGroupId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await readJsonResponse<{ group: SplitBillGroupSummary }>(response);
        setGroups((current) => current.map((group) => (group.id === result.group.id ? result.group : group)));
      } else {
        const response = await fetch("/api/split-bill-groups", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await readJsonResponse<{ group: SplitBillGroupSummary }>(response);
        setGroups((current) => [result.group, ...current]);
        setSelectedGroupId(result.group.id);
      }

      router.refresh();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to save group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const deleteGroup = async () => {
    if (!selectedGroupId) {
      return;
    }

    setIsSavingGroup(true);
    setGroupError(null);

    try {
      const response = await fetch(`/api/split-bill-groups/${selectedGroupId}`, {
        method: "DELETE",
      });
      await readJsonResponse<{ ok: boolean }>(response);
      setGroups((current) => current.filter((group) => group.id !== selectedGroupId));
      clearGroupForm();
      router.refresh();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to delete group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  const deleteBill = async (billId: string) => {
    setIsDeletingBillId(billId);
    try {
      const response = await fetch(`/api/split-bills/${billId}`, {
        method: "DELETE",
      });
      await readJsonResponse<{ ok: boolean }>(response);
      setBills((current) => current.filter((bill) => bill.id !== billId));
      if (deleteTargetId === billId) {
        setDeleteTargetId(null);
      }
      router.refresh();
    } catch {
      // Keep the UI light: surface only in the button state for MVP.
    } finally {
      setIsDeletingBillId(null);
    }
  };

  return (
    <div className="split-bill-home">
      <section className="split-bill-hero glass">
        <div className="split-bill-hero__copy">
          <span className="pill pill-accent">Split Bill</span>
          <h1>Split a receipt, settle the balances, move on.</h1>
          <p>
            Keep Clover&apos;s bill sharing separate from transactions. Build ad hoc groups, import receipts for OCR, and see who owes whom in one place.
          </p>
          <div className="split-bill-hero__actions">
            <Link className="button button-primary button-pill" href="/split-bill/new" prefetch={false}>
              New bill
            </Link>
            <button className="button button-secondary button-pill" type="button" onClick={() => clearGroupForm()}>
              New group
            </button>
          </div>
        </div>

        <div className="split-bill-hero__stats">
          <article className="split-bill-stat">
            <span>Recent bills</span>
            <strong>{totalSettledBills}</strong>
          </article>
          <article className="split-bill-stat">
            <span>People used</span>
            <strong>{totalPeople}</strong>
          </article>
          <article className="split-bill-stat">
            <span>Total owed</span>
            <strong>{formatSplitBillAmount(totalOwed)}</strong>
          </article>
          <article className="split-bill-stat">
            <span>Total paid</span>
            <strong>{formatSplitBillAmount(totalPaid)}</strong>
          </article>
        </div>
      </section>

      <div className="split-bill-grid">
        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <div>
              <p className="eyebrow">Recent bills</p>
              <h2>Track what was split and who still owes.</h2>
            </div>
            <Link className="button button-secondary button-small" href="/split-bill/new" prefetch={false}>
              Create bill
            </Link>
          </div>

          {bills.length > 0 ? (
            <div className="split-bill-list">
              {bills.map((bill) => {
                const nextTransfer = bill.settlement.transfers[0];
                const netBalance = bill.settlement.participants.reduce((sum, participant) => sum + participant.balance, 0);

                return (
                  <article key={bill.id} className="split-bill-card">
                    <div className="split-bill-card__head">
                      <div>
                        <h3>
                          <Link href={`/split-bill/${bill.id}`} prefetch={false}>
                            {bill.title}
                          </Link>
                        </h3>
                        <p>
                          {formatDate(bill.billDate)}
                          {bill.group?.name ? ` · ${bill.group.name}` : ""}
                        </p>
                      </div>
                      <div className="split-bill-card__meta">
                        <span>{bill.sourceType === "receipt" ? "Receipt import" : "Manual bill"}</span>
                        <strong>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</strong>
                      </div>
                    </div>

                    <div className="split-bill-card__body">
                      <div className="split-bill-card__summary">
                        <span>Net balance</span>
                        <strong>{formatSplitBillAmount(netBalance, bill.currency)}</strong>
                      </div>
                      <div className="split-bill-card__summary">
                        <span>Participants</span>
                        <strong>{bill.participants.length}</strong>
                      </div>
                      <div className="split-bill-card__summary">
                        <span>Transfers</span>
                        <strong>{bill.settlement.transfers.length}</strong>
                      </div>
                    </div>

                    <div className="split-bill-card__footer">
                      {nextTransfer ? (
                        <span className="split-bill-card__hint">
                          {nextTransfer.fromParticipantName} owes {nextTransfer.toParticipantName} {formatSplitBillAmount(nextTransfer.amount, bill.currency)}
                        </span>
                      ) : (
                        <span className="split-bill-card__hint">All settled up.</span>
                      )}
                      <div className="split-bill-card__actions">
                        <Link className="button button-secondary button-small" href={`/split-bill/${bill.id}`} prefetch={false}>
                          View
                        </Link>
                        <Link className="button button-secondary button-small" href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                          Edit
                        </Link>
                        <button
                          className="button button-danger button-small"
                          type="button"
                          onClick={() => setDeleteTargetId(bill.id)}
                          disabled={isDeletingBillId === bill.id}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="split-bill-empty">
              <strong>No split bills yet.</strong>
              <p>Create a bill or import a receipt to start tracking shared expenses.</p>
            </div>
          )}
        </section>

        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <div>
              <p className="eyebrow">Groups</p>
              <h2>Save names you use often.</h2>
            </div>
            <button className="button button-secondary button-small" type="button" onClick={loadGroupIntoForm} disabled={!selectedGroup}>
              Load group
            </button>
          </div>

          <div className="split-bill-group-form">
            <label className="settings-field">
              <span>Saved group</span>
              <select className="settings-input" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                <option value="">Create new group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Group name</span>
              <input
                className="settings-input"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Weekend trip crew"
              />
            </label>

            <label className="settings-field">
              <span>People</span>
              <textarea
                className="settings-input split-bill-group-form__textarea"
                value={memberText}
                onChange={(event) => setMemberText(event.target.value)}
                placeholder="One name per line"
              />
            </label>

            {groupError ? <p className="split-bill-group-form__error">{groupError}</p> : null}

            <div className="split-bill-group-form__actions">
              <button className="button button-primary" type="button" onClick={saveGroup} disabled={isSavingGroup || !groupName.trim()}>
                {selectedGroupId ? "Save group" : "Create group"}
              </button>
              {selectedGroupId ? (
                <button className="button button-secondary" type="button" onClick={deleteGroup} disabled={isSavingGroup}>
                  Delete group
                </button>
              ) : null}
            </div>
          </div>

          <div className="split-bill-group-list">
            {groups.length > 0 ? (
              groups.map((group) => (
                <article key={group.id} className="split-bill-group-card">
                  <div className="split-bill-group-card__head">
                    <div>
                      <strong>{group.name}</strong>
                      <p>{group.members.length} people · {group._count?.bills ?? 0} bills</p>
                    </div>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setGroupName(group.name);
                        setMemberText(group.members.map((member) => member.name).join("\n"));
                      }}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="split-bill-group-card__members">
                    {group.members.length > 0 ? (
                      group.members.map((member) => <span key={member.id}>{member.name}</span>)
                    ) : (
                      <span>No saved names yet.</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="split-bill-empty">
                <strong>No groups yet.</strong>
                <p>Use the form above to save the people you split with most often.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {deleteTargetId ? (
        <div className="split-bill-modal" role="dialog" aria-modal="true" aria-label="Delete split bill">
          <section className="split-bill-modal__card glass">
            <h3>Delete this bill?</h3>
            <p>This will remove the split bill, its people, and its settlement history from Clover.</p>
            <div className="split-bill-modal__actions">
              <button className="button button-secondary" type="button" onClick={() => setDeleteTargetId(null)}>
                Cancel
              </button>
              <button className="button button-danger" type="button" onClick={() => void deleteBill(deleteTargetId)} disabled={isDeletingBillId === deleteTargetId}>
                Delete bill
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
