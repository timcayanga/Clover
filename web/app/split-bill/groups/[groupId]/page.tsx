import Link from "next/link";
import { notFound } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { prisma } from "@/lib/prisma";
import {
  formatSplitBillAmount,
  normalizeCurrencyCode,
  serializeSplitBillRecord,
  splitBillGroupMemberOrderBy,
  splitBillItemOrderBy,
} from "@/lib/split-bill";

export const dynamic = "force-dynamic";

const billInclude = {
  group: {
    include: {
      members: {
        orderBy: splitBillGroupMemberOrderBy,
      },
    },
  },
  participants: true,
  items: {
    include: {
      participants: true,
    },
    orderBy: splitBillItemOrderBy,
  },
  payments: true,
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

export default async function SplitBillGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const user = await getSplitBillCurrentUser();
  const { groupId } = await params;

  const [group, bills] = await Promise.all([
    prisma.splitBillGroup.findFirst({
      where: {
        id: groupId,
        userId: user.id,
      },
      include: {
        members: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        _count: {
          select: {
            bills: true,
          },
        },
      },
    }),
    prisma.splitBill.findMany({
      where: {
        userId: user.id,
        groupId,
      },
      orderBy: [{ billDate: "desc" }, { updatedAt: "desc" }],
      include: billInclude,
    }),
  ]);

  if (!group) {
    notFound();
  }

  const serializedBills = bills.map((bill) => serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]));
  const totalCurrencies = Array.from(new Set(serializedBills.map((bill) => normalizeCurrencyCode(bill.currency))));
  const summaryTotal =
    totalCurrencies.length === 0
      ? "No total"
      : totalCurrencies.length === 1
      ? formatSplitBillAmount(
          serializedBills.reduce((sum, bill) => sum + (bill.total ? Number(bill.total) || 0 : 0), 0),
          totalCurrencies[0]
        )
      : "Mixed";

  return (
    <CloverShell active="split-bill" title={group.name}>
      <div className="split-bill-home">
        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <div>
              <p className="eyebrow">Group</p>
              <h2>{group.name}</h2>
              <p className="split-bill-table__hint">All receipts in this group are shown across their original currencies.</p>
            </div>
            <Link className="button button-secondary button-small" href="/split-bill" prefetch={false}>
              Back to Split Bills
            </Link>
          </div>

          <div className="split-bill-group-detail__meta">
            <div>
              <span>People</span>
              <strong>{group.members.length}</strong>
            </div>
            <div>
              <span>Bills</span>
              <strong>{group._count?.bills ?? serializedBills.length}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{summaryTotal}</strong>
            </div>
          </div>

          <div className="split-bill-group-detail__chips">
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
        </section>

        <section className="split-bill-panel panel glass">
          <div className="split-bill-panel__head">
            <div>
              <p className="eyebrow">Split Bills</p>
              <h2>Transactions in this group</h2>
            </div>
          </div>

          {serializedBills.length > 0 ? (
            <div className="split-bill-table split-bill-table--bills" role="table" aria-label="Group split bills">
              <div className="split-bill-table__header" role="row">
                <span role="columnheader">Description</span>
                <span role="columnheader">Date</span>
                <span role="columnheader">People</span>
                <span role="columnheader">Total</span>
                <span role="columnheader">Status</span>
              </div>
              {serializedBills.map((bill) => {
                const status = bill.settlement.transfers.length > 0 ? `${bill.settlement.transfers.length} transfer${bill.settlement.transfers.length === 1 ? "" : "s"}` : "Settled";

                return (
                  <div key={bill.id} className="split-bill-table__row" role="row">
                    <div role="cell" className="split-bill-table__bill">
                      <strong>
                        <Link href={`/split-bill/${bill.id}/edit`} prefetch={false}>
                          {bill.title}
                        </Link>
                      </strong>
                      <span>{bill.sourceType === "receipt" ? "Receipt" : "Manual"}</span>
                    </div>
                    <div role="cell">{formatDate(bill.billDate)}</div>
                    <div role="cell" className="split-bill-table__chips">
                      {bill.participants.map((participant) => (
                        <span key={participant.id} className="split-bill-table__chip" title={participant.name}>
                          {getInitials(participant.name)}
                        </span>
                      ))}
                    </div>
                    <div role="cell">{bill.total ? formatSplitBillAmount(Number(bill.total), bill.currency) : "No total"}</div>
                    <div role="cell">{status}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="split-bill-empty">
              <strong>No bills in this group yet.</strong>
            </div>
          )}
        </section>
      </div>
    </CloverShell>
  );
}
