import {
  splitItemTotals,
  type SplitItem,
} from "./split-bill-experience";
export function validateCircleExpenseSplit(
  members: { id: string; displayName: string }[],
  items: SplitItem[],
  total: number,
) {
  if(!Number.isFinite(total)||total<0)throw new Error("Choose a valid shared expense amount.");
  const ids = new Set(members.map((m) => m.id));
  for (const item of items) {
    if (!item.participantIds.length) throw new Error("Choose someone to share each item.");
    if (!item.amount.trim() || (item.allocations ?? []).some(a => !a.value.trim())) throw new Error("Enter an amount for each allocation.");
    if(!Number.isFinite(Number(item.amount))||Number(item.amount)<0||(item.allocations??[]).some(a=>!Number.isFinite(Number(a.value))||Number(a.value)<0))throw new Error("Choose valid split amounts.");
    if (
      new Set(item.participantIds).size !== item.participantIds.length ||
      item.participantIds.some((id) => !ids.has(id)) ||
      (item.allocations ?? []).some(
        (a) => !item.participantIds.includes(a.participantId),
      )
    )
      throw new Error("Choose current Circle members.");
    const allocations = item.allocations ?? [];
    if (
      new Set(allocations.map((a) => a.participantId)).size !==
      allocations.length
    )
      throw new Error("Duplicate allocation.");
    const method = item.splitMethod ?? "equal";
    if (method !== "equal" && allocations.length !== item.participantIds.length)
      throw new Error("Enter an allocation for each person.");
    const sum = allocations.reduce((n, a) => n + Number(a.value), 0);
    if (
      (method === "exact" && Math.abs(sum - Number(item.amount)) > 0.005) ||
      (method === "percentage" && Math.abs(sum - 100) > 0.001) ||
      (method === "shares" && sum <= 0)
    )
      throw new Error("Split amounts must reconcile.");
  }

  if (Math.abs(items.reduce((n, i) => n + Number(i.amount), 0) - total) > 0.005)
    throw new Error("Line items must match the shared expense total.");
  const totals = splitItemTotals(
    members.map((m) => ({ id: m.id, name: m.displayName })),
    items,
  );
  if (
    Math.abs(Object.values(totals).reduce((n, v) => n + v, 0) - total) > 0.005
  )
    throw new Error("Split amounts must reconcile.");

  return totals;
}

/** Stable across the native JSON encoder and the database's JSON key ordering. */
export function circleSplitRevision(items: SplitItem[]) {
  return JSON.stringify(items.map(item => [
    item.description, item.amount, item.splitMethod ?? "equal", item.participantIds,
    (item.allocations ?? []).map(allocation => [allocation.participantId, allocation.value]),
  ]));
}
