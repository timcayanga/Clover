"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatSplitBillAmount, normalizeCurrencyCode, type SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillGroupSummary = {
  id: string;
  name: string;
  members: Array<{ id: string; name: string; sortOrder: number }>;
};

type SplitBillHomeProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  selectedCurrency?: string | null;
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
}: SplitBillHomeProps) {
  const [bills] = useState(initialBills);
  const [groups] = useState(initialGroups);

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

  return (
    <div className="split-bill-home">
      <section className="split-bill-panel panel glass">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Split Bills</p>
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

    </div>
  );
}
