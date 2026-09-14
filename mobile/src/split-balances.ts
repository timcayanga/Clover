type BalanceBill = {
  currency: string;
  settlementStatus: string;
  settlement?: {
    participants: { name: string }[];
    transfers: {
      fromParticipantName: string;
      toParticipantName: string;
      amount: number;
    }[];
  };
};

// Participant balances describe the original allocation. Transfers describe
// what remains after recorded settlements, including partial payments.
export function outstandingSplitBalances(bills: BalanceBill[]) {
  const balances = new Map<string, Map<string, number>>();
  const add = (name: string, currency: string, amount: number) => {
    const totals = balances.get(name) ?? new Map<string, number>();
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
    balances.set(name, totals);
  };
  for (const bill of bills) {
    for (const participant of bill.settlement?.participants ?? []) {
      add(participant.name, bill.currency, 0);
    }
    if (bill.settlementStatus === "settled") continue;
    for (const transfer of bill.settlement?.transfers ?? []) {
      add(transfer.fromParticipantName, bill.currency, -transfer.amount);
      add(transfer.toParticipantName, bill.currency, transfer.amount);
    }
  }
  return balances;
}
