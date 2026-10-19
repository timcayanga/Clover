/** A deliberate horizontal swipe changes a plan; vertical scrolling and short taps do not. */
export function planSwipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/** Split in integer centavos; any remainder goes to the first selected people. */
export function sampleSplitShares(amounts: readonly number[], assignments: readonly (readonly boolean[])[], people = 3) {
  const totals = Array.from({length:people}, () => 0);
  amounts.forEach((amount, row) => {
    const payers = totals.map((_, i) => i).filter(i => assignments[row]?.[i]);
    if (!payers.length) return;
    const share = Math.floor(amount / payers.length), remainder = amount % payers.length;
    payers.forEach((person, index) => { totals[person] += share + (index < remainder ? 1 : 0); });
  });
  return totals;
}
