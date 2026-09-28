/** Display grouping only: connector IDs remain separate for authorization and sync. */
export type FinverseBankOption = {
  id: string; name: string; countries: string[]; status?: string;
  brandKey?: string; accessType?: string; connectorName?: string;
  logoUrl: string; logoUrls?: Record<string, string>;
};
export type FinverseBankGroup = { key: string; name: string; logoUrl: string; accessLabel: string; betaOnly: boolean; options: FinverseBankOption[] };

const brands: [string, string, string[]][] = [
  ['bea', 'Bank of East Asia', ['beahk', 'beahk-business']],
  ['boc', 'Bank of China', ['bochk', 'bochk-business']],
  ['bdo', 'BDO', ['bdoph', 'bdoph-business']],
  ['bpi', 'BPI', ['bpi', 'bpi-business']],
  ['citi', 'Citibank', ['citi-direct', 'citi-hk', 'citi-sg']],
  ['dbs', 'DBS', ['dbs-business', 'dbs-hk', 'dbs-sg']],
  ['hangseng', 'Hang Seng', ['hangseng', 'hangseng-hk-business']],
  ['hsbc', 'HSBC', ['hsbc-hk', 'hsbc-hk-business', 'hsbcnet', 'hsbc-sg']],
  ['standard-chartered', 'Standard Chartered', ['standardchartered-business', 'standardchartered-hk-personal']],
  ['ocbc', 'OCBC', ['ocbc', 'ocbc-business-my', 'ocbc-business-sg']],
  ['uob', 'UOB', ['uob-business', 'uob-sg-business', 'uob-sg']],
  ['maybank', 'Maybank', ['maybank-my', 'maybank-sg']],
];
export function finverseConnectorIdentity(id: string, name: string) {
  const brand = brands.find(([, , ids]) => ids.includes(id));
  const accessType = /business|corporate|citidirect|hsbcnet/i.test(name) ? 'Business'
    : /personal|individual|retail/i.test(name) ? 'Personal' : 'Bank access';
  return { brandKey: brand?.[0] ?? id, brandName: brand?.[1], accessType, connectorName: name };
}
export function groupFinverseBanks(banks: FinverseBankOption[], country: string): FinverseBankGroup[] {
  const groups = new Map<string, FinverseBankGroup>();
  for (const bank of banks.filter(bank => bank.countries.includes(country))) {
    // Unknown connectors stay distinct: never infer shared authorization from a similar name.
    const key = bank.brandKey || bank.id;
    let group = groups.get(key);
    if (!group) { group = { key, name: bank.name, logoUrl: bank.logoUrls?.[country] || bank.logoUrl, accessLabel: '', betaOnly: true, options: [] }; groups.set(key, group); }
    if (!group.options.some(option => option.id === bank.id)) group.options.push(bank);
    group.betaOnly &&= bank.status === 'BETA';
  }
  return [...groups.values()].map(group => {
    group.options.sort((a,b) => (a.accessType === 'Personal' ? 0 : 1) - (b.accessType === 'Personal' ? 0 : 1) || (a.connectorName || a.name).localeCompare(b.connectorName || b.name));
    const access = new Set(group.options.map(bank => bank.accessType || 'Bank access'));
    group.accessLabel = access.has('Personal') && access.has('Business') ? 'Personal & Business' : [...access].join(' & ');
    return group;
  }).sort((a,b) => a.name.localeCompare(b.name));
}
export function finverseOptionLabel(option: FinverseBankOption, options: FinverseBankOption[]) {
  const type = option.accessType || 'Bank access';
  if (options.filter(o => (o.accessType || 'Bank access') === type).length < 2) return type;
  const name = option.connectorName || option.name;
  return options.filter(o => (o.connectorName || o.name) === name).length > 1 ? `${name} (${option.id})` : name;
}
export const FINVERSE_BETA_NOTICE = 'This connection is in beta. Syncing may be less reliable. You can still upload statements.';
