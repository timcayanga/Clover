"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { formatCurrencyAmount } from "@/lib/currency-format";
import type { HomeReviewTransaction } from "@/components/home-transaction-review-card";

const HomeTransactionDetailModal = dynamic(
  () => import("@/components/home-transaction-review-card").then((module) => module.HomeTransactionDetailModal),
  { ssr: false }
);

const prefetchDetail = (transactionId: string) => {
  void import("@/components/home-transaction-review-card")
    .then((module) => module.prefetchHomeTransactionDetail(transactionId))
    .catch(() => undefined);
};

export function HomeTransactionReviewLauncher({ transactions }: { transactions: HomeReviewTransaction[] }) {
  const [selected, setSelected] = useState<HomeReviewTransaction | null>(null);

  return (
    <>
      <div className="dashboard-home__action-list">
        {transactions.map((transaction) => (
          <div className="dashboard-home__action-row" key={transaction.id}>
            <span className="dashboard-home__review-dot" aria-hidden="true" />
            <div className="dashboard-home__action-row-copy">
              <strong>{transaction.title}</strong>
              <small>
                {new Date(transaction.date).toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
                {" · "}{formatCurrencyAmount(Math.abs(Number(transaction.amount)), transaction.currency)}
              </small>
              <small className="dashboard-home__review-reason">{transaction.reviewReasons.join(" · ")}</small>
            </div>
            <button
              className="dashboard-home__mini-action"
              type="button"
              onPointerEnter={() => prefetchDetail(transaction.id)}
              onFocus={() => prefetchDetail(transaction.id)}
              onClick={() => setSelected(transaction)}
            >
              Review
            </button>
          </div>
        ))}
      </div>
      {selected ? <HomeTransactionDetailModal selected={selected} onClose={() => setSelected(null)} /> : null}
    </>
  );
}
