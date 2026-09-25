/** Coverage reference: finverse.com/bank-data-api + founder PH/VN table, 2026-09-25.
 * This is a display boundary, never a substitute for provider status/product checks.
 * Beta entries remain subject to the API SUPPORTED gate; planned HSBCnet PH/VN
 * may appear only once the provider actually reports support. */
const coverage: Record<string, RegExp[]> = {
  HKG: [/bank of china|\bboc\b/i, /east asia|\bbea\b/i, /\bdbs\b/i, /hang seng/i, /hsbc/i, /standard chartered/i],
  SGP: [/citi/i, /\bdbs\b/i, /hsbc/i, /ocbc/i, /standard chartered/i, /\buob\b|united overseas/i],
  MYS: [/cimb/i, /\bdbs\b/i, /hsbc/i, /maybank|malayan banking/i, /ocbc/i, /public bank/i, /standard chartered/i],
  PHL: [/\bbdo\b|banco de oro/i, /\bbpi\b|bank of the philippine islands/i, /land\s*bank|\bofbank\b|overseas filipino bank/i, /metro\s*bank/i, /\brcbc\b|rizal commercial/i, /security bank/i, /union\s*bank/i, /citi/i, /\bdbs\b/i, /standard chartered/i, /\buob\b|united overseas/i, /hsbc/i, /maya/i],
  VNM: [/\bbidv\b|investment and development/i, /vietin/i, /vietcom/i, /\bacb\b|asia commercial/i, /\bshb\b|saigon hanoi|sai gon ha noi/i, /techcom/i, /vp\s*bank/i, /citi/i, /\bdbs\b/i, /standard chartered/i, /\buob\b|united overseas/i, /hsbc/i, /saigon commercial|sai gon commercial|\bscb\b/i],
  IDN: [/\bbri\b|rakyat indonesia/i, /\bbca\b|central asia/i, /\bbni\b|negara indonesia/i, /\bdbs\b/i, /hsbc/i, /standard chartered/i],
};
export function documentedFinverseCountries(name: string, countries: string[]) {
  return countries.filter(country => coverage[country]?.some(pattern => pattern.test(name)));
}
