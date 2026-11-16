/** Plan a user-authorized account reconciliation without modifying confirmed rows. */
export type ReconcileRow = { id:string; date:Date|string; amount:unknown; currency:string; type:string; reviewStatus:string; isExcluded:boolean; deletedAt:unknown };
export function planBankReconciliation(source:ReconcileRow[], target:ReconcileRow[]) {
  const claimed = new Set<string>();
  return source.map(row => {
    if (row.reviewStatus === 'confirmed' || row.reviewStatus === 'edited') throw new Error('Source has confirmed edits; manual reconciliation required.');
    const candidates = target.filter(t => !t.deletedAt && !t.isExcluded && !claimed.has(t.id) && t.currency === row.currency && Number(t.amount) === Number(row.amount) && Math.abs(+new Date(t.date)-+new Date(row.date)) <= 86400000);
    const exact = candidates.filter(t => new Date(t.date).toISOString().slice(0,10) === new Date(row.date).toISOString().slice(0,10) && t.type === row.type);
    // Amount/date alone are only a candidate, never enough to discard a bank row.
    const match = exact.length === 1 ? exact[0] : null;
    if (match) claimed.add(match.id);
    return { id:row.id, candidates:candidates.map(t=>t.id), matchId:match?.id ?? null, needsReview:candidates.length>0 };
  });
}
