"use client";

import { useMemo, useState } from "react";
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

type SplitBillHomeProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  people: SplitBillPersonSummary[];
  onOpenBill: (billId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenPerson: (personId: string) => void;
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

const renderAvatar = (name: string, avatarUrl: string | null, sizeClass = "split-bill-person-avatar--small") => {
  if (avatarUrl) {
    return (
      <span className={`split-bill-person-avatar ${sizeClass}`}>
        <img className="split-bill-person-avatar__image" src={avatarUrl} alt="" />
      </span>
    );
  }

  return (
    <span className={`split-bill-person-avatar ${sizeClass}`} style={getAvatarStyle(name)}>
      {getInitials(name)}
    </span>
  );
};

export function SplitBillHome({ bills, groups, people, onOpenBill, onOpenGroup, onOpenPerson }: SplitBillHomeProps) {
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

  return (
    <div className="split-bill-home">
      <section className="split-bill-mobile-home">
        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <h2>Bills</h2>
          </div>

          <div className="split-bill-table split-bill-table--bills" role="table" aria-label="Split bills">
            <div className="split-bill-table__header" role="row">
              <span role="columnheader">Description</span>
              <span role="columnheader">Date</span>
              <span role="columnheader">People</span>
              <span role="columnheader">Total</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" aria-hidden="true" />
            </div>
            {recentBills.length > 0 ? (
              recentBills.map((bill) => {
                const status = buildRowStatus(bill.settlement.transfers);
                const sourceLabel = bill.sourceType === "receipt" ? "Receipt" : "Manual";

                return (
                  <div key={bill.id} className="split-bill-table__row split-bill-table__row--interactive" role="row">
                    <div role="cell" className="split-bill-table__bill">
                      <strong>{bill.title}</strong>
                      <span>
                        {sourceLabel}
                        {bill.group?.name ? ` · ${bill.group.name}` : ""}
                      </span>
                    </div>
                    <div role="cell">{formatDate(bill.billDate)}</div>
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
                    <div role="cell">{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</div>
                    <div role="cell">{status}</div>
                    <div role="cell" className="split-bill-table__row-action">
                      <button className="split-bill-table__chevron" type="button" aria-label={`View ${bill.title}`} onClick={() => onOpenBill(bill.id)}>
                        ›
                      </button>
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
          <div className="split-bill-table__footer">
            <button className="split-bill-table__more-link" type="button" onClick={() => setShowAllBills((current) => !current)}>
              All Bills
            </button>
          </div>
        </section>

        <div className="split-bill-mobile-home__sections">
          <section className="split-bill-mobile-home__section">
            <div className="split-bill-mobile-home__section-head">
              <h3>People</h3>
            </div>

            <div className="split-bill-mobile-home__people">
              {people.length > 0 ? (
                people.map((person) => (
                  <button key={person.id} type="button" className="split-bill-mobile-home__person-button" onClick={() => onOpenPerson(person.id)}>
                    {renderAvatar(person.name, person.avatarUrl)}
                    <span>{person.name}</span>
                  </button>
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
          </section>

          <section className="split-bill-mobile-home__section">
            <div className="split-bill-mobile-home__section-head">
              <h3>Groups</h3>
            </div>

            <div className="split-bill-mobile-home__groups">
              {visibleGroups.length > 0 ? (
                visibleGroups.map((group) => (
                  <button key={group.id} type="button" className="split-bill-mobile-group-card" onClick={() => onOpenGroup(group.id)}>
                    <div className="split-bill-mobile-group-card__head">
                      <strong className="split-bill-mobile-group-card__name">
                        {group.avatarUrl ? <img className="split-bill-person-avatar__image" src={group.avatarUrl} alt="" /> : null}
                        <span>{group.name}</span>
                      </strong>
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
                  </button>
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
        </div>
      </section>

      <section className="split-bill-panel panel glass split-bill-desktop-home">
        <div className="split-bill-panel__head">
          <h2>Bills</h2>
        </div>

        <div className="split-bill-table split-bill-table--bills" role="table" aria-label="Split bills">
          <div className="split-bill-table__header" role="row">
            <span role="columnheader">Description</span>
            <span role="columnheader">Date</span>
            <span role="columnheader">People</span>
            <span role="columnheader">Total</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" aria-hidden="true" />
          </div>
          {recentBills.length > 0 ? (
            recentBills.map((bill) => {
              const status = buildRowStatus(bill.settlement.transfers);
              const sourceLabel = bill.sourceType === "receipt" ? "Receipt" : "Manual";

              return (
                <div key={bill.id} className="split-bill-table__row split-bill-table__row--interactive" role="row">
                  <div role="cell" className="split-bill-table__bill">
                    <strong>{bill.title}</strong>
                    <span>
                      {sourceLabel}
                      {bill.group?.name ? ` · ${bill.group.name}` : ""}
                    </span>
                  </div>
                  <div role="cell">{formatDate(bill.billDate)}</div>
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
                  <div role="cell">{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</div>
                  <div role="cell">{status}</div>
                  <div role="cell" className="split-bill-table__row-action">
                    <button className="split-bill-table__chevron" type="button" aria-label={`View ${bill.title}`} onClick={() => onOpenBill(bill.id)}>
                      ›
                    </button>
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
        <div className="split-bill-table__footer">
          <button className="split-bill-table__more-link" type="button" onClick={() => setShowAllBills((current) => !current)}>
            All Bills
          </button>
        </div>
      </section>

      <div className="split-bill-desktop-home split-bill-desktop-home__secondary">
        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <h2>Groups</h2>
          </div>

          <div className="split-bill-home__groups-list">
            {visibleGroups.length > 0 ? (
              visibleGroups.map((group) => (
                <button key={group.id} type="button" className="split-bill-home__group-row" onClick={() => onOpenGroup(group.id)}>
                  <strong>{group.name}</strong>
                  <span>
                    {group.members.length} member{group.members.length === 1 ? "" : "s"} · {group.total} · {group.status}
                  </span>
                </button>
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

        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <h2>People</h2>
          </div>

          <div className="split-bill-home__people-list">
            {people.length > 0 ? (
              people.map((person) => (
                <button key={person.id} type="button" className="split-bill-home__person-button" onClick={() => onOpenPerson(person.id)}>
                  {renderAvatar(person.name, person.avatarUrl)}
                  <span>{person.name}</span>
                </button>
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
      </div>
    </div>
  );
}
