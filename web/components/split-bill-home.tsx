"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatSplitBillAmount, normalizeCurrencyCode, type SplitBillSerializedBill } from "@/lib/split-bill";
import { SplitBillManualModal } from "@/components/split-bill-manual-modal";
import { SplitBillImportModal } from "@/components/split-bill-import-modal";

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
  selectedCurrency?: string | null;
  initialAddMode?: "manual" | "import" | null;
  initialGroupMode?: "new" | null;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const getInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?"

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload?.error ?? "Request failed");
  }
  return payload;
}

const buildRowStatus = (transfers: SplitBillSerializedBill["settlement"]["transfers"]) =>
  transfers.length > 0 ? `${transfers.length} transfer${transfers.length === 1 ? "" : "s"}` : "Settled";

const sumBillTotals = (items: SplitBillSerializedBill[]) =>
  items.reduce((sum, bill) => sum + (bill.total ? Number(bill.total) || 0 : 0), 0);

const groupBillsByCurrency = (items: SplitBillSerializedBill[]) =>
  items.reduce<Record<string, SplitBillSerializedBill[]>>((acc, bill) => {
    const key = normalizeCurrencyCode(bill.currency);
    acc[key] = acc[key] ?? [];
    acc[key].push(bill);
    return acc;
  }, {});

export function SplitBillHome({
  bills: initialBills,
  groups: initialGroups,
  selectedCurrency = "ALL",
  initialAddMode,
  initialGroupMode,
}: SplitBillHomeProps) {
  const router = useRouter();
  const [bills] = useState(initialBills);
  const [groups, setGroups] = useState(initialGroups);
  const [groupName, setGroupName] = useState("");
  const [memberText, setMemberText] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const visibleBills = useMemo(
    () => (selectedCurrency === "ALL" ? bills : bills.filter((bill) => normalizeCurrencyCode(bill.currency) === normalizeCurrencyCode(selectedCurrency))),
    [bills, selectedCurrency]
  );

  const visibleGroups = useMemo(() => {
    return groups.map((group) => {
      const groupBills = bills.filter((bill) => bill.group?.id === group.id);
      const billsByCurrency = groupBillsByCurrency(groupBills);
      const currencies = Object.keys(billsByCurrency);
      const sharedCurrency = currencies.length === 1 ? currencies[0] : null;
      const total =
        sharedCurrency && groupBills.every((bill) => bill.total)
          ? formatSplitBillAmount(sumBillTotals(groupBills), sharedCurrency)
          : currencies.length > 1
            ? "Mixed"
            : groupBills.length > 0 && groupBills[0]?.total
              ? formatSplitBillAmount(sumBillTotals(groupBills), normalizeCurrencyCode(groupBills[0]?.currency))
              : "No total";

      return {
        ...group,
        total,
        status: groupBills.length === 0 ? "Empty" : groupBills.some((bill) => bill.settlement.transfers.length > 0) ? "Open" : "Settled",
      };
    });
  }, [bills, groups]);

  const clearGroupForm = () => {
    setGroupName("");
    setMemberText("");
    setGroupError(null);
  };

  const closeGroupModal = () => {
    const base = new URLSearchParams();
    if (selectedCurrency && selectedCurrency !== "ALL") {
      base.set("currency", selectedCurrency);
    }
    router.push(`/split-bill${base.toString() ? `?${base.toString()}` : ""}`);
    router.refresh();
  };

  const saveGroup = async () => {
    setIsSavingGroup(true);
    setGroupError(null);

    try {
      const members = memberText
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((name, index) => ({ name, sortOrder: index }));
      const payload = {
        name: groupName.trim(),
        members,
      };

      const response = await fetch("/api/split-bill-groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse<{ group: SplitBillGroupSummary }>(response);
      setGroups((current) => [result.group, ...current]);
      clearGroupForm();
      closeGroupModal();
      router.refresh();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "Unable to save group");
    } finally {
      setIsSavingGroup(false);
    }
  };

  return (
    <div className="split-bill-home">
      <section className="split-bill-panel panel glass">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Split Bills</p>
            <h2>Split Bills</h2>
          </div>
        </div>

        <div className="split-bill-table split-bill-table--bills" role="table" aria-label="Split bills">
          <div className="split-bill-table__header" role="row">
            <span role="columnheader">Description</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">People</span>
            <span role="columnheader">Total</span>
            <span role="columnheader">Status</span>
          </div>
          {visibleBills.length > 0 ? (
            visibleBills.map((bill) => {
              const status = buildRowStatus(bill.settlement.transfers);
              const sourceLabel = bill.sourceType === "receipt" ? "Receipt" : "Manual";

              return (
                <div key={bill.id} className="split-bill-table__row" role="row">
                  <div role="cell" className="split-bill-table__bill">
                    <strong>
                      <Link href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                        {bill.title}
                      </Link>
                    </strong>
                    <span>
                      {sourceLabel}
                      {bill.group?.name ? ` · ${bill.group.name}` : ""}
                    </span>
                  </div>
                  <div role="cell">
                    <Link className="split-bill-table__inline-link" href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                      {formatDate(bill.billDate)}
                    </Link>
                  </div>
                  <div role="cell" className="split-bill-table__chips">
                    {bill.participants.length > 0 ? (
                      bill.participants.map((participant) => (
                        <span key={participant.id} className="split-bill-table__chip" title={participant.name}>
                          {getInitials(participant.name)}
                        </span>
                      ))
                    ) : (
                      <span className="split-bill-table__empty-chip">No people</span>
                    )}
                  </div>
                  <div role="cell">
                    <Link className="split-bill-table__inline-link" href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                      {bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}
                    </Link>
                  </div>
                  <div role="cell">
                    <Link className="split-bill-table__inline-link" href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                      {status}
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="split-bill-empty">
              <strong>No split bills yet.</strong>
              <p>
                {selectedCurrency && selectedCurrency !== "ALL"
                  ? `Add your first ${selectedCurrency} bill or upload a receipt to start.`
                  : "Add your first bill or upload a receipt to start."}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="split-bill-panel panel glass">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Groups</p>
            <h2>Save names you use often</h2>
          </div>
        </div>

        <div className="split-bill-table split-bill-table--groups" role="table" aria-label="Split bill groups">
          <div className="split-bill-table__header" role="row">
            <span role="columnheader">Group</span>
            <span role="columnheader">People</span>
            <span role="columnheader">Total</span>
            <span role="columnheader">Status</span>
          </div>
          {visibleGroups.length > 0 ? (
            visibleGroups.map((group) => (
              <div key={group.id} className="split-bill-table__row" role="row">
                <div role="cell" className="split-bill-table__bill">
                  <strong>
                    <Link href={`/split-bill/groups/${group.id}`} prefetch={false}>
                      {group.name}
                    </Link>
                  </strong>
                  <span>
                    {group.members.length} member{group.members.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div role="cell" className="split-bill-table__chips">
                  {group.members.length > 0 ? (
                    group.members.map((member) => (
                      <span key={member.id} className="split-bill-table__chip" title={member.name}>
                        {getInitials(member.name)}
                      </span>
                    ))
                  ) : (
                    <span className="split-bill-table__empty-chip">No people</span>
                  )}
                </div>
                <div role="cell">{group.total}</div>
                <div role="cell">{group.status}</div>
              </div>
            ))
          ) : (
            <div className="split-bill-empty">
              <strong>No Groups Yet</strong>
            </div>
          )}
        </div>
      </section>

      {initialGroupMode === "new" ? (
        <div className="split-bill-modal" role="dialog" aria-modal="true" aria-label="Add group">
          <section className="split-bill-modal__card glass split-bill-group-modal">
            <div className="split-bill-manual-modal__head">
              <div>
                <p className="eyebrow">Add group</p>
                <h3>Save a new group</h3>
              </div>
              <button className="split-bill-icon-button" type="button" onClick={closeGroupModal} aria-label="Close group window">
                ×
              </button>
            </div>

            <label className="settings-field">
              <span>Group name</span>
              <input className="settings-input" value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Weekend trip crew" />
            </label>

            <label className="settings-field">
              <span>People</span>
              <textarea
                className="settings-input split-bill-group-form__textarea"
                value={memberText}
                onChange={(event) => setMemberText(event.target.value)}
                placeholder="One name per line or comma-separated"
              />
            </label>

            {groupError ? <p className="split-bill-group-form__error">{groupError}</p> : null}

            <div className="split-bill-manual-modal__actions">
              <button className="button button-primary" type="button" onClick={() => void saveGroup()} disabled={isSavingGroup || !groupName.trim()}>
                {isSavingGroup ? "Saving..." : "Create group"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <SplitBillManualModal
        open={initialAddMode === "manual"}
        closeHref={selectedCurrency && selectedCurrency !== "ALL" ? `/split-bill?currency=${encodeURIComponent(selectedCurrency)}` : "/split-bill"}
      />
      <SplitBillImportModal
        open={initialAddMode === "import"}
        closeHref={selectedCurrency && selectedCurrency !== "ALL" ? `/split-bill?currency=${encodeURIComponent(selectedCurrency)}` : "/split-bill"}
      />
    </div>
  );
}
