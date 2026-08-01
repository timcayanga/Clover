import type { ContextEntry, RegionalParsingProfile } from "@/lib/context-corpus";

type Country = { code: string; region: string; currency: string };
type Seed = [id: string, aliases: string[]];
type MarketPack = Country & {
  financial: [id: string, aliases: string[], rail?: string];
  bank: Seed;
  transport: Seed;
  grocery: Seed;
  utility: Seed;
};

const institution = (country: Country, seed: Seed): ContextEntry => ({
  id: `${country.code.toLowerCase()}-${seed[0]}`,
  aliases: seed[1],
  signalKind: "institution",
  countryCode: country.code,
  regionCode: country.region,
  institutionType: "bank",
  currency: country.currency,
  counterpartyType: "financial_institution",
  confidence: 80,
});

const payment = (country: Country, seed: Seed, paymentRail: string): ContextEntry => ({
  id: `${country.code.toLowerCase()}-${seed[0]}`,
  aliases: seed[1],
  signalKind: "payment_rail",
  countryCode: country.code,
  regionCode: country.region,
  paymentRail,
  institutionType: "wallet",
  currency: country.currency,
  counterpartyType: "wallet",
  purposeHint: "transfer",
  confidence: 84,
});

const merchant = (
  country: Country,
  seed: Seed,
  categoryHint: string,
  purposeHint: NonNullable<ContextEntry["purposeHint"]>,
  counterpartyType: NonNullable<ContextEntry["counterpartyType"]> = "merchant",
): ContextEntry => ({
  id: `${country.code.toLowerCase()}-${seed[0]}`,
  aliases: seed[1],
  signalKind: "merchant",
  countryCode: country.code,
  regionCode: country.region,
  currency: country.currency,
  categoryHint,
  purposeHint,
  counterpartyType,
  travelLikely: purposeHint === "transport",
  confidence: 78,
});

/**
 * Fourth reviewed worldwide pack. Every shared brand is country-qualified.
 * Payment infrastructure supplies provenance only; ownership evidence still
 * decides whether a payment is an expense or a transfer between owned accounts.
 */
const MARKET_PACKS: MarketPack[] = [
  { code: "AD", region: "EUR", currency: "EUR", financial: ["morabanc", ["morabanc andorra", "mora banc andorra"]], bank: ["creand", ["creand credit andorra", "credit andorra creand"]], transport: ["andbus", ["andbus andorra", "andorra bus andbus"]], grocery: ["caprabo", ["caprabo andorra", "caprabo supermercat andorra"]], utility: ["feda", ["feda andorra electricity", "forces electriques andorra"]] },
  { code: "LI", region: "EUR", currency: "CHF", financial: ["llb", ["liechtensteinische landesbank", "llb liechtenstein"]], bank: ["lgt", ["lgt bank liechtenstein", "lgt vaduz"]], transport: ["liemobil", ["liemobil liechtenstein", "lie mobil bus liechtenstein"]], grocery: ["coop", ["coop liechtenstein supermarket", "coop vaduz grocery"]], utility: ["lkw", ["liechtensteinische kraftwerke", "lkw liechtenstein electricity"]] },
  { code: "MC", region: "EUR", currency: "EUR", financial: ["cfm", ["cfm indosuez monaco", "credit foncier monaco"]], bank: ["bpm", ["banque populaire mediterranee monaco", "bpm monaco bank"]], transport: ["cam", ["compagnie autobus monaco", "cam bus monaco"]], grocery: ["carrefour", ["carrefour monaco", "carrefour market monaco"]], utility: ["smeg", ["smeg monaco electricity", "societe monegasque electricite gaz"]] },
  { code: "SM", region: "EUR", currency: "EUR", financial: ["bsm", ["banca di san marino", "bsm san marino bank"]], bank: ["carisp", ["cassa di risparmio san marino", "carisp san marino"]], transport: ["benedettini", ["benedettini bus san marino", "san marino rimini bus benedettini"]], grocery: ["conad", ["conad san marino", "conad supermarket san marino"]], utility: ["aass", ["aass san marino utilities", "azienda autonoma servizi san marino"]] },
  { code: "XK", region: "EUR", currency: "EUR", financial: ["procredit", ["procredit bank kosovo", "procredit kosove"]], bank: ["raiffeisen", ["raiffeisen bank kosovo", "raiffeisen kosove"]], transport: ["trafiku", ["trafiku urban prishtina", "trafiku urban kosovo"]], grocery: ["viva-fresh", ["viva fresh store kosovo", "viva fresh prishtina"]], utility: ["keds", ["keds kosovo electricity", "kosovo electricity distribution keds"]] },
  { code: "BY", region: "EUR", currency: "BYN", financial: ["belarusbank", ["belarusbank belarus", "беларусбанк беларусь"]], bank: ["priorbank", ["priorbank belarus", "приорбанк беларусь"]], transport: ["minsktrans", ["minsktrans belarus", "минсктранс беларусь"]], grocery: ["euroopt", ["euroopt belarus supermarket", "евроопт беларусь"]], utility: ["belenergo", ["belenergo belarus electricity", "белэнерго беларусь"]] },
  { code: "IR", region: "MEA", currency: "IRR", financial: ["bank-melli", ["bank melli iran", "بانک ملی ایران"]], bank: ["bank-mellat", ["bank mellat iran", "بانک ملت ایران"]], transport: ["tehran-metro", ["tehran metro iran", "مترو تهران ایران"]], grocery: ["refah", ["refah chain stores iran", "فروشگاه رفاه ایران"]], utility: ["tavanir", ["tavanir iran electricity", "توانیر برق ایران"]] },
  { code: "PS", region: "MEA", currency: "ILS", financial: ["bop", ["bank of palestine", "بنك فلسطين"]], bank: ["qib", ["quds islamic bank palestine", "بنك القدس فلسطين"]], transport: ["ramallah-bus", ["ramallah bus palestine", "باص رام الله فلسطين"]], grocery: ["bravo", ["bravo supermarket palestine", "bravo market ramallah"]], utility: ["jedco", ["jerusalem district electricity palestine", "jedco palestine electricity"]] },
  { code: "YE", region: "MEA", currency: "YER", financial: ["cac-bank", ["cac bank yemen", "بنك التسليف التعاوني اليمن"]], bank: ["ykb", ["yemen kuwait bank", "بنك اليمن والكويت"]], transport: ["yemenia", ["yemenia airways yemen", "الخطوط الجوية اليمنية"]], grocery: ["shumaila", ["shumaila hari supermarket yemen", "شميلة هاري اليمن"]], utility: ["pec", ["public electricity corporation yemen", "مؤسسة الكهرباء اليمن"]] },
  { code: "LY", region: "MEA", currency: "LYD", financial: ["jumhouria", ["jumhouria bank libya", "مصرف الجمهورية ليبيا"]], bank: ["wahda", ["wahda bank libya", "مصرف الوحدة ليبيا"]], transport: ["afriqiyah", ["afriqiyah airways libya", "الخطوط الافريقية ليبيا"]], grocery: ["mahary", ["mahary supermarket libya", "المهاري للتسوق ليبيا"]], utility: ["gecol", ["gecol libya electricity", "الشركة العامة للكهرباء ليبيا"]] },
  { code: "ML", region: "AFR", currency: "XOF", financial: ["pispi", ["pi spi mali", "pispi paiement mali"], "uemoa_pispi"], bank: ["boa", ["bank of africa mali", "boa mali banque"]], transport: ["sotrama", ["sotrama bamako mali", "sotrama transport mali"]], grocery: ["miniprix", ["miniprix mali supermarket", "miniprix bamako"]], utility: ["edm", ["energie du mali edm", "edm sa mali electricity"]] },
  { code: "BF", region: "AFR", currency: "XOF", financial: ["pispi", ["pi spi burkina faso", "pispi paiement burkina"], "uemoa_pispi"], bank: ["coris", ["coris bank burkina faso", "coris banque burkina"]], transport: ["sotraco", ["sotraco burkina faso", "sotraco bus ouagadougou"]], grocery: ["marina", ["marina market burkina faso", "marina supermarket ouagadougou"]], utility: ["sonabel", ["sonabel burkina faso", "sonabel electricity burkina"]] },
  { code: "NE", region: "AFR", currency: "XOF", financial: ["pispi", ["pi spi niger", "pispi paiement niger"], "uemoa_pispi"], bank: ["boa", ["bank of africa niger", "boa niger banque"]], transport: ["sotruni", ["sotruni niger", "sotruni bus niamey"]], grocery: ["hadad", ["hadad supermarket niger", "hadad niamey grocery"]], utility: ["nigelec", ["nigelec niger electricity", "societe nigerienne electricite"]] },
  { code: "GN", region: "AFR", currency: "GNF", financial: ["orange-money", ["orange money guinea", "orange money guinee"]], bank: ["vista", ["vista bank guinea", "vista bank guinee"]], transport: ["sotragui", ["sotragui guinea", "sotragui conakry bus"]], grocery: ["prima", ["prima center guinea supermarket", "prima center conakry"]], utility: ["edg", ["electricite de guinee", "edg guinea electricity"]] },
  { code: "LR", region: "AFR", currency: "LRD", financial: ["lonestar", ["lonestar cell mtn mobile money liberia", "mtn momo liberia"]], bank: ["lbdi", ["liberian bank development investment", "lbdi liberia"]], transport: ["nta", ["national transit authority liberia", "nta bus liberia"]], grocery: ["stop-shop", ["stop and shop liberia supermarket", "stop n shop monrovia"]], utility: ["lec", ["liberia electricity corporation", "lec electricity liberia"]] },
  { code: "GM", region: "AFR", currency: "GMD", financial: ["qmoney", ["qmoney gambia", "qcell qmoney gambia"]], bank: ["trust", ["trust bank gambia", "trust bank limited gambia"]], transport: ["gtsc", ["gambia transport service company", "gtsc bus gambia"]], grocery: ["marouns", ["marouns supermarket gambia", "maroun supermarket banjul"]], utility: ["nawec", ["nawec gambia utilities", "national water electricity gambia"]] },
  { code: "MR", region: "AFR", currency: "MRU", financial: ["bankily", ["bankily mauritania", "bankily mauritel mauritanie"]], bank: ["bpm", ["banque populaire mauritanie", "bpm mauritania"]], transport: ["stp", ["stp transport nouakchott", "societe transport public mauritanie"]], grocery: ["carrefour", ["carrefour mauritania", "carrefour nouakchott"]], utility: ["somelec", ["somelec mauritania electricity", "somelec mauritanie"]] },
  { code: "SD", region: "AFR", currency: "SDG", financial: ["bok", ["bank of khartoum sudan", "بنك الخرطوم السودان"]], bank: ["fibs", ["faisal islamic bank sudan", "بنك فيصل الاسلامي السوداني"]], transport: ["sudan-airways", ["sudan airways", "الخطوط الجوية السودانية"]], grocery: ["afra", ["afra shopping center sudan", "afra mall khartoum grocery"]], utility: ["sedc", ["sudanese electricity distribution", "شركة توزيع الكهرباء السودان"]] },
  { code: "DJ", region: "AFR", currency: "DJF", financial: ["dmoney", ["d money djibouti", "d-money djibouti telecom"]], bank: ["bcimr", ["bcimr djibouti", "banque commerce industrie mer rouge"]], transport: ["djibouti-bus", ["djibouti city bus", "transport urbain djibouti"]], grocery: ["casino", ["casino supermarket djibouti", "casino djibouti grocery"]], utility: ["edd", ["electricite de djibouti", "edd djibouti electricity"]] },
  { code: "SO", region: "AFR", currency: "SOS", financial: ["sips", ["somalia instant payment system", "sips somalia somqr"], "somalia_sips"], bank: ["premier", ["premier bank somalia", "premier bank mogadishu"]], transport: ["dalmar", ["dalmar transport somalia", "dalmar bus mogadishu"]], grocery: ["hayat", ["hayat market somalia", "hayat supermarket mogadishu"]], utility: ["beco", ["beco electricity somalia", "benadir electric company somalia"]] },
  { code: "LS", region: "AFR", currency: "LSL", financial: ["mpesa", ["vodacom mpesa lesotho", "m-pesa lesotho"]], bank: ["standard", ["standard lesotho bank", "standard bank lesotho"]], transport: ["minibus", ["maseru minibus lesotho", "public minibus lesotho"]], grocery: ["shoprite", ["shoprite lesotho", "shoprite maseru supermarket"]], utility: ["lec", ["lesotho electricity company", "lec electricity lesotho"]] },
  { code: "SZ", region: "AFR", currency: "SZL", financial: ["momo", ["mtn mobile money eswatini", "mtn momo eswatini"]], bank: ["eswatini-bank", ["eswatini bank", "eswatini development savings bank"]], transport: ["kombis", ["kombis transport eswatini", "public minibus eswatini"]], grocery: ["picknpay", ["pick n pay eswatini", "picknpay mbabane"]], utility: ["eec", ["eswatini electricity company", "eec electricity eswatini"]] },
  { code: "CG", region: "AFR", currency: "XAF", financial: ["airtel-money", ["airtel money congo brazzaville", "airtel money republic congo"]], bank: ["bgfi", ["bgfibank congo brazzaville", "bgfi congo republic"]], transport: ["stpu", ["stpu brazzaville congo", "bus public brazzaville stpu"]], grocery: ["casino", ["casino supermarket congo brazzaville", "casino brazzaville grocery"]], utility: ["e2c", ["energie electrique congo e2c", "e2c congo electricity"]] },
  { code: "CF", region: "AFR", currency: "XAF", financial: ["orange-money", ["orange money central african republic", "orange money centrafrique"]], bank: ["ecobank", ["ecobank central african republic", "ecobank centrafrique"]], transport: ["socatraf", ["socatraf bangui", "socatraf transport centrafrique"]], grocery: ["leader-price", ["leader price bangui", "leader price centrafrique supermarket"]], utility: ["enerca", ["enerca central african republic", "enerca electricity centrafrique"]] },
  { code: "GQ", region: "AFR", currency: "XAF", financial: ["bange", ["bange equatorial guinea", "banco nacional guinea ecuatorial"]], bank: ["ccei", ["ccei bank equatorial guinea", "ccei guinea ecuatorial"]], transport: ["ceiba", ["ceiba intercontinental equatorial guinea", "ceiba guinea ecuatorial"]], grocery: ["martinez", ["martinez hermanos equatorial guinea", "martinez hermanos malabo supermarket"]], utility: ["segesa", ["segesa equatorial guinea electricity", "segesa guinea ecuatorial"]] },
  { code: "ST", region: "AFR", currency: "STN", financial: ["bistp", ["banco internacional sao tome principe", "bistp sao tome"]], bank: ["afriland", ["afriland first bank sao tome", "afriland sao tome principe"]], transport: ["stp-airways", ["stp airways sao tome", "stp airways principe"]], grocery: ["ckdo", ["ckdo supermarket sao tome", "ckdo sao tome grocery"]], utility: ["emae", ["emae sao tome utilities", "empresa agua electricidade sao tome"]] },
  { code: "KM", region: "AFR", currency: "KMF", financial: ["bfc", ["banque federale commerce comoros", "bfc comoros"]], bank: ["exim", ["exim bank comoros", "exim banque comores"]], transport: ["air-comores", ["air comoros", "air comores aviation"]], grocery: ["sodifram", ["sodifram comoros supermarket", "sodifram moroni"]], utility: ["sonelec", ["sonelec comoros electricity", "sonelec comores"]] },
  { code: "TM", region: "CAS", currency: "TMT", financial: ["altyn-asyr", ["altyn asyr card turkmenistan", "алтын асыр туркменистан"]], bank: ["turkmenistan-bank", ["state commercial bank turkmenistan", "туркменистан банк"]], transport: ["ashgabat-card", ["ashgabat city card bus", "ашхабад автобус карта"]], grocery: ["yimpas", ["yimpas turkmenistan supermarket", "yimpas ashgabat"]], utility: ["turkmenenergo", ["turkmenenergo electricity", "туркменэнерго"]] },
  { code: "AF", region: "SAS", currency: "AFN", financial: ["afpay", ["afpay card afghanistan", "afghanistan payments system afpay"], "afghanistan_afpay"], bank: ["azizi", ["azizi bank afghanistan", "عزیزی بانک افغانستان"]], transport: ["millie-bus", ["millie bus kabul afghanistan", "ملی بس کابل"]], grocery: ["finest", ["finest supermarket kabul", "finest supermarket afghanistan"]], utility: ["dabs", ["da afghanistan breshna sherikat", "dabs electricity afghanistan"]] },
  { code: "PW", region: "OCE", currency: "USD", financial: ["boh", ["bank of hawaii palau", "bankoh palau"]], bank: ["bankpacific", ["bankpacific palau", "bank pacific koror"]], transport: ["bbi-shuttle", ["belau bus initiative palau", "bbi shuttle palau"]], grocery: ["surangels", ["surangels supermarket palau", "surangel sons palau grocery"]], utility: ["ppuc", ["palau public utilities corporation", "ppuc palau utilities"]] },
];

export const WORLD_CONTEXT_ENTRIES_4: ContextEntry[] = MARKET_PACKS.flatMap((pack) => {
  const country: Country = pack;
  const financialSeed: Seed = [pack.financial[0], pack.financial[1]];
  return [
    pack.financial[2] ? payment(country, financialSeed, pack.financial[2]) : institution(country, financialSeed),
    institution(country, pack.bank),
    merchant(country, pack.transport, "Transport", "transport", "transport_provider"),
    merchant(country, pack.grocery, "Groceries", "groceries", "grocer"),
    merchant(country, pack.utility, "Bills & Utilities", "utilities", "utility_provider"),
  ];
});

const DEPTH: Array<[Country, Seed, string, NonNullable<ContextEntry["purposeHint"]>, NonNullable<ContextEntry["counterpartyType"]>?]> = [
  [{ code: "AO", region: "AFR", currency: "AOA" }, ["unitel", ["unitel angola telecom", "unitel mobile angola"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "AO", region: "AFR", currency: "AOA" }, ["girassol", ["clinica girassol angola", "hospital girassol luanda"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "BJ", region: "AFR", currency: "XOF" }, ["mtn", ["mtn benin telecom", "mtn mobile benin"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "BJ", region: "AFR", currency: "XOF" }, ["clinique-mahouena", ["clinique mahouena benin", "mahouena medical cotonou"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "CM", region: "AFR", currency: "XAF" }, ["mtn", ["mtn cameroon telecom", "mtn cameroun mobile"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "CM", region: "AFR", currency: "XAF" }, ["douala-general", ["douala general hospital cameroon", "hopital general douala"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "CD", region: "AFR", currency: "CDF" }, ["vodacom", ["vodacom dr congo telecom", "vodacom rdc mobile"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "CD", region: "AFR", currency: "CDF" }, ["hj-hospital", ["hj hospitals kinshasa", "hj hospital dr congo"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "CV", region: "AFR", currency: "CVE" }, ["alou", ["alou cabo verde telecom", "alou cape verde mobile"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "CV", region: "AFR", currency: "CVE" }, ["agostinho-neto", ["hospital agostinho neto cabo verde", "han praia cabo verde"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "GA", region: "AFR", currency: "XAF" }, ["moov", ["moov africa gabon telecom", "moov gabon mobile"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "GA", region: "AFR", currency: "XAF" }, ["el-rapha", ["polyclinique el rapha gabon", "el rapha libreville hospital"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "HT", region: "CAR", currency: "HTG" }, ["digicel", ["digicel haiti telecom", "digicel mobile haiti"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "HT", region: "CAR", currency: "HTG" }, ["canape-vert", ["hopital canape vert haiti", "canape vert hospital port au prince"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "IQ", region: "MEA", currency: "IQD" }, ["asiacell", ["asiacell iraq telecom", "آسياسيل العراق"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "IQ", region: "MEA", currency: "IQD" }, ["faruk-medical", ["faruk medical city iraq", "مدينة فاروق الطبية العراق"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "LB", region: "MEA", currency: "LBP" }, ["touch", ["touch lebanon telecom", "touch mobile lebanon"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "LB", region: "MEA", currency: "LBP" }, ["aubmc", ["aub medical center lebanon", "american university beirut medical center"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "MG", region: "AFR", currency: "MGA" }, ["telma", ["telma madagascar telecom", "telma mobile madagascar"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "MG", region: "AFR", currency: "MGA" }, ["hjra", ["hjra hospital madagascar", "hospital joseph ravoahangy antananarivo"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "ME", region: "EUR", currency: "EUR" }, ["one", ["one montenegro telecom", "one crna gora mobile"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "ME", region: "EUR", currency: "EUR" }, ["codra", ["codra hospital montenegro", "codra bolnica podgorica"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "MV", region: "SAS", currency: "MVR" }, ["dhiraagu", ["dhiraagu maldives telecom", "dhiraagu mobile maldives"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "MV", region: "SAS", currency: "MVR" }, ["adk", ["adk hospital maldives", "adk medical male maldives"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "NA", region: "AFR", currency: "NAD" }, ["mtn", ["mtn namibia telecom", "mtn business namibia"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "NA", region: "AFR", currency: "NAD" }, ["lady-pohamba", ["lady pohamba private hospital", "lpph namibia"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "PG", region: "OCE", currency: "PGK" }, ["digicel", ["digicel papua new guinea", "digicel png telecom"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "PG", region: "OCE", currency: "PGK" }, ["pacific-international", ["pacific international hospital png", "pih port moresby"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "SC", region: "AFR", currency: "SCR" }, ["cable-wireless", ["cable wireless seychelles telecom", "cw seychelles mobile"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "SC", region: "AFR", currency: "SCR" }, ["seychelles-hospital", ["seychelles hospital mahe", "victoria hospital seychelles"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "SL", region: "AFR", currency: "SLE" }, ["africell", ["africell sierra leone telecom", "africell mobile sierra leone"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "SL", region: "AFR", currency: "SLE" }, ["choithram-hospital", ["choithram memorial hospital sierra leone", "choithram hospital freetown"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "TJ", region: "CAS", currency: "TJS" }, ["tcell", ["tcell tajikistan telecom", "tcell mobile tajikistan"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "TJ", region: "CAS", currency: "TJS" }, ["ibn-sino", ["ibn sino hospital tajikistan", "ibn sina clinic dushanbe"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "TG", region: "AFR", currency: "XOF" }, ["togocom", ["togocom togo telecom", "togocom mobile togo"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "TG", region: "AFR", currency: "XOF" }, ["biasa", ["clinique biasa togo", "biasa medical lome"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "VU", region: "OCE", currency: "VUV" }, ["vodafone", ["vodafone vanuatu telecom", "vodafone mobile vanuatu"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "VU", region: "OCE", currency: "VUV" }, ["vila-central", ["vila central hospital vanuatu", "vch port vila"]], "Health & Wellness", "healthcare", "healthcare_provider"],
  [{ code: "WS", region: "OCE", currency: "WST" }, ["digicel", ["digicel samoa telecom", "digicel mobile samoa"]], "Bills & Utilities", "telecom", "telecom_provider"],
  [{ code: "WS", region: "OCE", currency: "WST" }, ["tupua-tamasese", ["tupua tamasese meaole hospital", "ttm hospital samoa"]], "Health & Wellness", "healthcare", "healthcare_provider"],
];

WORLD_CONTEXT_ENTRIES_4.push(...DEPTH.map(([country, seed, category, purpose, type]) => merchant(country, seed, category, purpose, type)));

const profile = (
  countryCode: string, regionCode: string, locales: string[], languages: string[],
  dateOrder: RegionalParsingProfile["dateOrder"], decimalSeparator: RegionalParsingProfile["decimalSeparator"],
  groupingSeparator: RegionalParsingProfile["groupingSeparator"], defaultCurrency: string, suffixes: string[], confidence = 68,
): RegionalParsingProfile => ({ countryCode, regionCode, locales, primaryLocale: locales[0], languages, dateOrder, decimalSeparator, groupingSeparator, defaultCurrency, legalEntitySuffixes: suffixes, confidence });

export const WORLD_REGIONAL_PROFILES_4: RegionalParsingProfile[] = [
  profile("AD", "EUR", ["ca-AD", "es-AD"], ["ca", "es"], "dmy", ",", ".", "EUR", ["sa", "sl", "societat"]),
  profile("LI", "EUR", ["de-LI"], ["de"], "dmy", ".", "'", "CHF", ["ag", "gmbh", "stiftung"]),
  profile("MC", "EUR", ["fr-MC"], ["fr"], "dmy", ",", " ", "EUR", ["sam", "sarl", "sa"]),
  profile("SM", "EUR", ["it-SM"], ["it"], "dmy", ",", ".", "EUR", ["spa", "srl", "societa"]),
  profile("XK", "EUR", ["sq-XK", "sr-XK"], ["sq", "sr"], "dmy", ",", ".", "EUR", ["shpk", "doo", "ad"]),
  profile("BY", "EUR", ["be-BY", "ru-BY"], ["be", "ru"], "dmy", ",", " ", "BYN", ["ooo", "oao", "zao"]),
  profile("IR", "MEA", ["fa-IR"], ["fa"], "ymd", ".", ",", "IRR", ["co", "pjsc", "private"]),
  profile("PS", "MEA", ["ar-PS", "en-PS"], ["ar", "en"], "dmy", ".", ",", "ILS", ["ltd", "plc", "co"]),
  profile("YE", "MEA", ["ar-YE"], ["ar"], "dmy", ".", ",", "YER", ["ltd", "co", "company"]),
  profile("LY", "MEA", ["ar-LY", "en-LY"], ["ar", "en"], "dmy", ".", ",", "LYD", ["ltd", "co", "company"]),
  profile("ML", "AFR", ["fr-ML", "bm-ML"], ["fr", "bm"], "dmy", ",", " ", "XOF", ["sarl", "sa", "ets"]),
  profile("BF", "AFR", ["fr-BF"], ["fr"], "dmy", ",", " ", "XOF", ["sarl", "sa", "ets"]),
  profile("NE", "AFR", ["fr-NE", "ha-NE"], ["fr", "ha"], "dmy", ",", " ", "XOF", ["sarl", "sa", "ets"]),
  profile("GN", "AFR", ["fr-GN"], ["fr"], "dmy", ",", " ", "GNF", ["sarl", "sa", "ets"]),
  profile("LR", "AFR", ["en-LR"], ["en"], "mdy", ".", ",", "LRD", ["ltd", "limited", "inc"]),
  profile("GM", "AFR", ["en-GM"], ["en"], "dmy", ".", ",", "GMD", ["ltd", "limited", "plc"]),
  profile("MR", "AFR", ["ar-MR", "fr-MR"], ["ar", "fr"], "dmy", ",", " ", "MRU", ["sarl", "sa", "ets"]),
  profile("SD", "AFR", ["ar-SD", "en-SD"], ["ar", "en"], "dmy", ".", ",", "SDG", ["ltd", "co", "company"]),
  profile("DJ", "AFR", ["fr-DJ", "ar-DJ"], ["fr", "ar"], "dmy", ",", " ", "DJF", ["sarl", "sa", "ets"]),
  profile("SO", "AFR", ["so-SO", "ar-SO"], ["so", "ar"], "dmy", ".", ",", "SOS", ["ltd", "limited", "company"], 70),
  profile("LS", "AFR", ["en-LS", "st-LS"], ["en", "st"], "dmy", ".", ",", "LSL", ["pty ltd", "limited", "cc"]),
  profile("SZ", "AFR", ["en-SZ", "ss-SZ"], ["en", "ss"], "dmy", ".", ",", "SZL", ["pty ltd", "limited", "company"]),
  profile("CG", "AFR", ["fr-CG"], ["fr"], "dmy", ",", " ", "XAF", ["sarl", "sa", "ets"]),
  profile("CF", "AFR", ["fr-CF", "sg-CF"], ["fr", "sg"], "dmy", ",", " ", "XAF", ["sarl", "sa", "ets"]),
  profile("GQ", "AFR", ["es-GQ", "fr-GQ"], ["es", "fr"], "dmy", ",", ".", "XAF", ["sa", "sl", "sarl"]),
  profile("ST", "AFR", ["pt-ST"], ["pt"], "dmy", ",", ".", "STN", ["lda", "sa", "unipessoal"]),
  profile("KM", "AFR", ["fr-KM", "ar-KM"], ["fr", "ar"], "dmy", ",", " ", "KMF", ["sarl", "sa", "ets"]),
  profile("TM", "CAS", ["tk-TM", "ru-TM"], ["tk", "ru"], "dmy", ",", " ", "TMT", ["hj", "jsc", "llc"]),
  profile("AF", "SAS", ["fa-AF", "ps-AF"], ["fa", "ps"], "ymd", ".", ",", "AFN", ["ltd", "co", "company"], 70),
  profile("PW", "OCE", ["en-PW"], ["en"], "mdy", ".", ",", "USD", ["inc", "llc", "corporation"]),
];
