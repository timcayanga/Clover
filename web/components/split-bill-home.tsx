"use client";

import { InterfaceIcon } from "@/components/interface-icon";
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
  const normalize = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");
  const leftName = normalize(left);
  const rightName = normalize(right);
  if (!leftName || !rightName) return false;
  if (leftName === rightName) return true;
  const leftParts = leftName.split(" ");
  const rightParts = rightName.split(" ");
  return (
    leftParts[0] === rightParts[0] &&
    (leftParts.length === 1 || rightParts.length === 1)
  );
};

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

const formatCurrencyTotals = (
  totals: Map<string, number>,
  fallbackCurrency = "PHP",
) => {
  const entries = Array.from(totals.entries()).filter(
    ([, amount]) => Math.abs(amount) > 0.005,
  );

  if (entries.length === 0) {
    return formatSplitBillAmount(0, fallbackCurrency);
  }

  if (entries.length > 1) {
    return "Mixed";
  }

  const [currency, amount] = entries[0];
  return formatSplitBillAmount(amount, currency);
};

const addCurrencyTotal = (
  totals: Map<string, number>,
  currency: string,
  amount: number,
) => {
  totals.set(currency, (totals.get(currency) ?? 0) + amount);
};

export function SplitBillHome({
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
  const [tab, setTab] = useState("Bills");
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
    const owes = new Map<string, number>();
    const isOwed = new Map<string, number>();
    const fallbackCurrency = normalizeCurrencyCode(bills[0]?.currency ?? "PHP");
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

  return (
    <div className="split-bill-home">
      <div
        className="split-bill-tabs"
        role="tablist"
        aria-label="Split Bills sections"
      >
        {["Bills", "Groups", "People", "Payment options"].map((name) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === name}
            key={name}
            onClick={() => setTab(name)}
          >
            <InterfaceIcon name="details" size={16} />
            {name}
          </button>
        ))}
      </div>
      {tab === "Bills" ? (
        <>
          <section
            className="split-bill-pulse__metrics"
            aria-label="Split Bills balance summary"
          >
            <article>
              <span>You owe</span>
              <strong>{balancePulse.owesLabel}</strong>
              <small>Across open bills</small>
            </article>
            <article>
              <span>Owed to you</span>
              <strong>{balancePulse.isOwedLabel}</strong>
              <small>Across open bills</small>
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
              className="button button-secondary"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filters
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
              <table aria-label="Split bills">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th className="desktop-column">Date</th>
                    <th className="desktop-column">Group</th>
                    <th className="desktop-column">Paid by</th>
                    <th className="amount">Total</th>
                    <th className="amount">Your balance</th>
                    <th>Status</th>
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
                            aria-label={`View ${bill.title}`}
                            onClick={() => onOpenBill(bill.id)}
                          >
                            {bill.title}
                          </button>
                        </td>
                        <td className="desktop-column">
                          {formatDate(bill.billDate)}
                        </td>
                        <td className="desktop-column">
                          {bill.group?.name ?? "—"}
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
                        <td>
                          {bill.resolved ? "Resolved" : formatSplitBillSettlementStatus(
                            bill.settlementStatus,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!recentBills.length ? (
                    <tr>
                      <td colSpan={7}>No bills match these filters.</td>
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
              <article className="split-bill-group-card" key={group.id}>
                <strong>{group.name}</strong>
                <div className="split-bill-avatars">
                  {group.members.slice(0, 5).map((member) => (
                    <SplitBillEntityAvatar
                      key={member.id}
                      name={member.name}
                      avatarUrl={null}
                    />
                  ))}
                  {group.members.length > 5 ? (
                    <span>+{group.members.length - 5}</span>
                  ) : null}
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => onOpenGroup(group.id)}
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
