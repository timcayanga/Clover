/** Read-only connection presentation; never changes bank or account records. */
export type BankLinkCard = {
  id: string; connectionId: string; name: string; last4: string | null;
  logoUrl: string; lastSyncedAt: string | null; status: string;
  syncError: string | null; institutionId?: string | null;
  unlinkedAt?: string | null; authorizationAvailable?: boolean;
};

export function bankLinkPresentation(account: Pick<BankLinkCard, "status" | "syncError" | "unlinkedAt" | "authorizationAvailable">) {
  const pending = account.status === "disconnect_pending";
  const relink = !pending && (!!account.unlinkedAt || account.status === "disconnected" || account.status === "link_pending" || account.authorizationAvailable === false || /authorization expired|reconnect securely/i.test(account.syncError ?? ""));
  return { relink, pending, label: relink ? "Unlinked" : pending ? "Unlinking…" : account.status === "retrieving" ? "Syncing…" : account.syncError || account.status === "error" ? "Sync needs attention" : "Connected" };
}

export function bankSyncDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** An active link wins over an older revoked connection to the same Clover card. */
export function preferredBankLinks<T extends BankLinkCard>(links: T[]): T[] {
  const cards = new Map<string, T>();
  for (const link of links) {
    const existing = cards.get(link.id);
    const score = (item: T) => bankLinkPresentation(item).relink ? 0 : 1;
    if (!existing || score(link) > score(existing) || (score(link) === score(existing) && (link.lastSyncedAt ?? "") > (existing.lastSyncedAt ?? ""))) cards.set(link.id, link);
  }
  return [...cards.values()];
}
