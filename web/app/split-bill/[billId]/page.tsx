import { notFound } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SplitBillDeleteButton } from "@/components/split-bill-delete-button";
import { getSplitBillCurrentUser } from "@/lib/split-bill-access";
import { loadSplitBillBill } from "@/lib/split-bill-loaders";
import {
  formatSplitBillAmount,
  serializeSplitBillRecord,
} from "@/lib/split-bill";

export const dynamic = "force-dynamic";

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export default async function SplitBillDetailPage({ params }: { params: Promise<{ billId: string }> }) {
  const user = await getSplitBillCurrentUser();
  const { billId } = await params;

  const bill = await loadSplitBillBill(user.id, billId);

  if (!bill) {
    notFound();
  }

  const splitBill = serializeSplitBillRecord(bill as Parameters<typeof serializeSplitBillRecord>[0]);
  const receiptAccountMatch = isRecord(splitBill.rawPayload?.receiptAccountMatch)
    ? splitBill.rawPayload.receiptAccountMatch
    : null;
  const receiptAccountMatchName =
    receiptAccountMatch && typeof receiptAccountMatch.accountName === "string" ? receiptAccountMatch.accountName : null;
  const receiptAccountMatchLast4 =
    receiptAccountMatch && typeof receiptAccountMatch.accountLast4 === "string" ? receiptAccountMatch.accountLast4 : null;
  const receiptAccountMatchConfidence =
    receiptAccountMatch && typeof receiptAccountMatch.confidence === "number" ? receiptAccountMatch.confidence : null;
  const receiptAccountMatchReason =
    receiptAccountMatch && typeof receiptAccountMatch.reason === "string" ? receiptAccountMatch.reason : null;
  const receiptAccountResolution = isRecord(splitBill.rawPayload?.receiptAccountResolution)
    ? splitBill.rawPayload.receiptAccountResolution
    : null;
  const receiptAccountResolutionName =
    receiptAccountResolution && typeof receiptAccountResolution.accountName === "string"
      ? receiptAccountResolution.accountName
      : null;
  const receiptAccountResolutionLast4 =
    receiptAccountResolution && typeof receiptAccountResolution.accountLast4 === "string"
      ? receiptAccountResolution.accountLast4
      : null;
  const receiptAccountResolutionConfidence =
    receiptAccountResolution && typeof receiptAccountResolution.confidence === "number"
      ? receiptAccountResolution.confidence
      : null;
  const receiptAccountResolutionReason =
    receiptAccountResolution && typeof receiptAccountResolution.reason === "string"
      ? receiptAccountResolution.reason
      : null;
  const receiptPaymentMethod =
    splitBill.rawPayload && typeof splitBill.rawPayload.paymentMethod === "string"
      ? splitBill.rawPayload.paymentMethod
      : null;
  const receiptPayerName =
    splitBill.rawPayload && typeof splitBill.rawPayload.receiptPayerName === "string"
      ? splitBill.rawPayload.receiptPayerName
      : null;
  const receiptCurrencyWarning =
    splitBill.rawPayload && typeof splitBill.rawPayload.receiptCurrencyWarning === "string"
      ? splitBill.rawPayload.receiptCurrencyWarning
      : null;
  const receiptSummary = isRecord(splitBill.rawPayload?.receiptSummary) ? splitBill.rawPayload.receiptSummary : null;
  const receiptSummaryServiceCharge =
    receiptSummary && typeof receiptSummary.serviceCharge === "string" ? receiptSummary.serviceCharge : null;
  const receiptSummaryRounding =
    receiptSummary && typeof receiptSummary.rounding === "string" ? receiptSummary.rounding : null;
  const receiptAccountMatchLabel = receiptAccountMatchName
    ? receiptAccountMatchLast4
      ? `${receiptAccountMatchName} ${receiptAccountMatchLast4}`
      : receiptAccountMatchName
    : null;

  return (
    <CloverShell
      active="split-bill"
      title={splitBill.title}
      kicker="Split Bill"
      subtitle="A separate mini-ledger for receipts, shares, and settlements."
      actions={
        <div className="split-bill-detail__actions">
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
              <span>Status</span>
              <strong>
                {splitBill.settlement.transfers.length === 0
                  ? splitBill.payments.length > 0
                    ? "No open transfers"
                    : "Awaiting allocation"
                  : `${splitBill.settlement.transfers.length} transfer${splitBill.settlement.transfers.length === 1 ? "" : "s"}`}
              </strong>
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

            {(splitBill.subtotal || splitBill.tax || splitBill.tip || splitBill.discount || splitBill.total) ? (
              <div className="split-bill-detail__receipt-match">
                <h3>Receipt totals</h3>
                <div className="split-bill-detail__meta-grid">
                  <div>
                    <span>Subtotal</span>
                    <strong>{splitBill.subtotal ? formatSplitBillAmount(Number(splitBill.subtotal), splitBill.currency) : "—"}</strong>
                  </div>
                  <div>
                    <span>Service charge</span>
                    <strong>
                      {receiptSummaryServiceCharge ? formatSplitBillAmount(Number(receiptSummaryServiceCharge), splitBill.currency) : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Tax</span>
                    <strong>{splitBill.tax ? formatSplitBillAmount(Number(splitBill.tax), splitBill.currency) : "—"}</strong>
                  </div>
                  <div>
                    <span>Tip</span>
                    <strong>{splitBill.tip ? formatSplitBillAmount(Number(splitBill.tip), splitBill.currency) : "—"}</strong>
                  </div>
                  <div>
                    <span>Rounding</span>
                    <strong>{receiptSummaryRounding ? formatSplitBillAmount(Number(receiptSummaryRounding), splitBill.currency) : "—"}</strong>
                  </div>
                  <div>
                    <span>Discount</span>
                    <strong>{splitBill.discount ? formatSplitBillAmount(Number(splitBill.discount), splitBill.currency) : "—"}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>{splitBill.total ? formatSplitBillAmount(Number(splitBill.total), splitBill.currency) : "—"}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            {splitBill.sourceType === "receipt" ? (
              <div className="split-bill-detail__receipt-match">
                <h3>Receipt match</h3>
                <strong>{receiptAccountMatchLabel ?? "No clear account match"}</strong>
                <p className="panel-muted">
                  {receiptAccountMatchReason ?? "Clover keeps the receipt account clue in the saved bill for review."}
                </p>
                {receiptAccountMatchConfidence !== null ? (
                  <span className="split-bill-detail__receipt-confidence">{receiptAccountMatchConfidence}% confidence</span>
                ) : null}
              </div>
            ) : null}

            {splitBill.sourceType === "receipt" && receiptAccountResolutionName ? (
              <div className="split-bill-detail__receipt-match">
                <h3>Matched account</h3>
                <strong>
                  {receiptAccountResolutionName}
                  {receiptAccountResolutionLast4 ? ` ${receiptAccountResolutionLast4}` : ""}
                </strong>
                <p className="panel-muted">{receiptAccountResolutionReason ?? "Resolved against saved accounts."}</p>
                {receiptAccountResolutionConfidence !== null ? (
                  <span className="split-bill-detail__receipt-confidence">
                    {receiptAccountResolutionConfidence}% confidence
                  </span>
                ) : null}
              </div>
            ) : null}

            {splitBill.sourceType === "receipt" && receiptPaymentMethod ? (
              <div className="split-bill-detail__receipt-match">
                <h3>Receipt payment method</h3>
                <strong>{receiptPaymentMethod}</strong>
                <p className="panel-muted">Stored from the receipt text so the original payment wording stays visible.</p>
              </div>
            ) : null}

            {splitBill.sourceType === "receipt" && receiptPayerName ? (
              <div className="split-bill-detail__receipt-match">
                <h3>Receipt payer</h3>
                <strong>{receiptPayerName}</strong>
                <p className="panel-muted">Stored from the receipt text when the payer is explicitly stated.</p>
              </div>
            ) : null}

            {splitBill.sourceType === "receipt" && receiptCurrencyWarning ? (
              <div className="split-bill-detail__receipt-match">
                <h3>Currency warning</h3>
                <strong>{receiptCurrencyWarning}</strong>
                <p className="panel-muted">Mixed-currency receipts are kept reviewable instead of being flattened.</p>
              </div>
            ) : null}

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
