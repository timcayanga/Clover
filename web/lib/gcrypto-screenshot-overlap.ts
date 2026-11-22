// Adjacent trades with different identities establish a shared section of
// history. A single same-minute trade can legitimately repeat.
type Activity = {
  date?: unknown;
  amount?: unknown;
  currency?: unknown;
  accountId?: unknown;
  rawPayload?: unknown;
};

export function isGCryptoHistorySource(raw: unknown) {
  const source = (raw as {source?: unknown} | null)?.source;
  return source === "gcrypto_mobile_screenshot" || source === "gcrypto_transaction_screenshot";
}

function activityKey(row: Activity) {
  if (!isGCryptoHistorySource(row.rawPayload)) return null;
  const raw = row.rawPayload as Record<string, unknown>;
  const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date ?? "").slice(0, 10);
  const cents = Math.round(Number(String(row.amount ?? "")) * 100);
  if (!row.accountId || !/^[A-Z]{3}$/.test(String(row.currency)) || !/^\d{4}-\d\d-\d\d$/.test(date) ||
      !Number.isSafeInteger(cents) || cents === 0 || !/^(?:Buy|Sell)$/.test(String(raw.action)) ||
      !/^\d{1,2}:\d{2} [AP]M$/i.test(String(raw.timeText)) || !raw.assetName ||
      !/^\d+(?:\.\d+)?$/.test(String(raw.quantity)) || Number(raw.quantity) <= 0) return null;
  return JSON.stringify([row.accountId, date, row.currency, cents, raw.timeText, raw.action, raw.assetName, String(raw.quantity)]);
}

export function overlappingGCryptoTradeIndices(incoming: Activity[], saved: (Activity & {importFileId: string | null})[]) {
  const pages = new Map<string, Map<number, string>>();
  for (const row of saved) {
    const key = activityKey(row);
    const position = Number((row.rawPayload as {sourceRowIndex?: unknown} | null)?.sourceRowIndex);
    if (!key || !row.importFileId || !Number.isSafeInteger(position) || position < 1) continue;
    const page = pages.get(row.importFileId) ?? new Map<number, string>();
    page.set(position, page.has(position) ? "" : key);
    pages.set(row.importFileId, page);
  }
  const savedPairs = new Set<string>();
  for (const page of pages.values()) {
    for (const [index, key] of page) {
      const next = page.get(index + 1);
      if (key && next && next !== key) savedPairs.add(JSON.stringify([key, next]));
    }
  }
  const keys = incoming.map(activityKey);
  const matches = new Set<number>();
  const frequency = new Map<string | null, number>();
  for (const key of keys) frequency.set(key, (frequency.get(key) ?? 0) + 1);
  for (let i = 0; i + 1 < keys.length; i++) {
    if (frequency.get(keys[i]) === 1 && frequency.get(keys[i + 1]) === 1 &&
        savedPairs.has(JSON.stringify([keys[i], keys[i + 1]]))) {
      matches.add(i);
      matches.add(i + 1);
    }
  }
  return matches;
}
