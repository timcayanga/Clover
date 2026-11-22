import { participantName, personKey, remainingDebts } from "./split-debts";
import {
  splitItemTotals,
  type SplitItem,
  type SplitPerson,
} from "./split-bill-experience";

type LedgerBill = Parameters<typeof remainingDebts>[0][number] & {
  id: string;
  title: string;
  categoryName?: string | null;
  participants?: SplitPerson[];
  items?: SplitItem[];
};

export function personLedger(
  bills: LedgerBill[],
  name: string,
  viewer: string,
) {
  const person = personKey(name);
  const totals = new Map<string, { owed: number; owes: number }>();
  const rows = bills.flatMap((bill) => {
    const participants = bill.participants ?? [];
    const member = participants.find(
      (p) => personKey(participantName(bill, p.name)) === person,
    );
    if (!member) return [];
    const self = personKey(participantName(bill, viewer));
    let owed = 0,
      owes = 0;
    for (const debt of remainingDebts([bill])) {
      if (self === person) continue;
      if (personKey(debt.from) === self && personKey(debt.to) === person)
        owed += debt.cents;
      if (personKey(debt.from) === person && personKey(debt.to) === self)
        owes += debt.cents;
    }
    const total = totals.get(bill.currency) ?? { owed: 0, owes: 0 };
    totals.set(bill.currency, {
      owed: total.owed + owed,
      owes: total.owes + owes,
    });
    const items = (bill.items ?? [])
      .filter((item) => item.participantIds.includes(member.id))
      .map((item) => ({
        name: item.description,
        amount: splitItemTotals(participants, [item])[member.id],
      }));
    return [
      {
        id: bill.id,
        title: bill.title,
        categoryName: bill.categoryName,
        currency: bill.currency,
        items,
        owed,
        owes,
      },
    ];
  });
  return {
    rows,
    totals: Array.from(totals, ([currency, t]) => ({
      currency,
      ...t,
      net: t.owes - t.owed,
    })),
  };
}

export function netDebtLabel(name: string, net: number, formatted: string) {
  return net > 0
    ? `${name} owes you ${formatted}.`
    : net < 0
      ? `You owe ${name} ${formatted}.`
      : "All settled.";
}
