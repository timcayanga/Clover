import type { ContextEntry } from "@/lib/context-corpus";

type Seed = [id: string, aliases: [string, string]];
type FiscalPack = [country: string, region: string, currency: string, tax: Seed, social: Seed];

const fiscal = (pack: FiscalPack, seed: Seed, purposeHint: "tax" | "government_contribution"): ContextEntry => ({
  id: `${pack[0].toLowerCase()}-fiscal-${seed[0]}`,
  aliases: seed[1],
  signalKind: "merchant",
  countryCode: pack[0],
  regionCode: pack[1],
  currency: pack[2],
  purposeHint,
  counterpartyType: "government",
  confidence: 84,
});

/** Statutory tax and social-contribution counterparties for major markets. */
const PACKS: FiscalPack[] = [
  // Europe.
  ["AT", "EUR", "EUR", ["bmf", ["Austrian Federal Ministry Finance tax", "Finanzamt Osterreich payment"]], ["ogk", ["Osterreichische Gesundheitskasse contribution", "OGK Austria social insurance"]]],
  ["BE", "EUR", "EUR", ["spf", ["SPF Finances Belgium tax", "FOD Financien Belgie payment"]], ["onss", ["ONSS Belgium social security", "RSZ Belgie contribution"]]],
  ["NL", "EUR", "EUR", ["belastingdienst", ["Belastingdienst Netherlands tax", "Netherlands Tax Administration payment"]], ["svb", ["SVB Netherlands social insurance", "Sociale Verzekeringsbank contribution"]]],
  ["DK", "EUR", "DKK", ["skat", ["Danish Tax Administration payment", "Skattestyrelsen Denmark tax"]], ["atp", ["ATP Denmark pension contribution", "Arbejdsmarkedets Tillaegspension"]]],
  ["SE", "EUR", "SEK", ["skatteverket", ["Skatteverket Sweden tax", "Swedish Tax Agency payment"]], ["forsakringskassan", ["Forsakringskassan Sweden contribution", "Swedish Social Insurance Agency"]]],
  ["NO", "EUR", "NOK", ["skatteetaten", ["Skatteetaten Norway tax", "Norwegian Tax Administration payment"]], ["nav", ["NAV Norway social security", "Norwegian Labour Welfare contribution"]]],
  ["FI", "EUR", "EUR", ["vero", ["Finnish Tax Administration payment", "Verohallinto Finland tax"]], ["kela", ["Kela Finland social insurance", "Kansanelakelaitos contribution"]]],
  ["PL", "EUR", "PLN", ["kas", ["National Revenue Administration Poland", "KAS Poland tax payment"]], ["zus", ["ZUS Poland social insurance", "Zaklad Ubezpieczen Spolecznych"]]],
  ["GR", "EUR", "EUR", ["aade", ["AADE Greece tax payment", "Independent Authority Public Revenue Greece"]], ["efka", ["e EFKA Greece contribution", "National Social Security Greece EFKA"]]],
  ["EE", "EUR", "EUR", ["emta", ["Estonian Tax Customs Board payment", "EMTA Estonia tax"]], ["sotsiaalkindlustus", ["Estonian Social Insurance Board", "Sotsiaalkindlustusamet contribution"]]],
  ["LV", "EUR", "EUR", ["vid", ["VID Latvia tax payment", "State Revenue Service Latvia"]], ["vsaa", ["VSAA Latvia social insurance", "State Social Insurance Agency Latvia"]]],
  ["LT", "EUR", "EUR", ["vmi", ["VMI Lithuania tax payment", "State Tax Inspectorate Lithuania"]], ["sodra", ["Sodra Lithuania contribution", "State Social Insurance Fund Lithuania"]]],
  ["SK", "EUR", "EUR", ["financna", ["Financial Administration Slovakia tax", "Financna sprava payment"]], ["socialna", ["Socialna poistovna Slovakia", "Social Insurance Agency Slovakia contribution"]]],
  ["SI", "EUR", "EUR", ["furs", ["FURS Slovenia tax payment", "Financial Administration Slovenia"]], ["zpiz", ["ZPIZ Slovenia pension contribution", "Pension Disability Insurance Slovenia"]]],
  ["HR", "EUR", "EUR", ["porezna", ["Porezna Uprava Croatia tax", "Croatian Tax Administration payment"]], ["hzmo", ["HZMO Croatia contribution", "Croatian Pension Insurance Institute"]]],
  ["BG", "EUR", "BGN", ["nra", ["National Revenue Agency Bulgaria tax", "NAP Bulgaria tax payment"]], ["nssi", ["NSSI Bulgaria social insurance", "National Social Security Institute Bulgaria"]]],
  ["RO", "EUR", "RON", ["anaf", ["ANAF Romania tax payment", "National Agency Fiscal Administration Romania"]], ["cnpp", ["CNPP Romania pension contribution", "National Public Pensions House Romania"]]],
  ["HU", "EUR", "HUF", ["nav", ["NAV Hungary tax payment", "National Tax Customs Administration Hungary"]], ["allamkincstar", ["Hungarian State Treasury social contribution", "Magyar Allamkincstar Hungary"]]],
  ["CY", "EUR", "EUR", ["tax-dept", ["Cyprus Tax Department payment", "Tax Department Republic Cyprus"]], ["sis", ["Social Insurance Services Cyprus", "Cyprus social insurance contribution"]]],
  ["MT", "EUR", "EUR", ["cfr", ["Commissioner for Revenue Malta tax", "Malta tax administration payment"]], ["social-security", ["Social Security Malta contribution", "Department Social Security Malta"]]],

  // Latin America and the Caribbean.
  ["MX", "LATAM", "MXN", ["sat", ["SAT Mexico tax payment", "Servicio Administracion Tributaria Mexico"]], ["imss", ["IMSS Mexico contribution", "Instituto Mexicano Seguro Social"]]],
  ["PE", "LATAM", "PEN", ["sunat", ["SUNAT Peru tax payment", "Superintendencia Tributaria Peru"]], ["onp", ["ONP Peru pension contribution", "Oficina Normalizacion Previsional Peru"]]],
  ["CO", "LATAM", "COP", ["dian", ["DIAN Colombia tax payment", "Direccion Impuestos Aduanas Colombia"]], ["colpensiones", ["Colpensiones Colombia contribution", "Administradora Colombiana Pensiones"]]],
  ["CL", "LATAM", "CLP", ["sii", ["SII Chile tax payment", "Servicio Impuestos Internos Chile"]], ["ips", ["IPS Chile social contribution", "Instituto Prevision Social Chile"]]],
  ["AR", "LATAM", "ARS", ["arca", ["ARCA Argentina tax payment", "Agencia Recaudacion Control Aduanero Argentina"]], ["anses", ["ANSES Argentina contribution", "Administracion Nacional Seguridad Social Argentina"]]],
  ["UY", "LATAM", "UYU", ["dgi", ["DGI Uruguay tax payment", "Direccion General Impositiva Uruguay"]], ["bps", ["BPS Uruguay contribution", "Banco Prevision Social Uruguay"]]],
  ["PY", "LATAM", "PYG", ["dnit", ["DNIT Paraguay tax payment", "Direccion Nacional Ingresos Tributarios Paraguay"]], ["ips", ["IPS Paraguay social contribution", "Instituto Prevision Social Paraguay"]]],
  ["BO", "LATAM", "BOB", ["sin", ["SIN Bolivia tax payment", "Servicio Impuestos Nacionales Bolivia"]], ["gestora", ["Gestora Publica Bolivia pension", "Gestora Seguridad Social Bolivia contribution"]]],
  ["EC", "LATAM", "USD", ["sri", ["SRI Ecuador tax payment", "Servicio Rentas Internas Ecuador"]], ["iess", ["IESS Ecuador contribution", "Instituto Ecuatoriano Seguridad Social"]]],
  ["CR", "LATAM", "CRC", ["hacienda", ["Ministerio Hacienda Costa Rica tax", "Tributacion Costa Rica payment"]], ["ccss", ["CCSS Costa Rica contribution", "Caja Costarricense Seguro Social"]]],
  ["PA", "LATAM", "PAB", ["dgi", ["DGI Panama tax payment", "Direccion General Ingresos Panama"]], ["css", ["CSS Panama social contribution", "Caja Seguro Social Panama"]]],
  ["GT", "LATAM", "GTQ", ["sat", ["SAT Guatemala tax payment", "Superintendencia Administracion Tributaria Guatemala"]], ["igss", ["IGSS Guatemala contribution", "Instituto Guatemalteco Seguridad Social"]]],
  ["HN", "LATAM", "HNL", ["sar", ["SAR Honduras tax payment", "Servicio Administracion Rentas Honduras"]], ["ihss", ["IHSS Honduras contribution", "Instituto Hondureno Seguridad Social"]]],
  ["SV", "LATAM", "USD", ["hacienda", ["Ministerio Hacienda El Salvador tax", "Hacienda El Salvador payment"]], ["isss", ["ISSS El Salvador contribution", "Instituto Salvadoreno Seguro Social"]]],
  ["DO", "CAR", "DOP", ["dgii", ["DGII Dominican Republic tax", "Direccion General Impuestos Internos Dominicana"]], ["tss", ["TSS Dominican Republic contribution", "Tesoreria Seguridad Social Dominicana"]]],

  // Africa and the Middle East.
  ["DZ", "MEA", "DZD", ["dgi", ["Direction Generale Impots Algeria", "DGI Algerie tax payment"]], ["cnas", ["CNAS Algeria contribution", "Caisse Nationale Assurances Sociales Algerie"]]],
  ["TN", "MEA", "TND", ["dgi", ["Direction Generale Impots Tunisia", "DGI Tunisie tax payment"]], ["cnss", ["CNSS Tunisia contribution", "Caisse Nationale Securite Sociale Tunisie"]]],
  ["EG", "MEA", "EGP", ["eta", ["Egyptian Tax Authority payment", "ETA Egypt tax"]], ["nosi", ["National Organization Social Insurance Egypt", "NOSI Egypt contribution"]]],
  ["KE", "AFR", "KES", ["kra", ["Kenya Revenue Authority tax", "KRA Kenya payment"]], ["nssf", ["NSSF Kenya contribution", "National Social Security Fund Kenya"]]],
  ["TZ", "AFR", "TZS", ["tra", ["Tanzania Revenue Authority tax", "TRA Tanzania payment"]], ["nssf", ["NSSF Tanzania contribution", "National Social Security Fund Tanzania"]]],
  ["UG", "AFR", "UGX", ["ura", ["Uganda Revenue Authority tax", "URA Uganda payment"]], ["nssf", ["NSSF Uganda contribution", "National Social Security Fund Uganda"]]],
  ["RW", "AFR", "RWF", ["rra", ["Rwanda Revenue Authority tax", "RRA Rwanda payment"]], ["rssb", ["RSSB Rwanda contribution", "Rwanda Social Security Board"]]],
  ["SN", "AFR", "XOF", ["dgid", ["DGID Senegal tax payment", "Direction Impots Domaines Senegal"]], ["ipres", ["IPRES Senegal pension contribution", "Institution Prevoyance Retraite Senegal"]]],
  ["CI", "AFR", "XOF", ["dgi", ["DGI Cote Ivoire tax", "Direction Generale Impots Ivory Coast"]], ["cnps", ["CNPS Cote Ivoire contribution", "Caisse Nationale Prevoyance Sociale Ivory Coast"]]],
  ["ZA", "AFR", "ZAR", ["sars", ["South African Revenue Service tax", "SARS South Africa payment"]], ["uif", ["UIF South Africa contribution", "Unemployment Insurance Fund South Africa"]]],
  ["ZM", "AFR", "ZMW", ["zra", ["Zambia Revenue Authority tax", "ZRA Zambia payment"]], ["napsa", ["NAPSA Zambia contribution", "National Pension Scheme Authority Zambia"]]],
  ["ZW", "AFR", "USD", ["zimra", ["Zimbabwe Revenue Authority tax", "ZIMRA Zimbabwe payment"]], ["nssa", ["NSSA Zimbabwe contribution", "National Social Security Authority Zimbabwe"]]],
  ["GH", "AFR", "GHS", ["gra", ["Ghana Revenue Authority tax", "GRA Ghana payment"]], ["ssnit", ["SSNIT Ghana contribution", "Social Security National Insurance Ghana"]]],
  ["NG", "AFR", "NGN", ["firs", ["Federal Inland Revenue Service Nigeria", "FIRS Nigeria tax payment"]], ["nsitf", ["NSITF Nigeria contribution", "Nigeria Social Insurance Trust Fund"]]],
  ["MA", "MEA", "MAD", ["dgi", ["Direction Generale Impots Morocco", "DGI Maroc tax payment"]], ["cnss", ["CNSS Morocco contribution", "Caisse Nationale Securite Sociale Maroc"]]],

  // Asia.
  ["JP", "EAS", "JPY", ["nta", ["National Tax Agency Japan payment", "国税庁 日本 tax"]], ["jps", ["Japan Pension Service contribution", "日本年金機構 payment"]]],
  ["KR", "EAS", "KRW", ["nts", ["National Tax Service Korea payment", "국세청 대한민국 tax"]], ["nps", ["National Pension Service Korea", "국민연금공단 contribution"]]],
  ["CN", "EAS", "CNY", ["sta", ["State Taxation Administration China", "国家税务总局 payment"]], ["social-insurance", ["National Social Insurance China contribution", "国家社会保险 公共服务"]]],
  ["IN", "SAS", "INR", ["income-tax", ["Income Tax Department India payment", "भारत आयकर विभाग tax"]], ["epfo", ["EPFO India contribution", "Employees Provident Fund India"]]],
  ["BD", "SAS", "BDT", ["nbr", ["National Board Revenue Bangladesh", "NBR Bangladesh tax payment"]], ["ups", ["Universal Pension Scheme Bangladesh", "জাতীয় পেনশন কর্তৃপক্ষ contribution"]]],
  ["PK", "SAS", "PKR", ["fbr", ["Federal Board Revenue Pakistan", "FBR Pakistan tax payment"]], ["eobi", ["EOBI Pakistan contribution", "Employees Old Age Benefits Pakistan"]]],
  ["LK", "SAS", "LKR", ["ird", ["Inland Revenue Department Sri Lanka", "IRD Sri Lanka tax payment"]], ["epf", ["EPF Sri Lanka contribution", "Employees Provident Fund Sri Lanka"]]],
  ["NP", "SAS", "NPR", ["ird", ["Inland Revenue Department Nepal", "IRD Nepal tax payment"]], ["ssf", ["Social Security Fund Nepal", "SSF Nepal contribution"]]],
  ["KZ", "CAS", "KZT", ["src", ["State Revenue Committee Kazakhstan", "Қазақстан кірістер комитеті tax"]], ["enpf", ["Unified Accumulative Pension Fund Kazakhstan", "ЕНПФ Казахстан contribution"]]],
  ["UZ", "CAS", "UZS", ["tax-committee", ["Tax Committee Uzbekistan payment", "Soliq qo mitasi Uzbekistan"]], ["pension-fund", ["Pension Fund Uzbekistan contribution", "Pensiya jamg armasi Uzbekistan"]]],
];

export const WORLD_FISCAL_CONTEXT_ENTRIES: ContextEntry[] = PACKS.flatMap((pack) => [
  fiscal(pack, pack[3], "tax"),
  fiscal(pack, pack[4], "government_contribution"),
]);
