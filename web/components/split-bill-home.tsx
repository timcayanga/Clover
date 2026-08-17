"use client";

import { useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { SplitBillActionButtons } from "@/components/split-bill-action-buttons";
import {
  formatSplitBillAmount,
  formatSplitBillSettlementStatus,
  normalizeCurrencyCode,
  type SplitBillSerializedBill,
} from "@/lib/split-bill";
import { SplitBillEntityAvatar } from "@/components/split-bill-entity-avatar";
import type { SplitBillGroupSummary, SplitBillPersonSummary } from "@/lib/split-bill-entities";
import { readAccountIdentityCache } from "@/lib/account-identity-cache";
import { SplitBillQrLibrary } from "@/components/split-bill-qr-library";
import { MobileSwipeDelete } from "@/components/mobile-swipe-delete";

type SplitBillHomeProps = {
  bills: SplitBillSerializedBill[];
  groups: SplitBillGroupSummary[];
  people: SplitBillPersonSummary[];
  currentUserName: string;
  onOpenBill: (billId: string) => void;
  onOpenGroup: (groupId: string) => void;
  onOpenPerson: (personId: string) => void;
  onDeleteBill: (billId: string) => void | Promise<void>;
  onDeleteGroup: (groupId: string) => void | Promise<void>;
  onDeletePerson: (personId: string) => void | Promise<void>;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const isSamePersonName = (left: string, right: string) => {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const leftName = normalize(left);
  const rightName = normalize(right);
  if (!leftName || !rightName) return false;
  if (leftName === rightName) return true;
  const leftParts = leftName.split(" ");
  const rightParts = rightName.split(" ");
  return leftParts[0] === rightParts[0] && (leftParts.length === 1 || rightParts.length === 1);
};

const buildRowStatus = (bill: SplitBillSerializedBill) =>
  bill.settlementStatus === "open" && bill.settlement.transfers.length > 0
    ? `${bill.settlement.transfers.length} transfer${bill.settlement.transfers.length === 1 ? "" : "s"}`
    : formatSplitBillSettlementStatus(bill.settlementStatus);

const buildGroupStatus = (items: SplitBillSerializedBill[]) => {
  if (items.length === 0) return null;
  if (items.every((bill) => bill.settlementStatus === "settled")) return "Fully settled";
  const openStates = Array.from(
    new Set(items.filter((bill) => bill.settlementStatus !== "settled").map((bill) => bill.settlementStatus))
  );
  return openStates.length === 1
    ? formatSplitBillSettlementStatus(openStates[0]!)
    : `${items.filter((bill) => bill.settlementStatus !== "settled").length} open bills`;
};

const sumBillTotals = (items: SplitBillSerializedBill[]) =>
  items.reduce((sum, bill) => sum + (bill.total ? Number(bill.total) || 0 : 0), 0);

const groupBillsByCurrency = (items: SplitBillSerializedBill[]) =>
  items.reduce<Record<string, SplitBillSerializedBill[]>>((acc, bill) => {
    const key = normalizeCurrencyCode(bill.currency);
    acc[key] = acc[key] ?? [];
    acc[key].push(bill);
    return acc;
  }, {});

const formatCurrencyTotals = (totals: Map<string, number>, fallbackCurrency = "PHP") => {
  const entries = Array.from(totals.entries()).filter(([, amount]) => Math.abs(amount) > 0.005);

  if (entries.length === 0) {
    return formatSplitBillAmount(0, fallbackCurrency);
  }

  if (entries.length > 1) {
    return "Mixed";
  }

  const [currency, amount] = entries[0];
  return formatSplitBillAmount(amount, currency);
};

const addCurrencyTotal = (totals: Map<string, number>, currency: string, amount: number) => {
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
};

export function SplitBillHome({ bills, groups, people, currentUserName, onOpenBill, onOpenGroup, onOpenPerson, onDeleteBill, onDeleteGroup, onDeletePerson }: SplitBillHomeProps) {
  const { user } = useUser();
  const [cachedProfileImage] = useState(() => readAccountIdentityCache()?.imageUrl ?? null);
  const [showAllBills, setShowAllBills] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "settled">("all");
  const isBlankState = bills.length === 0;
  const duePaymentRequests = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return bills.flatMap((bill) =>
      (bill.paymentRequests ?? [])
        .filter((request) => request.status === "requested" || request.status === "payment_reported")
        .filter((request) => {
          if (!request.dueDate) {
            return false;
          }

          const dueTime = new Date(request.dueDate).getTime();
          return dueTime >= today.getTime() && dueTime <= nextWeek;
        })
        .map((request) => ({ bill, request }))
    );
  }, [bills]);

  const balancePulse = useMemo(() => {
    const owes = new Map<string, number>();
    const isOwed = new Map<string, number>();
    const fallbackCurrency = normalizeCurrencyCode(bills[0]?.currency ?? "PHP");
    const openBills = bills.filter((bill) => bill.settlementStatus !== "settled");
    const nextTransfer = bills
      .flatMap((bill) =>
        bill.settlement.transfers.map((transfer) => ({
          ...transfer,
          billId: bill.id,
          billTitle: bill.title,
          currency: bill.currency,
          billDate: bill.billDate,
        }))
      )
      .filter(
        (transfer) =>
          isSamePersonName(transfer.fromParticipantName, currentUserName) ||
          isSamePersonName(transfer.toParticipantName, currentUserName)
      )
      .sort((left, right) => {
        const leftPriority = isSamePersonName(left.fromParticipantName, currentUserName) ? 0 : 1;
        const rightPriority = isSamePersonName(right.fromParticipantName, currentUserName) ? 0 : 1;
        return leftPriority - rightPriority || new Date(right.billDate).getTime() - new Date(left.billDate).getTime();
      })[0];

    for (const bill of bills) {
      for (const transfer of bill.settlement.transfers) {
        const currency = normalizeCurrencyCode(bill.currency);
        if (isSamePersonName(transfer.fromParticipantName, currentUserName)) {
          addCurrencyTotal(owes, currency, transfer.amount);
        }
        if (isSamePersonName(transfer.toParticipantName, currentUserName)) {
          addCurrencyTotal(isOwed, currency, transfer.amount);
        }
      }
    }

    return {
      owesLabel: formatCurrencyTotals(owes, fallbackCurrency),
      isOwedLabel: formatCurrencyTotals(isOwed, fallbackCurrency),
      settledCount: bills.filter((bill) => bill.settlementStatus === "settled").length,
      openCount: openBills.length,
      nextTransfer,
    };
  }, [bills, currentUserName]);

  const filteredBills = useMemo(
    () =>
      bills.filter((bill) => {
        const isSettled = bill.settlementStatus === "settled";
        return (
          statusFilter === "all" ||
          (statusFilter === "settled" && isSettled) ||
          (statusFilter === "open" && !isSettled)
        );
      }),
    [bills, statusFilter]
  );

  const recentBills = showAllBills ? filteredBills : filteredBills.slice(0, 4);
  const hasHiddenBills = filteredBills.length > 4;
  const billToggleLabel = showAllBills && hasHiddenBills ? "Show fewer" : "Show all bills";
  const toggleBills = () => {
    if (!hasHiddenBills) {
      return;
    }

    setShowAllBills((current) => !current);
  };

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
        status: buildGroupStatus(groupBills),
      };
    });
  }, [bills, groups]);

  const peopleWithBalances = useMemo(
    () =>
      people.map((person) => {
        const totals = new Map<string, number>();

        bills.forEach((bill) => {
          bill.settlement.transfers.forEach((transfer) => {
            const currency = normalizeCurrencyCode(bill.currency);
            if (transfer.fromParticipantName === person.name) {
              addCurrencyTotal(totals, currency, -transfer.amount);
            }
            if (transfer.toParticipantName === person.name) {
              addCurrencyTotal(totals, currency, transfer.amount);
            }
          });
        });

        const activeTotals = Array.from(totals.entries()).filter(([, amount]) => Math.abs(amount) > 0.005);
        if (activeTotals.length !== 1) {
          return { ...person, balanceLabel: activeTotals.length > 1 ? "Multiple currencies" : "Settled" };
        }

        const [currency, amount] = activeTotals[0];
        return {
          ...person,
          balanceLabel: `${amount < 0 ? "Owes" : "Owed"} ${formatSplitBillAmount(Math.abs(amount), currency)}`,
        };
      }),
    [bills, people]
  );
  const visiblePeople = showAllPeople ? peopleWithBalances : peopleWithBalances.slice(0, 6);
  const hasHiddenPeople = peopleWithBalances.length > 6;
  const currentUserAvatarUrl = user?.imageUrl ?? cachedProfileImage;

  return (
    <div className="split-bill-home">
      {!isBlankState && (
        <section className="split-bill-pulse" aria-label="Split Bills balance summary">
          <div className="split-bill-pulse__metrics">
            <article>
              <span>You owe</span>
              <strong>{balancePulse.owesLabel}</strong>
            </article>
            <article>
              <span>You are owed</span>
              <strong>{balancePulse.isOwedLabel}</strong>
            </article>
            <article>
              <span>Settled bills</span>
              <strong>{balancePulse.settledCount}/{bills.length}</strong>
            </article>
          </div>
        </section>
      )}

      {duePaymentRequests.length > 0 ? (
        <section className="split-bill-due-strip panel glass" aria-label="Payment requests due soon">
          <strong>Due soon</strong>
          <div className="split-bill-due-strip__items">
            {duePaymentRequests.slice(0, 3).map(({ bill, request }) => (
              <button key={request.id} type="button" onClick={() => onOpenBill(bill.id)}>
                <span>{request.recipientName}</span>
                <small>{formatSplitBillAmount(Number(request.amount), request.currency)} · {new Date(request.dueDate!).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="split-bill-panel panel glass">
        <div className="split-bill-panel__head">
          <div>
            <h2>Bills</h2>
          </div>
        </div>
        {isBlankState ? (
          <section className="split-bill-empty-cta split-bill-panel__empty-cta" aria-label="Start splitting bills">
            <img src="/assets/3d%20icons/split%20bills.png" alt="" aria-hidden="true" />
            <h2>
              <span>Upload a receipt</span>, split the items, and track who owes what
            </h2>
            <SplitBillActionButtons
              className="split-bill-empty-cta__actions"
              onAddBill={() => window.dispatchEvent(new CustomEvent("clover:open-split-bill-add", { detail: { mode: "manual" } }))}
              onUploadReceipt={() => window.dispatchEvent(new CustomEvent("clover:open-split-bill-add", { detail: { mode: "import" } }))}
            />
          </section>
        ) : (
          <>
            <div className="split-bill-table split-bill-table--bills" role="table" aria-label="Split bills">
              <div className="split-bill-table__header" role="row">
                <span role="columnheader">Description</span>
                <span role="columnheader">Date</span>
                <span role="columnheader">People</span>
                <span role="columnheader">Total</span>
                <label className="split-bill-table__status-filter">
                  <span className="sr-only">Filter bills by status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      setStatusFilter(event.target.value as "all" | "open" | "settled");
                      setShowAllBills(false);
                    }}
                    aria-label="Filter bills by status"
                  >
                    <option value="all">Status</option>
                    <option value="open">Open</option>
                    <option value="settled">Settled</option>
                  </select>
                </label>
                <span role="columnheader" aria-hidden="true" />
              </div>
              {recentBills.length > 0 ? (
                recentBills.map((bill) => {
                  const status = buildRowStatus(bill);
                  const sourceLabel = bill.sourceType === "receipt" ? "Receipt" : "Manual";

                  return (
                    <MobileSwipeDelete key={bill.id} deleteLabel={`Delete ${bill.title}`} onDelete={() => onDeleteBill(bill.id)}>
                    <div className="split-bill-table__row split-bill-table__row--interactive" role="row">
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
                          <>
                            {bill.participants.slice(0, 5).map((participant) => (
                              <SplitBillEntityAvatar
                                key={participant.id}
                                name={participant.name}
                                avatarUrl={null}
                                sizeClass="split-bill-person-avatar--small"
                                className="split-bill-person-avatar split-bill-table__avatar"
                              />
                            ))}
                            {bill.participants.length > 5 ? (
                              <span className="split-bill-table__avatar split-bill-table__avatar-more" title={`${bill.participants.length - 5} more people`}>
                                +{bill.participants.length - 5}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="split-bill-subtle-empty">No people yet</span>
                        )}
                      </div>
                      <div role="cell">{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</div>
                      <div role="cell">
                        <span className={`split-bill-status-pill${bill.settlementStatus === "settled" ? " is-settled" : ""}`}>{status}</span>
                      </div>
                      <div role="cell" className="split-bill-table__row-action">
                        <button className="split-bill-table__chevron" type="button" aria-label={`View ${bill.title}`} onClick={() => onOpenBill(bill.id)}>
                          ›
                        </button>
                      </div>
                    </div>
                    </MobileSwipeDelete>
                  );
                })
              ) : (
                <div className="split-bill-table__empty-state">No bills in this status.</div>
              )}
            </div>
            <div className="split-bill-table__footer">
              <button className="split-bill-table__more-link" type="button" onClick={toggleBills}>
                {billToggleLabel}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="split-bill-mobile-home">
        <div className="split-bill-mobile-home__sections panel glass">
          <section className="split-bill-mobile-home__section">
            <div className="split-bill-mobile-home__section-head">
              <div>
                <h3>People</h3>
              </div>
            </div>

            <div className="split-bill-mobile-home__people">
              {visiblePeople.length > 0 ? (
                <div className="split-bill-home__people-header" aria-hidden="true">
                  <span />
                  <span>Name</span>
                  <span>Balance</span>
                </div>
              ) : null}
              {visiblePeople.length > 0 ? (
                visiblePeople.map((person) => (
                  <MobileSwipeDelete key={person.id} deleteLabel={`Delete ${person.name}`} onDelete={() => onDeletePerson(person.id)}>
                  <button type="button" className="split-bill-mobile-home__person-button" onClick={() => onOpenPerson(person.id)}>
                    <SplitBillEntityAvatar
                      name={person.name}
                      avatarUrl={isSamePersonName(person.name, currentUserName) ? currentUserAvatarUrl : person.avatarUrl}
                    />
                    <strong className="split-bill-home__person-name">{person.name}</strong>
                    <small className="split-bill-home__person-balance">{person.balanceLabel}</small>
                  </button>
                  </MobileSwipeDelete>
                ))
              ) : (
                <span className="split-bill-subtle-empty">No saved names yet</span>
              )}
            </div>
            <div className="split-bill-mobile-home__footer">
              {hasHiddenPeople ? (
                <button className="button button-secondary button-small" type="button" onClick={() => setShowAllPeople((current) => !current)}>
                  {showAllPeople ? "Show fewer" : "View all people"}
                </button>
              ) : null}
              <button className="button button-secondary button-small transactions-action-button split-bill-action-button" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-people"))}>
                <span className="split-bill-action-label split-bill-action-label--desktop">Add person</span>
                <span className="split-bill-action-label split-bill-action-label--mobile">Add</span>
              </button>
            </div>
          </section>

          <section className="split-bill-mobile-home__section">
            <div className="split-bill-mobile-home__section-head">
              <div>
                <h3>Groups</h3>
              </div>
            </div>

            <div className="split-bill-mobile-home__groups">
              {visibleGroups.length > 0 ? (
                visibleGroups.map((group) => (
                  <MobileSwipeDelete key={group.id} deleteLabel={`Delete ${group.name}`} onDelete={() => onDeleteGroup(group.id)}>
                  <button type="button" className="split-bill-mobile-group-card" onClick={() => onOpenGroup(group.id)}>
                    <div className="split-bill-mobile-group-card__head">
                      <strong className="split-bill-mobile-group-card__name">
                        <SplitBillEntityAvatar name={group.name} avatarUrl={group.avatarUrl} />
                        <span>{group.name}</span>
                      </strong>
                      <span>{group.total}</span>
                    </div>
                    <div className="split-bill-mobile-group-card__meta">
                      <span>{group.members.length} member{group.members.length === 1 ? "" : "s"}</span>
                      <span>{group.status ?? ""}</span>
                    </div>
                    <div className="split-bill-mobile-group-card__avatars">
                      {group.members.length > 0 ? (
                        group.members.map((member) => (
                          <SplitBillEntityAvatar key={member.id} name={member.name} avatarUrl={null} title={member.name} />
                        ))
                      ) : (
                        <span className="split-bill-subtle-empty">No people yet</span>
                      )}
                    </div>
                  </button>
                  </MobileSwipeDelete>
                ))
              ) : (
                <span className="split-bill-subtle-empty">No groups yet</span>
              )}
            </div>
            <div className="split-bill-mobile-home__footer">
              <button className="button button-secondary button-small transactions-action-button split-bill-action-button" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-group"))}>
                <span className="split-bill-action-label split-bill-action-label--desktop">Add group</span>
                <span className="split-bill-action-label split-bill-action-label--mobile">Add</span>
              </button>
            </div>
          </section>
        </div>
      </section>

      <div className="split-bill-desktop-home split-bill-desktop-home__secondary">
        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <div>
              <h2>Groups</h2>
            </div>
          </div>

          <div className="split-bill-home__groups-list">
            {visibleGroups.length > 0 ? (
              visibleGroups.map((group) => (
                <button key={group.id} type="button" className="split-bill-home__group-row" onClick={() => onOpenGroup(group.id)}>
                  <strong>{group.name}</strong>
                  <span>
                    {group.members.length} member{group.members.length === 1 ? "" : "s"} · {group.total}
                    {group.status ? ` · ${group.status}` : ""}
                  </span>
                </button>
              ))
            ) : (
              <span className="split-bill-subtle-empty">No groups yet</span>
            )}
          </div>
          <div className="split-bill-home__bottom-actions">
            <button className="button button-secondary button-small transactions-action-button split-bill-action-button" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-group"))}>
              Add group
            </button>
          </div>
        </section>

        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <div>
              <h2>People</h2>
            </div>
          </div>

          <div className="split-bill-home__people-list">
            {visiblePeople.length > 0 ? (
              <div className="split-bill-home__people-header" aria-hidden="true">
                <span />
                <span>Name</span>
                <span>Balance</span>
              </div>
            ) : null}
            {visiblePeople.length > 0 ? (
                visiblePeople.map((person) => (
                  <button key={person.id} type="button" className="split-bill-home__person-button" onClick={() => onOpenPerson(person.id)}>
                    <SplitBillEntityAvatar
                      name={person.name}
                      avatarUrl={isSamePersonName(person.name, currentUserName) ? currentUserAvatarUrl : person.avatarUrl}
                    />
                    <strong className="split-bill-home__person-name">{person.name}</strong>
                    <small className="split-bill-home__person-balance">{person.balanceLabel}</small>
                  </button>
                ))
            ) : (
              <span className="split-bill-subtle-empty">No saved names yet</span>
            )}
          </div>
          <div className="split-bill-home__bottom-actions">
            {hasHiddenPeople ? (
              <button className="button button-secondary button-small" type="button" onClick={() => setShowAllPeople((current) => !current)}>
                {showAllPeople ? "Show fewer" : "View all people"}
              </button>
            ) : null}
            <button className="button button-secondary button-small transactions-action-button split-bill-action-button" type="button" onClick={() => window.dispatchEvent(new Event("clover:open-split-bill-people"))}>
              Add person
            </button>
          </div>
        </section>
      </div>

      <SplitBillQrLibrary />
    </div>
  );
}
