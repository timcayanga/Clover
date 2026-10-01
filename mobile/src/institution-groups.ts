type InvestmentAccount = { id: string; institution: string | null; type: string; currency: string };
/** Presentation grouping only. Never changes account IDs, balances or ownership. */
export function institutionGroups<T extends InvestmentAccount>(accounts: T[]) {
  const groups = new Map<string, { id: string; name: string; currency: string; assets: T[] }>();
  for (const account of accounts) {
    if (account.type !== 'investment') continue;
    const name = account.institution?.trim().replace(/\s+/g, ' ') || 'Other investments';
    const id = `${name.toLocaleLowerCase('en')}:${account.currency}`;
    if (!groups.has(id)) groups.set(id, { id, name, currency: account.currency, assets: [] });
    groups.get(id)!.assets.push(account);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
