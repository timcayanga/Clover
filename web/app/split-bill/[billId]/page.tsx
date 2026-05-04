import Link from "next/link";
import { notFound } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillDeleteButton } from "@/components/split-bill-delete-button";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { prisma } from "@/lib/prisma";
import {
  formatSplitBillAmount,
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

export default async function SplitBillDetailPage({ params }: { params: Promise<{ billId: string }> }) {
  const user = await getSplitBillCurrentUser();
  const { billId } = await params;

  const bill = await prisma.splitBill.findFirst({
    where: {
      id: billId,
      userId: user.id,
    },
    include: billInclude,
  });

  if (!bill) {
    notFound();
  }

  const splitBill = serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]);

  return (
    <CloverShell
      active="split-bill"
      title={splitBill.title}
      kicker="Split Bill"
      subtitle="A separate mini-ledger for receipts, shares, and settlements."
      actions={
        <div className="split-bill-detail__actions">
          <Link className="button button-secondary button-small" href={`/split-bill/${splitBill.id}/edit`} prefetch={false}>
            Edit
          </Link>
          <SplitBillDeleteButton billId={splitBill.id} />
        </div>
      }
    >
      <div className="split-bill-detail">
        <section className="split-bill-detail__hero panel glass">
          <div>
            <p className="eyebrow">{splitBill.sourceType === "receipt" ? "Receipt import" : "Manual bill"}</p>
            <h1>{splitBill.title}</h1>
            <p className="panel-muted">
              {formatDate(splitBill.billDate)}
              {splitBill.group?.name ? ` · ${splitBill.group.name}` : ""}
              {splitBill.merchantName ? ` · ${splitBill.merchantName}` : ""}
            </p>
          </div>
          <div className="split-bill-detail__hero-metrics">
            <article>
              <span>Total</span>
              <strong>{splitBill.total ? formatSplitBillAmount(Number(splitBill.total), splitBill.currency) : "—"}</strong>
            </article>
            <article>
              <span>People</span>
              <strong>{splitBill.participants.length}</strong>
            </article>
            <article>
              <span>Transfers</span>
              <strong>{splitBill.settlement.transfers.length}</strong>
            </article>
          </div>
        </section>

        <div className="split-bill-detail__grid">
          <section className="split-bill-detail__panel panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Balances</p>
                <h2>Who owes what</h2>
              </div>
            </div>

            <div className="split-bill-detail__balance-list">
              {splitBill.settlement.participants.map((participant) => (
                <article key={participant.id} className="split-bill-detail__balance-card">
                  <div>
                    <strong>{participant.name}</strong>
                    <span>
                      Paid {formatSplitBillAmount(participant.paid, splitBill.currency)} · Owes {formatSplitBillAmount(participant.owed, splitBill.currency)}
                    </span>
                  </div>
                  <strong className={participant.balance >= 0 ? "is-positive" : "is-negative"}>{formatSplitBillAmount(participant.balance, splitBill.currency)}</strong>
                </article>
              ))}
            </div>

            <div className="split-bill-detail__settlement">
              <h3>Simplified settlement</h3>
              {splitBill.settlement.transfers.length > 0 ? (
                splitBill.settlement.transfers.map((transfer, index) => (
                  <div key={`${transfer.fromParticipantId}-${transfer.toParticipantId}-${index}`} className="split-bill-detail__transfer">
                    <span>
                      {transfer.fromParticipantName} pays {transfer.toParticipantName}
                    </span>
                    <strong>{formatSplitBillAmount(transfer.amount, splitBill.currency)}</strong>
                  </div>
                ))
              ) : (
                <p className="panel-muted">Everyone is already settled up.</p>
              )}
            </div>
          </section>

          <section className="split-bill-detail__panel panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Items</p>
                <h2>Receipt breakdown</h2>
              </div>
            </div>

            <div className="split-bill-detail__item-list">
              {splitBill.items.map((item) => (
                <article key={item.id} className="split-bill-detail__item">
                  <div className="split-bill-detail__item-head">
                    <strong>{item.description}</strong>
                    <span>{formatSplitBillAmount(Number(item.amount), splitBill.currency)}</span>
                  </div>
                  <div className="split-bill-detail__chips">
                    {item.participantIds.length > 0 ? (
                      item.participantIds.map((participantId) => {
                        const participant = splitBill.participants.find((entry) => entry.id === participantId);
                        return participant ? (
                          <span key={participantId} className="split-bill-detail__chip">
                            {participant.name}
                          </span>
                        ) : null;
                      })
                    ) : (
                      <span className="split-bill-detail__chip split-bill-detail__chip--neutral">All people</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="split-bill-detail__panel panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Payments</p>
                <h2>Who paid</h2>
              </div>
            </div>

            <div className="split-bill-detail__payment-list">
              {splitBill.payments.length > 0 ? (
                splitBill.payments.map((payment) => {
                  const participant = splitBill.participants.find((entry) => entry.id === payment.participantId);
                  return (
                    <article key={payment.id} className="split-bill-detail__payment">
                      <strong>{participant?.name ?? "Unknown payer"}</strong>
                      <span>{formatSplitBillAmount(Number(payment.amount), splitBill.currency)}</span>
                      {payment.note ? <p>{payment.note}</p> : null}
                    </article>
                  );
                })
              ) : (
                <p className="panel-muted">No payments were entered for this bill.</p>
              )}
            </div>
          </section>

          <section className="split-bill-detail__panel panel glass">
            <div className="split-bill-panel__head">
              <div>
                <p className="eyebrow">Bill info</p>
                <h2>Metadata</h2>
              </div>
            </div>

            <div className="split-bill-detail__meta-grid">
              <div>
                <span>Source</span>
                <strong>{splitBill.sourceType}</strong>
              </div>
              <div>
                <span>Group</span>
                <strong>{splitBill.group?.name ?? "Ad hoc"}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{splitBill.receiptConfidence}%</strong>
              </div>
              <div>
                <span>Created</span>
                <strong>{formatDate(splitBill.createdAt)}</strong>
              </div>
            </div>

            {splitBill.receiptText ? (
              <div className="split-bill-detail__receipt-text">
                <h3>Receipt text</h3>
                <pre>{splitBill.receiptText}</pre>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </CloverShell>
  );
}
