import { formatSplitBillAmount, normalizeCurrencyCode } from "./split-bill";

type BalanceBill = {
  currency: string;
  settlement: { transfers: { fromParticipantName: string; toParticipantName: string; amount: number }[] };
};

export const isSameSplitBillPerson = (left: string, right: string) => {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const a = normalize(left), b = normalize(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aa = a.split(" "), bb = b.split(" ");
  return aa[0] === bb[0] && (aa.length === 1 || bb.length === 1);
};

// Summarize the complete authorized web workspace, never a native list page.
// Keep currencies separate; settlements have already been applied by the serializer.
export function splitBillBalanceSummary(bills: readonly BalanceBill[], currentUserName: string) {
  const owes = new Map<string, number>(), owed = new Map<string, number>();
  const fallback = normalizeCurrencyCode(bills[0]?.currency ?? "PHP");
  for (const bill of bills) {
    const currency = normalizeCurrencyCode(bill.currency);
    for (const transfer of bill.settlement.transfers) {
      if (isSameSplitBillPerson(transfer.fromParticipantName, currentUserName))
        owes.set(currency, (owes.get(currency) ?? 0) + transfer.amount);
      if (isSameSplitBillPerson(transfer.toParticipantName, currentUserName))
        owed.set(currency, (owed.get(currency) ?? 0) + transfer.amount);
    }
  }
  const label = (totals: Map<string, number>) => {
    const entries = [...totals].filter(([, amount]) => Math.abs(amount) > 0.005);
    if (!entries.length) return formatSplitBillAmount(0, fallback);
    if (entries.length > 1) return "Mixed";
    return formatSplitBillAmount(entries[0][1], entries[0][0]);
  };
  return { youOwe: label(owes), owedToYou: label(owed) };
}
