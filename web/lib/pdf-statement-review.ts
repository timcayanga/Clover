const lead = "Statement needs review.";

function location(pages: readonly number[]) {
  const valid = [...new Set(pages.filter(page => Number.isSafeInteger(page) && page > 0))].sort((a, b) => a - b);
  if (!valid.length) return "";
  if (valid.length === 1) return ` on page ${valid[0]}`;
  return ` on pages ${valid.slice(0, 5).join(", ")}${valid.length > 5 ? " and others" : ""}`;
}

export function pdfStatementReviewMessage(reason:
  "unreadable_page" | "missing_page" | "duplicate_page" | "ambiguous_date" | "unmatched_account" | "balance_disagreement" | "row_disagreement",
  pages: readonly number[] = [],
) {
  const where = location(pages);
  switch (reason) {
    case "unreadable_page": return `${lead} Clover couldn’t read the transaction details${where}. Export a fresh PDF from your bank or upload a clearer copy of the full statement.`;
    case "missing_page": return `${lead} The statement is missing pages or they’re out of order. Upload the complete PDF in page order.`;
    case "duplicate_page": return `${lead} Clover found a repeated copy${where}. Upload the complete PDF with each page included once.`;
    case "ambiguous_date": return `${lead} A transaction date${where} couldn’t be verified. Check the transaction date against the posting date and upload the original bank PDF or a CSV with full dates.`;
    case "unmatched_account": return `${lead} Clover couldn’t verify which account or card these transactions belong to${where}. Export the statement for that account with its account or masked card number visible.`;
    case "balance_disagreement": return `${lead} The transaction amounts and printed balances disagree. Check for missing pages or export a fresh statement from your bank.`;
    case "row_disagreement": return `${lead} Clover couldn’t verify every transaction${where}. Check for missing or cropped rows and upload the original bank PDF or CSV.`;
  }
}
