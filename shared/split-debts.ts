type GroupIdentity = {
  recorder?: string;
  group?: {
    id?: string;
    members?: { name: string; previousNames?: string[] }[];
  } | null;
};
type DebtBill = GroupIdentity & {
  currency: string;
  recorder?: string;
  resolved?: boolean;
  settlementStatus: string;
  settlement?: {
    transfers: {
      fromParticipantName: string;
      toParticipantName: string;
      amount: number;
    }[];
  };
};
export type Debt = {
  from: string;
  to: string;
  cents: number;
  currency: string;
};
export const personKey = (name: string) =>
  name.trim().replace(/\s+/g, " ").toLowerCase();
export function participantName(bill: GroupIdentity, name: string) {
  const canonical =
    /^(you|me)$/i.test(name.trim()) && bill.recorder ? bill.recorder : name;
  const member = bill.group?.members?.find((m) =>
    [m.name, ...(m.previousNames ?? [])].some(
      (n) => personKey(n) === personKey(canonical),
    ),
  );
  return member?.name ?? canonical;
}
export function remainingDebts(bills: DebtBill[]): Debt[] {
  return bills.flatMap((bill) =>
    bill.resolved || bill.settlementStatus === "settled"
      ? []
      : (bill.settlement?.transfers ?? [])
          .map((t) => ({
            from: participantName(bill, t.fromParticipantName),
            to: participantName(bill, t.toParticipantName),
            cents: Math.round(t.amount * 100),
            currency: bill.currency,
          }))
          .filter((t) => t.cents > 0),
  );
}
// Work in stored hundredths and settle each currency independently.
export function simplifyDebts(debts: Debt[]): Debt[] {
  const currencies = new Map<
    string,
    Map<string, { name: string; net: number }>
  >();
  for (const { from, to, currency, cents } of debts) {
    const totals = currencies.get(currency) ?? new Map();
    currencies.set(currency, totals);
    for (const [name, delta] of [
      [from, -cents],
      [to, cents],
    ] as const) {
      const key = personKey(name);
      const entry = totals.get(key) ?? { name, net: 0 };
      entry.net += delta;
      totals.set(key, entry);
    }
  }
  const result: Debt[] = [];
  for (const [currency, totals] of currencies) {
    const ordered = [...totals.values()].sort(
      (a, b) =>
        Math.abs(b.net) - Math.abs(a.net) || a.name.localeCompare(b.name),
    );
    const creditors = ordered.filter((p) => p.net > 0);
    let index = 0;
    for (const debtor of ordered.filter((p) => p.net < 0)) {
      while (debtor.net < 0) {
        const creditor = creditors[index];
        const cents = Math.min(-debtor.net, creditor.net);
        result.push({ from: debtor.name, to: creditor.name, cents, currency });
        debtor.net += cents;
        creditor.net -= cents;
        if (!creditor.net) index++;
      }
    }
  }
  return result;
}
