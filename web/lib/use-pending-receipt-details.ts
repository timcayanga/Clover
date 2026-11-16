"use client";
import { useEffect, useRef } from "react";
import { needsReceiptDetailRefresh, type ReceiptRefreshSource } from "@/lib/pending-receipt-details";
import { parseReceiptLineItemsFromPayload } from "@/lib/receipt-line-items";

// Poll only a newly imported receipt whose core arrived before its item detail.
// No list-wide polling, and no endless polling of receipts that have no items.
export function usePendingReceiptDetails<T extends ReceiptRefreshSource>(
  transaction: T | null,
  onReady: (fresh: T, baseline: T) => void
) {
  const callback = useRef(onReady);
  callback.current = onReady;
  const enabled = needsReceiptDetailRefresh(transaction);
  const id = transaction?.id;
  useEffect(() => {
    if (!enabled || !transaction) return;
    const baseline = transaction;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + 60_000;
    async function poll() {
      try {
        if (document.visibilityState === "visible") {
          const response = await fetch(`/api/transactions/${encodeURIComponent(baseline.id)}?receiptRefresh=1`, {
            cache: "no-store", signal: controller.signal,
          });
          if (response.status === 401 || response.status === 403 || response.status === 404) return;
          if (response.ok) {
            const payload = await response.json();
            const fresh = payload.transaction as T | undefined;
            if (fresh?.id === baseline.id && parseReceiptLineItemsFromPayload(fresh.rawPayload, fresh.normalizedPayload).length > 0) {
              if (!controller.signal.aborted) callback.current(fresh, baseline);
              return;
            }
          }
        }
      } catch { /* The existing core stays usable during a transient failure. */ }
      if (!controller.signal.aborted && Date.now() < deadline) timer = setTimeout(poll, 1000);
    }
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
    // Baseline intentionally stays fixed so an in-flight refresh cannot replace edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, enabled]);
}
