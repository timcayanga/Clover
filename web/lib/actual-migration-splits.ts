/** Actual's CSV has no split IDs. Only accept complete, contiguous numbered
 * groups whose signed children reconcile to the printed parent total. */
export type ActualSplitEvidence = {
  parentSourceRow: number;
  parentAmount: string;
  currency: string;
  part: number;
  parts: number;
  parentNote: string;
  parentPayee: string;
};
type SplitRow = { sourceRow: number; date: string; account: string; currency: string; amount: number; splitAmount: number; notes: string; payee: string };
export const createActualSplitValidator = (fail: (row: number, message: string) => never) => {
  let active: { row: SplitRow; parts: number; next: number; sum: number } | null = null;
  const finish = () => {
    if (active) fail(active.row.sourceRow, "The Actual split is incomplete. Export its parent and every child together, in their original order.");
  };
  const accept = (row: SplitRow): { skip: boolean; notes: string; payee: string; evidence?: ActualSplitEvidence } => {
    const parent = row.notes.match(/^\(SPLIT INTO (\d+)\)(?:\s|$)/);
    const child = row.notes.match(/^\(SPLIT (\d+) OF (\d+)\)(?:\s|$)/);
    if (parent) {
      finish();
      const parts = Number(parent[1]);
      if (!Number.isSafeInteger(parts) || parts < 1 || parts > 25000 || row.amount !== 0 || row.splitAmount === 0) {
        fail(row.sourceRow, "The Actual split parent must have zero Amount, a nonzero Split_Amount and a valid child count.");
      }
      active = { row, parts, next: 1, sum: 0 };
      return { skip: true, notes: row.notes, payee: row.payee };
    }
    if (child) {
      if (!active) fail(row.sourceRow, "The Actual split child is missing its parent. Export the complete split in its original order.");
      const group = active!;
      if (Number(child[1]) !== group.next || Number(child[2]) !== group.parts || row.splitAmount !== 0 || row.amount === 0 ||
        row.account !== group.row.account || row.date !== group.row.date || row.currency !== group.row.currency) {
        fail(row.sourceRow, "The Actual split children must be complete and ordered, with the same account, date and currency as their parent.");
      }
      group.sum += Math.round(row.amount * 100);
      if (!Number.isSafeInteger(group.sum)) fail(row.sourceRow, "The Actual split total is too large to read safely.");
      const parentNote = group.row.notes.replace(/^\(SPLIT INTO \d+\)\s*/, "").trim();
      const childNote = row.notes.slice(child[0].length).trim();
      const evidence: ActualSplitEvidence = { parentSourceRow: group.row.sourceRow, parentAmount: group.row.splitAmount.toFixed(2), currency: row.currency, part: group.next, parts: group.parts, parentNote, parentPayee: group.row.payee };
      if (group.next === group.parts) {
        if (group.sum !== Math.round(group.row.splitAmount * 100)) fail(row.sourceRow, "The Actual split children do not match the parent total.");
        active = null;
      } else group.next++;
      return { skip: false, notes: [...new Set([parentNote, childNote].filter(Boolean))].join(" · "), payee: row.payee || group.row.payee, evidence };
    }
    finish();
    if (row.splitAmount !== 0 || /^\(SPLIT\b/.test(row.notes)) fail(row.sourceRow, "The Actual split markers cannot be read. Export the complete split again or use the Clover template with only its individual parts.");
    return { skip: false, notes: row.notes, payee: row.payee };
  };
  return { accept, finish };
};
