"use client";

import { CategoryBrandMark } from "@/components/category-brand-mark";
import { InterfaceIcon } from "@/components/interface-icon";
import { splitBillBalanceSummary, isSameSplitBillPerson as isSamePersonName } from "@/lib/split-bill-balance-summary";
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
import type {
  SplitBillGroupSummary,
  SplitBillPersonSummary,
} from "@/lib/split-bill-entities";
import { readAccountIdentityCache } from "@/lib/account-identity-cache";
import { SplitBillQrLibrary } from "@/components/split-bill-qr-library";
import { MobileSwipeDelete } from "@/components/mobile-swipe-delete";

type SplitBillHomeProps = {
  tab: string;
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


const buildRowStatus = (bill: SplitBillSerializedBill) =>
  bill.settlementStatus === "open" && bill.settlement.transfers.length > 0
    ? `${bill.settlement.transfers.length} transfer${bill.settlement.transfers.length === 1 ? "" : "s"}`
    : formatSplitBillSettlementStatus(bill.settlementStatus);

const buildGroupStatus = (items: SplitBillSerializedBill[]) => {
  if (items.length === 0) return null;
  if (items.every((bill) => bill.settlementStatus === "settled"))
    return "Fully settled";
  const openStates = Array.from(
    new Set(
      items
        .filter((bill) => bill.settlementStatus !== "settled")
        .map((bill) => bill.settlementStatus),
    ),
  );
  return openStates.length === 1
    ? formatSplitBillSettlementStatus(openStates[0]!)
    : `${items.filter((bill) => bill.settlementStatus !== "settled").length} open bills`;
};

const sumBillTotals = (items: SplitBillSerializedBill[]) =>
  items.reduce(
    (sum, bill) => sum + (bill.total ? Number(bill.total) || 0 : 0),
    0,
  );

const groupBillsByCurrency = (items: SplitBillSerializedBill[]) =>
  items.reduce<Record<string, SplitBillSerializedBill[]>>((acc, bill) => {
    const key = normalizeCurrencyCode(bill.currency);
    acc[key] = acc[key] ?? [];
    acc[key].push(bill);
    return acc;
  }, {});

const addCurrencyTotal = (
  totals: Map<string, number>,
  currency: string,
  amount: number,
) => {
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
};

export function SplitBillHome({
  tab,
  bills,
  groups,
  people,
  currentUserName,
  onOpenBill,
  onOpenGroup,
  onOpenPerson,
  onDeleteBill,
  onDeleteGroup,
  onDeletePerson,
}: SplitBillHomeProps) {
  const { user } = useUser();
  const [cachedProfileImage] = useState(
    () => readAccountIdentityCache()?.imageUrl ?? null,
  );
  const [showAllBills, setShowAllBills] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "settled" | "resolved">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState("");
  const isBlankState = bills.length === 0;
  const duePaymentRequests = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return bills.filter(bill=>!bill.resolved).flatMap((bill) =>
      (bill.paymentRequests ?? [])
        .filter(
          (request) =>
            request.status === "requested" ||
            request.status === "payment_reported",
        )
        .filter((request) => {
          if (!request.dueDate) {
            return false;
          }

          const dueTime = new Date(request.dueDate).getTime();
          return dueTime >= today.getTime() && dueTime <= nextWeek;
        })
        .map((request) => ({ bill, request })),
    );
  }, [bills]);

  const balancePulse = useMemo(() => {
    const summary = splitBillBalanceSummary(bills, currentUserName);
    const openBills = bills.filter(
      (bill) => bill.settlementStatus !== "settled",
    );
    const nextTransfer = bills
      .flatMap((bill) =>
        bill.settlement.transfers.map((transfer) => ({
          ...transfer,
          billId: bill.id,
          billTitle: bill.title,
          currency: bill.currency,
          billDate: bill.billDate,
        })),
      )
      .filter(
        (transfer) =>
          isSamePersonName(transfer.fromParticipantName, currentUserName) ||
          isSamePersonName(transfer.toParticipantName, currentUserName),
      )
      .sort((left, right) => {
        const leftPriority = isSamePersonName(
          left.fromParticipantName,
          currentUserName,
        )
          ? 0
          : 1;
        const rightPriority = isSamePersonName(
          right.fromParticipantName,
          currentUserName,
        )
          ? 0
          : 1;
        return (
          leftPriority - rightPriority ||
          new Date(right.billDate).getTime() - new Date(left.billDate).getTime()
        );
      })[0];

    return {
      owesLabel: summary.youOwe,
      isOwedLabel: summary.owedToYou,
      settledCount: bills.filter((bill) => bill.settlementStatus === "settled")
        .length,
      openCount: openBills.length,
      nextTransfer,
    };
  }, [bills, currentUserName]);

  const filteredBills = useMemo(
    () =>
      bills.filter((bill) => {
        const isSettled = bill.settlementStatus === "settled";
        if (currencyFilter && bill.currency !== currencyFilter) return false;
        if (
          !`${bill.title} ${bill.group?.name ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )
          return false;
        return (
          statusFilter === "all" ||
          (statusFilter === "settled" && isSettled && !bill.resolved) ||
          (statusFilter === "resolved" && bill.resolved) ||
          (statusFilter === "open" && !isSettled && !bill.resolved)
        );
      }),
    [bills, statusFilter, currencyFilter, search],
  );

  const recentBills = showAllBills ? filteredBills : filteredBills.slice(0, 25);
  const hasHiddenBills = filteredBills.length > 25;
  const billToggleLabel =
    showAllBills && hasHiddenBills ? "Show fewer" : "Show all bills";
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
              ? formatSplitBillAmount(
                  sumBillTotals(groupBills),
                  normalizeCurrencyCode(groupBills[0]?.currency),
                )
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

        const activeTotals = Array.from(totals.entries()).filter(
          ([, amount]) => Math.abs(amount) > 0.005,
        );
        if (activeTotals.length !== 1) {
          return {
            ...person,
            balanceLabel:
              activeTotals.length > 1 ? "Multiple currencies" : "Settled",
          };
        }

        const [currency, amount] = activeTotals[0];
        return {
          ...person,
          balanceLabel: `${amount < 0 ? "Owes" : "Owed"} ${formatSplitBillAmount(Math.abs(amount), currency)}`,
        };
      }),
    [bills, people],
  );
  const visiblePeople = showAllPeople
    ? peopleWithBalances
    : peopleWithBalances.slice(0, 6);
  const hasHiddenPeople = peopleWithBalances.length > 6;
  const currentUserAvatarUrl = user?.imageUrl ?? cachedProfileImage;
  const personPhoto = (name: string) => isSamePersonName(name, currentUserName)
    ? currentUserAvatarUrl
    : people.find((person) => person.name.trim().toLowerCase() === name.trim().toLowerCase())?.avatarUrl ?? null;
  const sharedWith = (bill: SplitBillSerializedBill) => {
    const group = groups.find((entry) => entry.id === bill.groupId);
    const names = bill.participants.map((person) => person.name);
    return <span className="split-bill-shared-with">
      {bill.group ? <SplitBillEntityAvatar name={bill.group.name} avatarUrl={group?.avatarUrl || "/assets/split-bills/group-default.jpg"} /> :
        <span className="split-bill-avatar-stack">{names.slice(0, 3).map((name, index) => <SplitBillEntityAvatar key={`${name}-${index}`} name={name} avatarUrl={personPhoto(name)} />)}</span>}
      <span>{bill.group?.name ?? (names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : ""))}</span>
    </span>;
  };

  return (
    <div className="split-bill-home">
      {tab === "Bills" ? (
        <>
          <section
            className="split-bill-pulse__metrics"
            aria-label="Split Bills balance summary"
          >
            <article>
              <span>You owe</span>
              <strong>{balancePulse.owesLabel}</strong>
            </article>
            <article>
              <span>Owed to you</span>
              <strong>{balancePulse.isOwedLabel}</strong>
            </article>
          </section>
          {duePaymentRequests.length ? (
            <section className="split-bill-due-strip panel">
              <strong>Payment requests due soon</strong>
              {duePaymentRequests.slice(0, 3).map(({ bill, request }) => (
                <button
                  type="button"
                  key={request.id}
                  onClick={() => onOpenBill(bill.id)}
                >
                  {request.recipientName} ·{" "}
                  {formatSplitBillAmount(
                    Number(request.amount),
                    request.currency,
                  )}
                </button>
              ))}
            </section>
          ) : null}
          <div className="split-bill-list-toolbar">
            <input
              aria-label="Search bills"
              placeholder="Search bills"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAllBills(false);
              }}
            />
            <button
              type="button"
              className="button button-secondary app-filter-trigger"
              aria-label="Filter bills"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <img src="/assets/organize/filter.svg" width={18} height={18} alt="" />
              <span className="app-filter-trigger__label">Filters</span>
            </button>
          </div>
          {filtersOpen ? (
            <div className="split-bill-list-filters">
              <label>
                Status{" "}
                <select
                  aria-label="Filter bills by status"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="settled">Settled</option>
                  <option value="resolved">Resolved</option>
                </select>
              </label>
              <label>
                Currency{" "}
                <select
                  value={currencyFilter}
                  onChange={(e) => setCurrencyFilter(e.target.value)}
                >
                  <option value="">All currencies</option>
                  {Array.from(new Set(bills.map((b) => b.currency))).map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
          ) : null}
          {isBlankState ? (
            <section className="split-bill-empty-cta">
              <h2>No bills yet</h2>
              <p>Upload a receipt or add a split bill.</p>
              <SplitBillActionButtons
                onAddBill={() =>
                  window.dispatchEvent(
                    new CustomEvent("clover:open-split-bill-add", {
                      detail: { mode: "manual" },
                    }),
                  )
                }
                onUploadReceipt={() =>
                  window.dispatchEvent(
                    new CustomEvent("clover:open-split-bill-add", {
                      detail: { mode: "import" },
                    }),
                  )
                }
              />
            </section>
          ) : (
            <div className="split-bill-table-scroll">
              <table className="split-bill-bills-table" aria-label="Split bills">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th className="desktop-column">Date</th>
                    <th className="desktop-column">Shared with</th>
                    <th className="desktop-column">Paid by</th>
                    <th className="amount">Total</th>
                    <th className="amount">Your balance</th>
                    <th className="desktop-column">Status</th>
                    <th><span className="sr-only">Open bill</span></th>
                  </tr>
                </thead>
                <tbody>
                  {recentBills.map((bill) => {
                    const balance = bill.settlement.transfers.reduce(
                      (sum, t) =>
                        sum +
                        (isSamePersonName(t.toParticipantName, currentUserName)
                          ? t.amount
                          : 0) -
                        (isSamePersonName(
                          t.fromParticipantName,
                          currentUserName,
                        )
                          ? t.amount
                          : 0),
                      0,
                    );
                    return (
                      <tr key={bill.id}>
                        <td>
                          <button
                            type="button"
                            className="split-bill-name-link"
                            aria-label={`View ${bill.title}`}
                            onClick={() => onOpenBill(bill.id)}
                          >
                            <CategoryBrandMark categoryName={bill.transaction?.category?.name ?? "Uncategorized"} size={32} />
                            <span>{bill.title}</span>
                          </button>
                          <div className="split-bill-mobile-context"><small>{formatDate(bill.billDate)}</small>{sharedWith(bill)}</div>
                        </td>
                        <td className="desktop-column">
                          {formatDate(bill.billDate)}
                        </td>
                        <td className="desktop-column">
                          {sharedWith(bill)}
                        </td>
                        <td className="desktop-column">
                          {bill.payments
                            .map(
                              (p) =>
                                bill.participants.find(
                                  (x) => x.id === p.participantId,
                                )?.name,
                            )
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                        <td className="amount">
                          {bill.total
                            ? formatSplitBillAmount(
                                Number(bill.total),
                                bill.currency,
                              )
                            : "—"}
                        </td>
                        <td className="amount">
                          {formatSplitBillAmount(balance, bill.currency)}
                        </td>
                        <td className="desktop-column">
                          {bill.resolved ? "Resolved" : formatSplitBillSettlementStatus(
                            bill.settlementStatus,
                          )}
                        </td>
                        <td className="split-bill-open-cell"><button className="split-bill-open" type="button" aria-label={`Open ${bill.title}`} onClick={() => onOpenBill(bill.id)}>›</button></td>
                      </tr>
                    );
                  })}
                  {!recentBills.length ? (
                    <tr>
                      <td colSpan={8}>No bills match these filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
          {hasHiddenBills ? (
            <button className="button button-secondary" onClick={toggleBills}>
              {billToggleLabel}
            </button>
          ) : null}
        </>
      ) : tab === "Groups" ? (
        <>
          <div className="split-bill-group-grid">
            {visibleGroups.map((group) => (
              <article className="split-bill-group-card" key={group.id} onClick={() => onOpenGroup(group.id)}>
                <div className="split-bill-group-identity">
                  <SplitBillEntityAvatar name={group.name} avatarUrl={group.avatarUrl || "/assets/split-bills/group-default.jpg"} sizeClass="split-bill-group-photo" />
                  <strong>{group.name}</strong>
                </div>
                <div className="split-bill-avatars">
                  {group.members.slice(0, 5).map((member) => (
                    <SplitBillEntityAvatar
                      key={member.id}
                      name={member.name}
                      avatarUrl={personPhoto(member.name)}
                    />
                  ))}
                  {group.members.length > 5 ? (
                    <span>+{group.members.length - 5}</span>
                  ) : null}
                </div>
                <button
                  className="button button-secondary split-bill-group-card__open"
                  aria-label={`View group ${group.name}`}
                  onClick={(event) => { event.stopPropagation(); onOpenGroup(group.id); }}
                >
                  View Group
                </button>
              </article>
            ))}
          </div>
          {!visibleGroups.length ? <p>No groups yet.</p> : null}
          <button
            className="button button-secondary"
            onClick={() =>
              window.dispatchEvent(new Event("clover:open-split-bill-group"))
            }
          >
            Add Group
          </button>
        </>
      ) : tab === "People" ? (
        <>
          <div className="split-bill-table-scroll">
            <table aria-label="People">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="amount">Amount owed</th>
                </tr>
              </thead>
              <tbody>
                {visiblePeople.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <button
                        onClick={() => onOpenPerson(person.id)}
                        className="split-bill-avatars"
                      >
                        <SplitBillEntityAvatar
                          name={person.name}
                          avatarUrl={
                            isSamePersonName(person.name, currentUserName)
                              ? currentUserAvatarUrl
                              : person.avatarUrl
                          }
                        />
                        {person.name}
                      </button>
                    </td>
                    <td className="amount">{person.balanceLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!visiblePeople.length ? <p>No saved people yet.</p> : null}
          {hasHiddenPeople ? (
            <button
              className="button button-secondary"
              onClick={() => setShowAllPeople(!showAllPeople)}
            >
              {showAllPeople ? "Show fewer" : "View all people"}
            </button>
          ) : null}
          <button
            className="button button-secondary"
            onClick={() =>
              window.dispatchEvent(new Event("clover:open-split-bill-people"))
            }
          >
            Add People
          </button>
        </>
      ) : (
        <SplitBillQrLibrary />
      )}
    </div>
  );
}
