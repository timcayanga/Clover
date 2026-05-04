"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatSplitBillAmount, type SplitBillSerializedBill } from "@/lib/split-bill";
import { SplitBillManualModal } from "@/components/split-bill-manual-modal";

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
  initialAddMode?: "manual" | "import" | null;
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

export function SplitBillHome({ bills: initialBills, groups: initialGroups, initialAddMode }: SplitBillHomeProps) {
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
      <section className="split-bill-panel panel glass">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Split Bills</p>
            <h2>Recent split bills at a glance</h2>
          </div>
        </div>

        {bills.length > 0 ? (
          <div className="split-bill-table" role="table" aria-label="Recent split bills">
            <div className="split-bill-table__header" role="row">
              <span role="columnheader">Bill</span>
              <span role="columnheader">Date</span>
              <span role="columnheader">People</span>
              <span role="columnheader">Total</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Actions</span>
            </div>
            {bills.map((bill) => {
              const status = bill.settlement.transfers.length > 0 ? `${bill.settlement.transfers.length} transfer${bill.settlement.transfers.length === 1 ? "" : "s"}` : "Settled";
              const sourceLabel = bill.sourceType === "receipt" ? "Receipt" : "Manual";

              return (
                <div key={bill.id} className="split-bill-table__row" role="row">
                  <div role="cell" className="split-bill-table__bill">
                    <strong>
                      <Link href={`/split-bill/${bill.id}`} prefetch={false}>
                        {bill.title}
                      </Link>
                    </strong>
                    <span>
                      {sourceLabel}
                      {bill.group?.name ? ` · ${bill.group.name}` : ""}
                    </span>
                  </div>
                  <div role="cell">{formatDate(bill.billDate)}</div>
                  <div role="cell">{bill.participants.length}</div>
                  <div role="cell">{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</div>
                  <div role="cell">{status}</div>
                  <div role="cell" className="split-bill-table__actions">
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
              );
            })}
          </div>
        ) : (
          <div className="split-bill-empty">
            <strong>No split bills yet.</strong>
            <p>Add your first bill or upload a receipt to start.</p>
          </div>
        )}
      </section>

      <section className="split-bill-panel panel glass" id="split-bill-groups">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Groups</p>
            <h2>Save names you use often</h2>
          </div>
        </div>

        <div className="split-bill-group-list">
          {groups.length > 0 ? (
            groups.map((group) => (
              <article key={group.id} className="split-bill-group-card">
                <div className="split-bill-group-card__head">
                  <div>
                    <strong>{group.name}</strong>
                    <p>
                      {group.members.length} people · {group._count?.bills ?? 0} bills
                    </p>
                  </div>
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setGroupName(group.name);
                      setMemberText(group.members.map((member) => member.name).join("\n"));
                      document.getElementById("split-bill-groups-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
              <p>Create one below to save the names you split with most often.</p>
            </div>
          )}
        </div>

        <div className="split-bill-group-form" id="split-bill-groups-form">
          <div className="split-bill-panel__head">
            <div>
              <p className="eyebrow">{selectedGroupId ? "Edit group" : "Add group"}</p>
              <h3>{selectedGroupId ? "Update saved names" : "Save a new group"}</h3>
            </div>
          </div>

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
              <>
                <button className="button button-secondary" type="button" onClick={clearGroupForm} disabled={isSavingGroup}>
                  Cancel
                </button>
                <button className="button button-secondary" type="button" onClick={deleteGroup} disabled={isSavingGroup}>
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

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

      <SplitBillManualModal open={initialAddMode === "manual"} />
    </div>
  );
}
