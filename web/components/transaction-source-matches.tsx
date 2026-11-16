"use client";

import Link from "next/link";
import { useState } from "react";
import type { TransactionSourceMatch, TransactionSourceMatchAction } from "../../shared/transaction-source-match";

export function TransactionSourceMatches({ matches, canCopy, busy, onReview }: {
  matches?: TransactionSourceMatch[];
  canCopy: boolean;
  busy: boolean;
  onReview: (sourceId: string, action: TransactionSourceMatchAction) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  if (!matches?.length) return null;
  return (
    <section aria-label="Matches from other sources">
      <h5>Matches from other sources</h5>
      {matches.map(match => (
        <div key={match.id}>
          <p>
            <Link href={`/transactions/${encodeURIComponent(match.id)}`}>{match.name}</Link>
            {" · "}{match.source} · {match.accountName} · {match.date.slice(0, 10)}
          </p>
          <small>{match.confirmed ? "Confirmed same purchase" : match.evidence.join(" · ")}</small>
          {!match.confirmed ? (
            <button type="button" className="button button-secondary" disabled={busy} onClick={async () => {
              setMessage("");
              try {
                await onReview(match.id, "confirmSourceMatchId");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Couldn’t confirm this match.");
              }
            }}>Same purchase</button>
          ) : null}
          {canCopy && match.canCopyLineItems ? (
            <button type="button" className="button button-secondary" disabled={busy} onClick={async () => {
              setMessage("");
              try {
                await onReview(match.id, "copyReceiptFromTransactionId");
                setMessage("Receipt line items copied.");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Couldn’t copy line items.");
              }
            }}>Copy receipt line items</button>
          ) : null}
          <button type="button" className="button button-secondary" disabled={busy} onClick={async () => {
            setMessage("");
            try {
              await onReview(match.id, "dismissSourceMatchId");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Couldn’t dismiss this match.");
            }
          }}>Not the same purchase</button>
        </div>
      ))}
      <p>Review both records before removing a duplicate. Confirming a match keeps both transactions and their totals.</p>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
