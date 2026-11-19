/** Compare a complete source-reparsed row set after its dedicated verifier has
 * passed. The caller must obtain that source from the current PDF bytes. */
export function sameNativeFinancialRows(expected: readonly Record<string, unknown>[], actual: readonly Record<string, unknown>[]) {
  if (!expected.length || expected.length !== actual.length) return false;
  const date = (v: unknown) => {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const timestamp = v instanceof Date ? +v : typeof v === 'string' ? Date.parse(v) : NaN;
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
  };
  const account = (v: unknown) => typeof v === 'string' ? v.replace(/[ -]/g,'').toUpperCase() : null;
  return expected.every((row,index) => {
    const other = actual[index];
    const amount = Number(row.amount);
    const raw = row.rawPayload && typeof row.rawPayload === 'object' ? row.rawPayload as Record<string, unknown> : {};
    const otherRaw = other.rawPayload && typeof other.rawPayload === 'object' ? other.rawPayload as Record<string, unknown> : {};
    const rawEvidenceAgrees = ['line','accountNumber','balance','openingBalance','endingBalance','direction','component'].every(key =>
      raw[key] === undefined || (key === 'line' && typeof raw[key] === 'string' && typeof otherRaw[key] === 'string'
        ? raw[key].replace(/\s+/g,' ').trim() === otherRaw[key].replace(/\s+/g,' ').trim()
        : JSON.stringify(raw[key]) === JSON.stringify(otherRaw[key])));
    return rawEvidenceAgrees && (row.balance === undefined || String(row.balance) === String(other.balance)) && Number.isFinite(amount) && amount === Number(other.amount) && date(row.date) !== null && date(row.date) === date(other.date) &&
      typeof row.currency === 'string' && row.currency === other.currency &&
      typeof row.type === 'string' && row.type === other.type &&
      typeof row.merchantRaw === 'string' && row.merchantRaw === other.merchantRaw &&
      account(row.accountNumber) === account(other.accountNumber);
  });
}
