import type { ContextEntry } from "@/lib/context-corpus";

type Seed = [id: string, aliases: [string, string]];
type TravelHealthPack = [country: string, region: string, currency: string, health: Seed, travel: Seed];

const entry = (pack: TravelHealthPack, seed: Seed, kind: "health" | "travel"): ContextEntry => ({
  id: `${pack[0].toLowerCase()}-traveler-${seed[0]}`,
  aliases: seed[1],
  signalKind: kind === "travel" ? "travel" : "merchant",
  countryCode: pack[0],
  regionCode: pack[1],
  currency: pack[2],
  categoryHint: kind === "travel" ? "Travel & Lifestyle" : "Health & Wellness",
  purposeHint: kind === "travel" ? "travel" : "healthcare",
  counterpartyType: kind === "travel" ? "travel_provider" : "healthcare_provider",
  travelLikely: kind === "travel",
  confidence: 88,
});

/**
 * Traveler-facing context for markets already represented by balanced packs.
 * Shared groups are country-qualified to avoid treating a brand name alone as
 * location evidence on a cross-border card statement.
 */
const PACKS: TravelHealthPack[] = [
  // Europe.
  ["AT", "EUR", "EUR", ["bipa", ["BIPA Austria health retail", "BIPA Osterreich drogerie"]], ["austrian-airlines", ["Austrian Airlines Austria", "Austrian OS flight Austria"]]],
  ["BE", "EUR", "EUR", ["medi-market", ["Medi Market Belgium pharmacy", "Medi-Market Belgique sante"]], ["brussels-airlines", ["Brussels Airlines Belgium", "Brussels SN flight Belgium"]]],
  ["NL", "EUR", "EUR", ["etos", ["Etos Netherlands pharmacy", "Etos Nederland drogist"]], ["klm", ["KLM Royal Dutch Airlines Netherlands", "KLM flight Netherlands"]]],
  ["DK", "EUR", "DKK", ["matas", ["Matas Denmark health retail", "Matas Danmark apotek"]], ["sas", ["SAS Scandinavian Airlines Denmark", "SAS flight Denmark"]]],
  ["SE", "EUR", "SEK", ["apoteket", ["Apoteket Sweden pharmacy", "Apoteket Sverige"]], ["sas", ["SAS Scandinavian Airlines Sweden", "SAS flight Sweden"]]],
  ["NO", "EUR", "NOK", ["apotek-1", ["Apotek 1 Norway pharmacy", "Apotek1 Norge"]], ["norwegian", ["Norwegian Air Shuttle Norway", "Norwegian flight Norway"]]],
  ["FI", "EUR", "EUR", ["ya", ["Yliopiston Apteekki Finland", "University Pharmacy Finland"]], ["finnair", ["Finnair Finland", "Finnair AY flight Finland"]]],
  ["PL", "EUR", "PLN", ["doz", ["DOZ pharmacy Poland", "Dbam o Zdrowie Polska"]], ["lot", ["LOT Polish Airlines Poland", "LOT flight Polska"]]],
  ["GR", "EUR", "EUR", ["hondos", ["Hondos Center Greece health retail", "Hondos Center Greek personal care"]], ["aegean", ["Aegean Airlines Greece", "Aegean flight Greece"]]],
  ["EE", "EUR", "EUR", ["apotheka", ["Apotheka Estonia pharmacy", "Apotheka Eesti"]], ["tallink", ["Tallink ferry Estonia", "Tallink Silja Estonia travel"]]],
  ["LV", "EUR", "EUR", ["benu", ["BENU pharmacy Latvia", "BENU Aptieka Latvia"]], ["airbaltic", ["airBaltic Latvia", "airBaltic flight Riga Latvia"]]],
  ["LT", "EUR", "EUR", ["eurovaistine", ["Eurovaistine Lithuania pharmacy", "Euro Vaistine Lietuva"]], ["airbaltic", ["airBaltic Lithuania", "airBaltic flight Vilnius Lithuania"]]],
  ["SK", "EUR", "EUR", ["dr-max", ["Dr Max pharmacy Slovakia", "DrMax Slovensko lekarna"]], ["tatry", ["Tatra Mountain Resorts Slovakia", "TMR Hotels Slovakia"]]],
  ["SI", "EUR", "EUR", ["lekarna", ["Lekarna Ljubljana Slovenia", "Ljubljana Pharmacy Slovenia"]], ["sava-hotels", ["Sava Hotels Resorts Slovenia", "Sava Hotels Slovenia travel"]]],
  ["HR", "EUR", "EUR", ["farmacia", ["Farmacia Croatia pharmacy", "Farmacia Hrvatska ljekarna"]], ["croatia-airlines", ["Croatia Airlines Croatia", "Croatia OU flight"]]],
  ["BG", "EUR", "BGN", ["sopharmacy", ["Sopharmacy Bulgaria", "So Pharmacy Bulgaria health"]], ["bulgaria-air", ["Bulgaria Air Bulgaria", "Bulgaria FB flight"]]],
  ["RO", "EUR", "RON", ["catena", ["Catena pharmacy Romania", "Farmacia Catena Romania"]], ["tarom", ["TAROM Romanian Air Transport", "TAROM flight Romania"]]],
  ["HU", "EUR", "HUF", ["benu", ["BENU pharmacy Hungary", "BENU Gyogyszertar Hungary"]], ["wizz", ["Wizz Air Hungary", "Wizz flight Hungary"]]],
  ["CY", "EUR", "EUR", ["alpha-mega-pharmacy", ["Alphamega Pharmacy Cyprus", "Alpha Mega pharmacy Cyprus"]], ["cyprus-airways", ["Cyprus Airways Cyprus", "Cyprus CY flight"]]],
  ["MT", "EUR", "EUR", ["browns", ["Browns Pharmacy Malta", "Brown's pharmacy Malta"]], ["km-malta", ["KM Malta Airlines", "KM Malta flight"]]],

  // Latin America and the Caribbean.
  ["MX", "LATAM", "MXN", ["ahorro", ["Farmacias del Ahorro Mexico", "Farmacia Ahorro Mexico"]], ["aeromexico", ["Aeromexico Mexico", "Aeromexico AM flight"]]],
  ["PE", "LATAM", "PEN", ["inkafarma", ["Inkafarma Peru pharmacy", "Inka Farma Peru"]], ["latam", ["LATAM Airlines Peru", "LATAM flight Peru"]]],
  ["CO", "LATAM", "COP", ["cruz-verde", ["Cruz Verde Colombia pharmacy", "Droguerias Cruz Verde Colombia"]], ["avianca", ["Avianca Colombia", "Avianca AV flight Colombia"]]],
  ["CL", "LATAM", "CLP", ["salcobrand", ["Salcobrand Chile pharmacy", "Farmacia Salcobrand Chile"]], ["latam", ["LATAM Airlines Chile", "LATAM flight Chile"]]],
  ["AR", "LATAM", "ARS", ["farmacity", ["Farmacity Argentina pharmacy", "Farmacity Buenos Aires"]], ["aerolineas", ["Aerolineas Argentinas", "Aerolineas AR flight Argentina"]]],
  ["UY", "LATAM", "UYU", ["farmashop", ["Farmashop Uruguay pharmacy", "Farmashop Montevideo"]], ["buquebus", ["Buquebus Uruguay ferry", "Buquebus Montevideo travel"]]],
  ["PY", "LATAM", "PYG", ["farmacenter", ["Farmacenter Paraguay pharmacy", "Farma Center Paraguay"]], ["paranair", ["Paranair Paraguay", "Paranair flight Paraguay"]]],
  ["BO", "LATAM", "BOB", ["farmacorp", ["Farmacorp Bolivia pharmacy", "FarmaCorp Bolivia"]], ["boa", ["Boliviana de Aviacion Bolivia", "BoA flight Bolivia"]]],
  ["EC", "LATAM", "USD", ["fybeca", ["Fybeca Ecuador pharmacy", "Farmacias Fybeca Ecuador"]], ["avianca", ["Avianca Ecuador", "Avianca flight Ecuador"]]],
  ["CR", "LATAM", "CRC", ["fischel", ["Farmacias Fischel Costa Rica", "Fischel pharmacy Costa Rica"]], ["sansa", ["SANSA Airlines Costa Rica", "SANSA flight Costa Rica"]]],
  ["PA", "LATAM", "PAB", ["arrocha", ["Farmacias Arrocha Panama", "Arrocha pharmacy Panama"]], ["copa", ["Copa Airlines Panama", "Copa CM flight Panama"]]],
  ["GT", "LATAM", "GTQ", ["batres", ["Farmacias Batres Guatemala", "Batres pharmacy Guatemala"]], ["avianca", ["Avianca Guatemala", "Avianca flight Guatemala"]]],
  ["HN", "LATAM", "HNL", ["kielsa", ["Farmacias Kielsa Honduras", "Kielsa pharmacy Honduras"]], ["cm-airlines", ["CM Airlines Honduras", "CM Airlines flight Honduras"]]],
  ["SV", "LATAM", "USD", ["san-nicolas", ["Farmacias San Nicolas El Salvador", "San Nicolas pharmacy El Salvador"]], ["avianca", ["Avianca El Salvador", "Avianca flight El Salvador"]]],
  ["DO", "CAR", "DOP", ["carol", ["Farmacia Carol Dominican Republic", "Farmacias Carol Dominicana"]], ["ara-jet", ["Arajet Dominican Republic", "Arajet flight Dominicana"]]],

  // Africa and the Middle East.
  ["DZ", "MEA", "DZD", ["saidaly", ["Saidal pharmacy Algeria", "Saidal Algerie sante"]], ["air-algerie", ["Air Algerie Algeria", "Air Algerie AH flight"]]],
  ["TN", "MEA", "TND", ["pct", ["Pharmacie Centrale de Tunisie", "PCT Tunisia pharmacy"]], ["tunisair", ["Tunisair Tunisia", "Tunisair TU flight"]]],
  ["EG", "MEA", "EGP", ["el-ezaby", ["El Ezaby Pharmacy Egypt", "Elezzaby pharmacy Egypt"]], ["egyptair", ["EgyptAir Egypt", "EgyptAir MS flight"]]],
  ["KE", "AFR", "KES", ["goodlife", ["Goodlife Pharmacy Kenya", "Goodlife Kenya health"]], ["kenya-airways", ["Kenya Airways Kenya", "Kenya Airways KQ flight"]]],
  ["TZ", "AFR", "TZS", ["jd-pharmacy", ["JD Pharmacy Tanzania", "JD Pharmacy Dar es Salaam"]], ["precision-air", ["Precision Air Tanzania", "Precision PW flight Tanzania"]]],
  ["UG", "AFR", "UGX", ["guardian", ["Guardian Health Pharmacy Uganda", "Guardian Pharmacy Kampala Uganda"]], ["uganda-airlines", ["Uganda Airlines Uganda", "Uganda Airlines UR flight"]]],
  ["RW", "AFR", "RWF", ["kipharma", ["Kipharma Rwanda pharmacy", "Kipharma Kigali"]], ["rwandair", ["RwandAir Rwanda", "RwandAir WB flight"]]],
  ["SN", "AFR", "XOF", ["guigon", ["Pharmacie Guigon Senegal", "Guigon pharmacy Dakar"]], ["air-senegal", ["Air Senegal Senegal", "Air Senegal HC flight"]]],
  ["CI", "AFR", "XOF", ["pharmacie-paix", ["Pharmacie de la Paix Cote Ivoire", "Pharmacie Paix Abidjan"]], ["air-civ", ["Air Cote d Ivoire", "Air Cote Ivoire HF flight"]]],
  ["ZA", "AFR", "ZAR", ["clicks", ["Clicks Pharmacy South Africa", "Clicks health South Africa"]], ["flysafair", ["FlySafair South Africa", "FlySafair FA flight"]]],
  ["ZM", "AFR", "ZMW", ["link", ["Link Pharmacy Zambia", "Link Pharmacy Lusaka"]], ["proflight", ["Proflight Zambia", "Proflight P0 flight Zambia"]]],
  ["ZW", "AFR", "USD", ["booties", ["Booties Pharmacies Zimbabwe", "Booties Pharmacy Harare"]], ["fastjet", ["Fastjet Zimbabwe", "Fastjet FN flight Zimbabwe"]]],
  ["GH", "AFR", "GHS", ["ernest", ["Ernest Chemists Ghana", "Ernest Pharmacy Ghana"]], ["awa", ["Africa World Airlines Ghana", "AWA flight Ghana"]]],
  ["NG", "AFR", "NGN", ["healthplus", ["HealthPlus Pharmacy Nigeria", "Health Plus Nigeria pharmacy"]], ["air-peace", ["Air Peace Nigeria", "Air Peace P4 flight"]]],
  ["MA", "MEA", "MAD", ["parashop", ["Parashop Morocco pharmacy", "Parashop Maroc sante"]], ["ram", ["Royal Air Maroc Morocco", "Royal Air Maroc AT flight"]]],

  // Asia.
  ["JP", "EAS", "JPY", ["matsukiyo", ["Matsumoto Kiyoshi Japan", "マツモトキヨシ 日本"]], ["ana", ["All Nippon Airways Japan", "ANA flight Japan"]]],
  ["KR", "EAS", "KRW", ["olive-young", ["Olive Young Korea health", "올리브영 대한민국"]], ["korean-air", ["Korean Air Korea", "대한항공 대한민국"]]],
  ["CN", "EAS", "CNY", ["sinopharm", ["Sinopharm pharmacy China", "国药控股 药房 中国"]], ["china-southern", ["China Southern Airlines", "中国南方航空"]]],
  ["IN", "SAS", "INR", ["apollo", ["Apollo Pharmacy India", "Apollo 24 7 pharmacy India"]], ["indigo", ["IndiGo Airlines India", "IndiGo 6E flight India"]]],
  ["BD", "SAS", "BDT", ["lazz", ["Lazz Pharma Bangladesh", "Lazz Pharmacy Dhaka"]], ["biman", ["Biman Bangladesh Airlines", "Biman BG flight Bangladesh"]]],
  ["PK", "SAS", "PKR", ["d-watson", ["D Watson Pharmacy Pakistan", "DWatson Islamabad pharmacy"]], ["pia", ["Pakistan International Airlines", "PIA PK flight Pakistan"]]],
  ["LK", "SAS", "LKR", ["healthguard", ["Healthguard Pharmacy Sri Lanka", "Healthguard Lanka"]], ["srilankan", ["SriLankan Airlines Sri Lanka", "SriLankan UL flight"]]],
  ["NP", "SAS", "NPR", ["jeevee", ["Jeevee Health Nepal", "Jeevee pharmacy Nepal"]], ["buddha-air", ["Buddha Air Nepal", "Buddha U4 flight Nepal"]]],
  ["KZ", "CAS", "KZT", ["europharma", ["Europharma Kazakhstan", "Еврофарма Казахстан"]], ["air-astana", ["Air Astana Kazakhstan", "Air Astana KC flight"]]],
  ["UZ", "CAS", "UZS", ["oxymed", ["OxyMed pharmacy Uzbekistan", "OxyMed dorixona Uzbekistan"]], ["uzbekistan-airways", ["Uzbekistan Airways Uzbekistan", "Uzbekistan HY flight"]]],
];

export const WORLD_TRAVEL_HEALTH_CONTEXT_ENTRIES: ContextEntry[] = PACKS.flatMap((pack) => [
  entry(pack, pack[3], "health"),
  entry(pack, pack[4], "travel"),
]);
