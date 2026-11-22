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

export function personBalanceColumns(bills: readonly BalanceBill[], viewer: string, person: string, fallback: string, rates: Record<string,number>) {
  const entries = bills.flatMap(bill => bill.settlement.transfers.flatMap(t => {
    const owes = isSameSplitBillPerson(t.fromParticipantName, person) && isSameSplitBillPerson(t.toParticipantName, viewer);
    const owed = isSameSplitBillPerson(t.toParticipantName, person) && isSameSplitBillPerson(t.fromParticipantName, viewer);
    return (owes || owed) && !isSameSplitBillPerson(person,viewer) ? [{currency: normalizeCurrencyCode(bill.currency), owes: owes ? t.amount : 0, owed: owed ? t.amount : 0}] : [];
  }));
  const currencies = new Set(entries.map(row=>row.currency));
  const currency = currencies.size === 1 ? entries[0].currency : fallback;
  const column = (key: "owed" | "owes") => {
    let total = 0;
    for (const row of entries) {
      if (!row[key]) continue;
      const rate = row.currency === currency ? 1 : rates[row.currency];
      if (!(rate > 0)) return "Rate unavailable";
      total += row[key] * rate;
    }
    return formatSplitBillAmount(total, currency);
  };
  return {owed:column("owed"), owes:column("owes")};
}

// Full names and their first-name aliases share a bucket. The existing matcher
// still decides each balance, including when two people have the same first name.
export function directoryPersonBalances(
  bills: readonly BalanceBill[], viewer: string, people: readonly { id: string; name: string }[],
  currency: string, rates: Record<string, number>,
) {
  const firstName = (name: string) => name.trim().toLowerCase().split(/\s+/, 1)[0];
  const billsByName = new Map<string, BalanceBill[]>();
  for (const bill of bills) {
    const names = new Set<string>();
    for (const transfer of bill.settlement.transfers) {
      if (isSameSplitBillPerson(transfer.fromParticipantName, viewer)) names.add(firstName(transfer.toParticipantName));
      if (isSameSplitBillPerson(transfer.toParticipantName, viewer)) names.add(firstName(transfer.fromParticipantName));
    }
    for (const name of names) {
      const bucket = billsByName.get(name);
      if (bucket) bucket.push(bill);
      else billsByName.set(name, [bill]);
    }
  }
  return Object.fromEntries(people.map(person => [
    person.id, personBalanceColumns(billsByName.get(firstName(person.name)) ?? [], viewer, person.name, currency, rates),
  ]));
}
