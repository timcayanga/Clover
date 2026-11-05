export type PendingSplitBill = { id: string; title: string; currency: string; remaining: number };
export function homePendingSplitBills(bills: readonly {
  id: string; title: string; currency: string; resolved?: boolean;
  settlement: { transfers: readonly { amount: number }[] };
}[]): { count: number; bills: PendingSplitBill[] } {
  const pending = bills.filter(b => !b.resolved).map(b => ({
    id:b.id,title:b.title,currency:b.currency,
    remaining:b.settlement.transfers.reduce((sum,t)=>sum+(Number.isFinite(t.amount) && t.amount > 0 ? t.amount : 0),0),
  })).filter(b => b.remaining > 0.005);
  return {count:pending.length,bills:pending.slice(0,3)};
}
