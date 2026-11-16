"use client";

import { formatSplitBillAmount, type SplitBillSerializedBill } from "@/lib/split-bill";

type SplitBillDetailToolsProps = {
  bills: SplitBillSerializedBill[];
  label: string;
  view: "insights" | "receipts";
};

const numericTotal = (bill: SplitBillSerializedBill) => {
  const value = Number(bill.total ?? bill.settlement.totalSpent);
  return Number.isFinite(value) ? value : 0;
};

const csvCell = (value: string | number) => `"${String(value).replaceAll("\"", "\"\"")}"`;

const downloadFile = (content: BlobPart, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const safeExportName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "split-bills";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

const buildCurrencyTotals = (bills: SplitBillSerializedBill[]) => {
  const totals = new Map<string, number>();
  bills.forEach((bill) => totals.set(bill.currency, (totals.get(bill.currency) ?? 0) + numericTotal(bill)));
  return [...totals.entries()].sort((left, right) => right[1] - left[1]);
};

const getPayerSummary = (bill: SplitBillSerializedBill) =>
  bill.payments
    .filter((payment) => Number(payment.amount) > 0)
    .map((payment) => bill.participants.find((participant) => participant.id === payment.participantId)?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");

export function SplitBillDetailTools({ bills, label, view }: SplitBillDetailToolsProps) {
  const currencyTotals = buildCurrencyTotals(bills);
  const settledBills = bills.filter((bill) => bill.settlementStatus === "settled");
  const largestBill = bills.slice().sort((left, right) => numericTotal(right) - numericTotal(left))[0] ?? null;
  const receipts = bills.filter((bill) => bill.receiptFileName);
  const payerTotals = new Map<string, { name: string; amount: number; currency: string }>();
  bills.forEach((bill) => {
    bill.payments.forEach((payment) => {
      const payer = bill.participants.find((participant) => participant.id === payment.participantId)?.name;
      const amount = Number(payment.amount);
      if (!payer || !Number.isFinite(amount) || amount <= 0) return;
      const key = `${bill.currency}:${payer}`;
      const existing = payerTotals.get(key);
      payerTotals.set(key, {
        name: payer,
        amount: (existing?.amount ?? 0) + amount,
        currency: bill.currency,
      });
    });
  });
  const topPayers = [...payerTotals.values()].sort((left, right) => right.amount - left.amount).slice(0, 4);

  const exportCsv = () => {
    const rows = [
      ["Description", "Date", "Currency", "Total", "People", "Paid by", "Status", "Receipt"],
      ...bills.map((bill) => [
        bill.title,
        bill.billDate.slice(0, 10),
        bill.currency,
        numericTotal(bill).toFixed(2),
        bill.participants.map((participant) => participant.name).join("; "),
        getPayerSummary(bill),
        bill.settlementStatus.replaceAll("_", " "),
        bill.receiptFileName ?? "",
      ]),
    ];
    downloadFile(
      rows.map((row) => row.map(csvCell).join(",")).join("\n"),
      `${safeExportName(label)}-split-bills.csv`,
      "text/csv;charset=utf-8"
    );
  };

  const printSummary = () => {
    const popup = window.open("", "_blank");
    if (!popup) return;
    const totalMarkup = currencyTotals
      .map(([currency, total]) => `<strong>${escapeHtml(formatSplitBillAmount(total, currency))}</strong>`)
      .join(" · ");
    const rows = bills
      .map(
        (bill) => `<tr><td>${escapeHtml(bill.title)}</td><td>${escapeHtml(bill.billDate.slice(0, 10))}</td><td>${escapeHtml(
          bill.participants.map((participant) => participant.name).join(", ")
        )}</td><td>${escapeHtml(formatSplitBillAmount(numericTotal(bill), bill.currency))}</td><td>${escapeHtml(
          bill.settlementStatus.replaceAll("_", " ")
        )}</td></tr>`
      )
      .join("");
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(label)} settlement summary</title><style>
      body{font-family:Arial,sans-serif;color:#17202b;margin:40px}h1{margin-bottom:4px}.meta{color:#667085;margin-bottom:28px}
      .summary{display:flex;gap:24px;margin:20px 0;padding:18px;border:1px solid #dbe5e8;border-radius:14px}
      table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px;border-bottom:1px solid #e7ecef;font-size:13px}
      th{color:#667085;text-transform: capitalize;font-size:11px}@media print{button{display:none}}
    </style></head><body><h1>${escapeHtml(label)}</h1><div class="meta">Split Bills settlement summary</div>
      <div class="summary"><span>${bills.length} bills</span><span>${settledBills.length} settled</span><span>${totalMarkup || "No recorded total"}</span></div>
      <table><thead><tr><th>Description</th><th>Date</th><th>People</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.addEventListener("load",()=>window.print())</script></body></html>`);
    popup.document.close();
  };

  const exportImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext("2d");
    if (!context) return;
    const gradient = context.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, "#eefbfd");
    gradient.addColorStop(1, "#dff8ef");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 630);
    context.fillStyle = "#08a9bf";
    context.font = "700 28px Arial";
    context.fillText("clover · split bills", 70, 78);
    context.fillStyle = "#17202b";
    context.font = "700 52px Arial";
    context.fillText(label.slice(0, 32), 70, 155);
    context.font = "400 24px Arial";
    context.fillStyle = "#667085";
    context.fillText(`${bills.length} bills · ${settledBills.length} settled`, 70, 198);
    currencyTotals.slice(0, 3).forEach(([currency, total], index) => {
      const x = 70 + index * 350;
      context.fillStyle = "rgba(255,255,255,.82)";
      context.beginPath();
      context.roundRect(x, 245, 320, 150, 24);
      context.fill();
      context.fillStyle = "#667085";
      context.font = "700 18px Arial";
      context.fillText(currency, x + 28, 290);
      context.fillStyle = "#17202b";
      context.font = "700 34px Arial";
      context.fillText(formatSplitBillAmount(total, currency), x + 28, 345);
    });
    context.fillStyle = "#344054";
    context.font = "400 22px Arial";
    context.fillText(
      largestBill ? `Largest expense: ${largestBill.title} · ${formatSplitBillAmount(numericTotal(largestBill), largestBill.currency)}` : "No expenses yet",
      70,
      475
    );
    context.fillStyle = "#667085";
    context.font = "400 18px Arial";
    context.fillText("Generated from Clover. Payment settlement remains between group members.", 70, 555);
    canvas.toBlob((blob) => {
      if (blob) downloadFile(blob, `${safeExportName(label)}-summary.png`, "image/png");
    }, "image/png");
  };

  if (view === "receipts") {
    return (
      <div className="split-bill-receipt-gallery">
        <div className="split-bill-detail-tools__head">
          <div>
            <strong>Receipt proof</strong>
            <span>{receipts.length} attached receipt{receipts.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        {receipts.length > 0 ? (
          <div className="split-bill-receipt-gallery__grid">
            {receipts.map((bill) => {
              const originalAvailable = Boolean(bill.receiptStorageKey);
              const receiptUrl = `/api/split-bills/${bill.id}/receipt`;
              return (
                <article key={bill.id} className="split-bill-receipt-card">
                  <div className="split-bill-receipt-card__preview">
                    {originalAvailable && bill.receiptMimeType?.startsWith("image/") ? (
                      <img src={receiptUrl} alt={`Receipt for ${bill.title}`} />
                    ) : (
                      <span>{bill.receiptMimeType === "application/pdf" ? "PDF" : "Receipt"}</span>
                    )}
                  </div>
                  <div>
                    <strong>{bill.title}</strong>
                    <span>{bill.receiptFileName}</span>
                    <small>{bill.billDate.slice(0, 10)} · {formatSplitBillAmount(numericTotal(bill), bill.currency)}</small>
                  </div>
                  <div className="split-bill-receipt-card__actions">
                    {originalAvailable ? (
                      <>
                        <a className="button button-secondary button-small" href={receiptUrl} target="_blank" rel="noreferrer">Open</a>
                        <a className="button button-secondary button-small" href={`${receiptUrl}?download=1`}>Download</a>
                      </>
                    ) : (
                      <small>Original file was not retained for this older bill.</small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="split-bill-detail-modal__empty">Receipt proof will appear here after a receipt is uploaded.</p>
        )}
      </div>
    );
  }

  return (
    <div className="split-bill-insights">
      <div className="split-bill-detail-tools__head">
        <div>
          <strong>Insights</strong>
          <span>A compact view of spending and settlement progress.</span>
        </div>
        <div className="split-bill-detail-tools__actions">
          <button className="button button-secondary button-small" type="button" onClick={exportCsv}>CSV</button>
          <button className="button button-secondary button-small" type="button" onClick={printSummary}>Print / PDF</button>
          <button className="button button-primary button-small" type="button" onClick={exportImage}>Share image</button>
        </div>
      </div>
      <div className="split-bill-insights__metrics">
        <article><span>Total spent</span><strong>{currencyTotals.map(([currency, total]) => formatSplitBillAmount(total, currency)).join(" · ") || "No expenses"}</strong></article>
        <article><span>Settlement progress</span><strong>{settledBills.length}/{bills.length} bills</strong></article>
        <article><span>Largest expense</span><strong>{largestBill ? formatSplitBillAmount(numericTotal(largestBill), largestBill.currency) : "No expenses"}</strong><small>{largestBill?.title ?? ""}</small></article>
        <article><span>Receipt coverage</span><strong>{receipts.length}/{bills.length} bills</strong></article>
      </div>
      <div className="split-bill-insights__section">
        <strong>Top contributors</strong>
        {topPayers.length > 0 ? (
          topPayers.map((value) => (
            <div key={`${value.currency}:${value.name}`}><span>{value.name}</span><strong>{formatSplitBillAmount(value.amount, value.currency)}</strong></div>
          ))
        ) : (
          <span className="split-bill-subtle-empty">Contributions will appear after payments are assigned.</span>
        )}
      </div>
    </div>
  );
}
