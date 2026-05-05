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
  people: string[];
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
    .slice(0, 2) || "?";

const avatarTones = [
  "linear-gradient(135deg, rgba(3, 168, 192, 0.9), rgba(94, 211, 208, 0.9))",
  "linear-gradient(135deg, rgba(94, 211, 208, 0.92), rgba(110, 231, 183, 0.88))",
  "linear-gradient(135deg, rgba(110, 231, 183, 0.94), rgba(3, 168, 192, 0.16))",
  "linear-gradient(135deg, rgba(31, 41, 51, 0.18), rgba(3, 168, 192, 0.84))",
  "linear-gradient(135deg, rgba(181, 246, 239, 0.96), rgba(3, 168, 192, 0.3))",
] as const;

const getAvatarStyle = (name: string) => {
  const seed = name
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return {
    background: avatarTones[seed % avatarTones.length],
  };
};

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

export function SplitBillHome({ bills, groups, people }: SplitBillHomeProps) {
  const [showAllBills, setShowAllBills] = useState(false);

  const recentBills = showAllBills ? bills : bills.slice(0, 4);

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

  const hasMoreBills = bills.length > recentBills.length;

  return (
    <div className="split-bill-home">
      <section className="split-bill-mobile-home panel glass">
        <div className="split-bill-mobile-home__cards">
          {recentBills.length > 0 ? (
            recentBills.map((bill) => {
              const status = buildRowStatus(bill.settlement.transfers);
              const sourceLabel = bill.sourceType === "receipt" ? "Receipt" : "Manual";

              return (
                <article key={bill.id} className="split-bill-mobile-card">
                  <div className="split-bill-mobile-card__head">
                    <div>
                      <strong>
                        <Link href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                          {bill.title}
                        </Link>
                      </strong>
                      <span>
                        {formatDate(bill.billDate)}
                        {bill.group?.name ? ` · ${bill.group.name}` : ""}
                      </span>
                    </div>
                    <strong>{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</strong>
                  </div>
                  <div className="split-bill-mobile-card__meta">
                    <span>{sourceLabel}</span>
                    <span>{status}</span>
                  </div>
                  <div className="split-bill-mobile-card__avatars">
                    {bill.participants.length > 0 ? (
                      bill.participants.map((participant) => (
                        <span key={participant.id} className="split-bill-person-avatar" title={participant.name} style={getAvatarStyle(participant.name)}>
                          {getInitials(participant.name)}
                        </span>
                      ))
                    ) : (
                      <span className="split-bill-subtle-empty">No people yet</span>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="split-bill-empty">
              <strong>No split bills yet.</strong>
              <p>Add your first bill or upload a receipt to start.</p>
            </div>
          )}
        </div>
        {hasMoreBills ? (
          <button className="split-bill-table__more-link" type="button" onClick={() => setShowAllBills((current) => !current)}>
            All Bills
          </button>
        ) : null}

        <div className="split-bill-mobile-home__section-head">
          <div>
            <p className="eyebrow">People</p>
            <h3>Saved names</h3>
          </div>
        </div>

        <div className="split-bill-mobile-home__people">
          {people.length > 0 ? (
            people.map((person) => (
              <span key={person} className="split-bill-mobile-home__person">
                <span className="split-bill-person-avatar split-bill-person-avatar--small" style={getAvatarStyle(person)}>
                  {getInitials(person)}
                </span>
                <span>{person}</span>
              </span>
            ))
          ) : (
            <span className="split-bill-subtle-empty">No saved names yet</span>
          )}
        </div>
        <div className="split-bill-mobile-home__footer">
          <button className="button button-secondary button-small" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-people"))}>
            Add People
          </button>
        </div>

        <div className="split-bill-mobile-home__section-head">
          <div>
            <p className="eyebrow">Groups</p>
            <h3>Saved groups</h3>
          </div>
        </div>

        <div className="split-bill-mobile-home__groups">
          {visibleGroups.length > 0 ? (
            visibleGroups.map((group) => (
              <Link key={group.id} href={`/split-bill/groups/${group.id}`} prefetch={false} className="split-bill-mobile-group-card">
                <div className="split-bill-mobile-group-card__head">
                  <strong>{group.name}</strong>
                  <span>{group.total}</span>
                </div>
                <div className="split-bill-mobile-group-card__meta">
                  <span>{group.members.length} member{group.members.length === 1 ? "" : "s"}</span>
                  <span>{group.status}</span>
                </div>
                <div className="split-bill-mobile-group-card__avatars">
                  {group.members.length > 0 ? (
                    group.members.map((member) => (
                      <span key={member.id} className="split-bill-person-avatar split-bill-person-avatar--small" title={member.name} style={getAvatarStyle(member.name)}>
                        {getInitials(member.name)}
                      </span>
                    ))
                  ) : (
                    <span className="split-bill-subtle-empty">No people yet</span>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <span className="split-bill-subtle-empty">No groups yet</span>
          )}
        </div>
        <div className="split-bill-mobile-home__footer">
          <button className="button button-secondary button-small" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-group"))}>
            Add Group
          </button>
        </div>
      </section>

      <section className="split-bill-panel panel glass split-bill-desktop-home">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Bills</p>
            <h2>Recent bills</h2>
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
          {recentBills.length > 0 ? (
            recentBills.map((bill) => {
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
                      <span className="split-bill-subtle-empty">No people yet</span>
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
              <p>Add your first bill or upload a receipt to start.</p>
            </div>
          )}
        </div>
        {hasMoreBills ? (
          <button className="split-bill-table__more-link" type="button" onClick={() => setShowAllBills((current) => !current)}>
            All Bills
          </button>
        ) : null}
      </section>

      <section className="split-bill-panel panel glass split-bill-desktop-home">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">People</p>
            <h2>Saved names</h2>
          </div>
        </div>

        <div className="split-bill-home__people-list">
          {people.length > 0 ? (
            people.map((person) => (
              <span key={person} className="split-bill-home__person">
                <span className="split-bill-person-avatar split-bill-person-avatar--small" style={getAvatarStyle(person)}>
                  {getInitials(person)}
                </span>
                <span>{person}</span>
              </span>
            ))
          ) : (
            <span className="split-bill-subtle-empty">No saved names yet</span>
          )}
        </div>
        <div className="split-bill-home__bottom-actions">
          <button className="button button-secondary button-small" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-people"))}>
            Add People
          </button>
        </div>
      </section>

      <section className="split-bill-panel panel glass split-bill-desktop-home">
        <div className="split-bill-panel__head">
          <div>
            <p className="eyebrow">Groups</p>
            <h2>Saved groups</h2>
          </div>
        </div>

        <div className="split-bill-home__groups-list">
          {visibleGroups.length > 0 ? (
            visibleGroups.map((group) => (
              <Link key={group.id} href={`/split-bill/groups/${group.id}`} prefetch={false} className="split-bill-home__group-row">
                <strong>{group.name}</strong>
                <span>
                  {group.members.length} member{group.members.length === 1 ? "" : "s"} · {group.total} · {group.status}
                </span>
              </Link>
            ))
          ) : (
            <span className="split-bill-subtle-empty">No groups yet</span>
          )}
        </div>
        <div className="split-bill-home__bottom-actions">
          <button className="button button-secondary button-small" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-group"))}>
            Add Group
          </button>
        </div>
      </section>
    </div>
  );
}
