import type { ContextEntry } from "@/lib/context-corpus";

type Purpose = "transport" | "groceries" | "utilities";
type Seed = [id: string, aliases: [string, string], purpose: Purpose];
type Pack = [country: string, region: string, currency: string, seeds: Seed[]];

const entry = (pack: Pack, seed: Seed): ContextEntry => {
  const metadata = seed[2] === "transport"
    ? { categoryHint: "Transport", counterpartyType: "transport_provider" as const }
    : seed[2] === "groceries"
      ? { categoryHint: "Food & Dining", counterpartyType: "grocer" as const }
      : { categoryHint: "Bills & Utilities", counterpartyType: "utility_provider" as const };
  return {
    id: `${pack[0].toLowerCase()}-everyday-gap-${seed[0]}`,
    aliases: seed[1],
    signalKind: "merchant",
    countryCode: pack[0],
    regionCode: pack[1],
    currency: pack[2],
    purposeHint: seed[2],
    confidence: 80,
    ...metadata,
  };
};

/** Completes transport, grocery, and utility context in represented markets. */
const PACKS: Pack[] = [
  ["KH", "SEA", "KHR", [["city-bus", ["Phnom Penh City Bus Cambodia", "City Bus Phnom Penh fare"], "transport"]]],
  ["LA", "SEA", "LAK", [["vcsbe", ["Vientiane Capital State Bus Enterprise", "Vientiane city bus Laos fare"], "transport"], ["mini-big-c", ["Mini Big C Laos grocery", "Big C Mini Vientiane supermarket"], "groceries"]]],
  ["US", "NAM", "USD", [["amtrak", ["Amtrak United States rail", "Amtrak US train ticket"], "transport"], ["kroger", ["Kroger United States grocery", "Kroger US supermarket"], "groceries"]]],
  ["CA", "NAM", "CAD", [["presto", ["PRESTO Metrolinx Canada transit", "PRESTO Ontario fare"], "transport"], ["loblaw", ["Loblaw Canada grocery", "Loblaws Canadian supermarket"], "groceries"]]],
  ["SA", "MEA", "SAR", [["saptco", ["SAPTCO Saudi Arabia transport", "Saudi Public Transport Company fare"], "transport"], ["panda", ["Panda Retail Saudi Arabia grocery", "Panda supermarket Saudi"], "groceries"]]],
  ["KW", "MEA", "KWD", [["kptc", ["KPTC Kuwait transport", "Kuwait Public Transport Company fare"], "transport"], ["sultan-center", ["Sultan Center Kuwait grocery", "The Sultan Center Kuwait supermarket"], "groceries"]]],
  ["MX", "LATAM", "MXN", [["metro-cdmx", ["Metro CDMX Mexico fare", "Sistema Transporte Colectivo Mexico City"], "transport"], ["soriana", ["Soriana Mexico grocery", "Organizacion Soriana supermarket Mexico"], "groceries"]]],
  ["ZA", "AFR", "ZAR", [["gautrain", ["Gautrain South Africa fare", "Gautrain Johannesburg transport"], "transport"], ["shoprite", ["Shoprite South Africa grocery", "Shoprite supermarket South Africa"], "groceries"]]],
  ["BD", "SAS", "BDT", [["dhaka-metro", ["Dhaka Metro Rail Bangladesh fare", "DMTCL Bangladesh transport"], "transport"]]],
  ["PK", "SAS", "PKR", [["daewoo-express", ["Daewoo Express Pakistan fare", "Daewoo bus Pakistan ticket"], "transport"]]],
  ["CO", "LATAM", "COP", [["transmilenio", ["TransMilenio Colombia fare", "TransMilenio Bogota transport"], "transport"], ["exito", ["Exito Colombia grocery", "Almacenes Exito supermarket Colombia"], "groceries"]]],
  ["CL", "LATAM", "CLP", [["metro-santiago", ["Metro de Santiago Chile fare", "Santiago Metro Chile transport"], "transport"]]],
  ["KE", "AFR", "KES", [["kenya-railways", ["Kenya Railways fare", "Madaraka Express Kenya ticket"], "transport"]]],
  ["MO", "EAS", "MOP", [["macau-pass", ["Macau Pass transit fare", "Macau Pass bus payment"], "transport"], ["san-miu", ["San Miu Supermarket Macau", "San Miu Macau grocery"], "groceries"]]],
  ["GU", "OCE", "USD", [["grta", ["Guam Regional Transit Authority fare", "GRTA Guam bus"], "transport"], ["payless", ["Pay-Less Markets Guam grocery", "Payless Supermarket Guam"], "groceries"], ["gpa", ["Guam Power Authority payment", "GPA Guam electricity bill"], "utilities"]]],
  ["FJ", "OCE", "FJD", [["etransport", ["Fiji eTransport bus fare", "Vodafone eTransport Fiji"], "transport"], ["mh-superfresh", ["MH Superfresh Fiji grocery", "Morris Hedstrom Fiji supermarket"], "groceries"], ["efl", ["Energy Fiji Limited bill", "EFL Fiji electricity payment"], "utilities"]]],
  ["TZ", "AFR", "TZS", [["dart", ["DART Dar es Salaam fare", "Dar Rapid Transit Tanzania"], "transport"], ["shoppers-plaza", ["Shoppers Plaza Tanzania grocery", "Shoppers Supermarket Tanzania"], "groceries"]]],
  ["CR", "LATAM", "CRC", [["incofer", ["INCOFER Costa Rica fare", "Costa Rica railway ticket"], "transport"]]],
  ["IQ", "MEA", "IQD", [["gcpt", ["General Company Passenger Transport Iraq", "Baghdad public transport fare"], "transport"]]],
  ["JP", "EAS", "JPY", [["aeon", ["AEON Japan supermarket", "AEON grocery Japan"], "groceries"]]],
  ["TW", "EAS", "TWD", [["px-mart", ["PX Mart Taiwan grocery", "Pxmart Taiwan supermarket"], "groceries"]]],
  ["KR", "EAS", "KRW", [["lotte-mart", ["Lotte Mart Korea grocery", "Lotte supermarket South Korea"], "groceries"]]],
  ["CN", "EAS", "CNY", [["yonghui", ["Yonghui Superstores China grocery", "Yonghui supermarket China"], "groceries"]]],
  ["IN", "SAS", "INR", [["reliance-fresh", ["Reliance Fresh India grocery", "Reliance Smart supermarket India"], "groceries"]]],
  ["AE", "MEA", "AED", [["carrefour", ["Carrefour UAE grocery", "Carrefour Emirates supermarket"], "groceries"]]],
  ["GB", "EUR", "GBP", [["tesco", ["Tesco United Kingdom grocery", "Tesco UK supermarket"], "groceries"]]],
  ["QA", "MEA", "QAR", [["al-meera", ["Al Meera Qatar grocery", "Al Meera supermarket Qatar"], "groceries"]]],
  ["IE", "EUR", "EUR", [["supervalu", ["SuperValu Ireland grocery", "SuperValu supermarket Ireland"], "groceries"]]],
  ["CH", "EUR", "CHF", [["migros", ["Migros Switzerland grocery", "Migros supermarket Switzerland"], "groceries"]]],
  ["DE", "EUR", "EUR", [["edeka", ["Edeka Germany grocery", "Edeka supermarket Germany"], "groceries"]]],
  ["ES", "EUR", "EUR", [["mercadona", ["Mercadona Spain grocery", "Mercadona supermarket Spain"], "groceries"]]],
  ["IT", "EUR", "EUR", [["conad", ["Conad Italy grocery", "Conad supermarket Italy"], "groceries"]]],
  ["FR", "EUR", "EUR", [["carrefour", ["Carrefour supermarket France", "Carrefour France grocery purchase"], "groceries"]]],
  ["NL", "EUR", "EUR", [["albert-heijn", ["Albert Heijn Netherlands grocery", "AH supermarket Netherlands"], "groceries"]]],
  ["BE", "EUR", "EUR", [["colruyt", ["Colruyt Belgium grocery", "Colruyt supermarket Belgium"], "groceries"]]],
  ["AT", "EUR", "EUR", [["billa", ["Billa Austria grocery", "Billa supermarket Austria"], "groceries"]]],
  ["UG", "AFR", "UGX", [["quality", ["Quality Supermarket Uganda", "Quality grocery Kampala Uganda"], "groceries"]]],
  ["RW", "AFR", "RWF", [["simba", ["Simba Supermarket Rwanda", "Simba grocery Kigali Rwanda"], "groceries"]]],
  ["CI", "AFR", "XOF", [["prosuma", ["Prosuma Cote Ivoire grocery", "Prosuma supermarket Abidjan"], "groceries"]]],
  ["TR", "EUR", "TRY", [["enerjisa", ["Enerjisa Turkey electricity bill", "Enerjisa power payment Turkey"], "utilities"]]],
  ["PT", "EUR", "EUR", [["edp", ["EDP Portugal electricity bill", "EDP Comercial Portugal payment"], "utilities"]]],
  ["PE", "LATAM", "PEN", [["luz-del-sur", ["Luz del Sur Peru bill", "Luz del Sur Lima electricity"], "utilities"]]],
  ["UY", "LATAM", "UYU", [["ute", ["UTE Uruguay electricity bill", "Administracion Usinas Uruguay payment"], "utilities"]]],
  ["EC", "LATAM", "USD", [["cnel", ["CNEL Ecuador electricity bill", "Corporacion Nacional Electricidad Ecuador"], "utilities"]]],
  ["EG", "MEA", "EGP", [["eehc", ["Egyptian Electricity Holding Company bill", "EEHC Egypt power payment"], "utilities"]]],
  ["OM", "MEA", "OMR", [["nama", ["Nama Electricity Oman bill", "Nama Supply Oman payment"], "utilities"]]],
  ["SN", "AFR", "XOF", [["senelec", ["Senelec Senegal electricity bill", "Senelec power payment Senegal"], "utilities"]]],
];

export const WORLD_EVERYDAY_GAP_CONTEXT_ENTRIES: ContextEntry[] = PACKS.flatMap((pack) => pack[3].map((seed) => entry(pack, seed)));
