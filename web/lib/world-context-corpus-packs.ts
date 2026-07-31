import type { ContextEntry, RegionalParsingProfile } from "@/lib/context-corpus";

type Country = {
  code: string;
  region: string;
  currency: string;
};

const rail = (country: Country, id: string, aliases: string[], paymentRail: string, confidence = 82): ContextEntry => ({
  id: `${country.code.toLowerCase()}-${id}`,
  aliases,
  signalKind: "payment_rail",
  countryCode: country.code,
  regionCode: country.region,
  paymentRail,
  institutionType: "wallet",
  currency: country.currency,
  counterpartyType: "wallet",
  purposeHint: "transfer",
  confidence,
});

const bank = (country: Country, id: string, aliases: string[], confidence = 80): ContextEntry => ({
  id: `${country.code.toLowerCase()}-${id}`,
  aliases,
  signalKind: "institution",
  countryCode: country.code,
  regionCode: country.region,
  institutionType: "bank",
  currency: country.currency,
  counterpartyType: "financial_institution",
  confidence,
});

const merchant = (
  country: Country,
  id: string,
  aliases: string[],
  categoryHint: string,
  purposeHint: NonNullable<ContextEntry["purposeHint"]>,
  counterpartyType: NonNullable<ContextEntry["counterpartyType"]> = "merchant",
  confidence = 78,
): ContextEntry => ({
  id: `${country.code.toLowerCase()}-${id}`,
  aliases,
  signalKind: purposeHint === "travel" ? "travel" : "merchant",
  countryCode: country.code,
  regionCode: country.region,
  currency: country.currency,
  categoryHint,
  purposeHint,
  counterpartyType,
  travelLikely: purposeHint === "travel" || purposeHint === "transport",
  confidence,
});

const AR = { code: "AR", region: "LATAM", currency: "ARS" };
const PE = { code: "PE", region: "LATAM", currency: "PEN" };
const UY = { code: "UY", region: "LATAM", currency: "UYU" };
const EC = { code: "EC", region: "LATAM", currency: "USD" };
const CR = { code: "CR", region: "LATAM", currency: "CRC" };
const PA = { code: "PA", region: "LATAM", currency: "PAB" };
const DO = { code: "DO", region: "LATAM", currency: "DOP" };
const GT = { code: "GT", region: "LATAM", currency: "GTQ" };
const PT = { code: "PT", region: "EUR", currency: "EUR" };
const FI = { code: "FI", region: "EUR", currency: "EUR" };
const CZ = { code: "CZ", region: "EUR", currency: "CZK" };
const HU = { code: "HU", region: "EUR", currency: "HUF" };
const RO = { code: "RO", region: "EUR", currency: "RON" };
const HR = { code: "HR", region: "EUR", currency: "EUR" };
const BG = { code: "BG", region: "EUR", currency: "BGN" };
const EG = { code: "EG", region: "MEA", currency: "EGP" };
const IL = { code: "IL", region: "MEA", currency: "ILS" };
const MA = { code: "MA", region: "MEA", currency: "MAD" };
const JO = { code: "JO", region: "MEA", currency: "JOD" };
const OM = { code: "OM", region: "MEA", currency: "OMR" };
const BH = { code: "BH", region: "MEA", currency: "BHD" };
const UG = { code: "UG", region: "AFR", currency: "UGX" };
const RW = { code: "RW", region: "AFR", currency: "RWF" };
const ET = { code: "ET", region: "AFR", currency: "ETB" };
const SN = { code: "SN", region: "AFR", currency: "XOF" };
const CI = { code: "CI", region: "AFR", currency: "XOF" };
const MU = { code: "MU", region: "AFR", currency: "MUR" };
const BW = { code: "BW", region: "AFR", currency: "BWP" };
const NP = { code: "NP", region: "SAS", currency: "NPR" };

/**
 * Reviewed country packs use country-qualified aliases for names that are
 * ambiguous across markets. Payment rails deliberately provide context only;
 * they do not assert an expense or own-account transfer transaction type.
 */
export const WORLD_CONTEXT_ENTRIES: ContextEntry[] = [
  // Latin America.
  rail(AR, "transferencias-3", ["transferencias 3.0 argentina", "pago con transferencia argentina"], "argentina_transferencias_3", 88),
  rail(AR, "modo", ["modo argentina", "billetera modo"], "argentina_wallet"),
  bank(AR, "galicia", ["banco galicia argentina", "galicia mas argentina"]),
  merchant(AR, "sube", ["tarjeta sube", "sube transporte argentina"], "Transport", "transport", "transport_provider"),
  merchant(AR, "coto", ["coto supermercado", "coto argentina supermercados"], "Groceries", "groceries", "grocer"),
  rail(PE, "yape", ["yape peru", "pago yape"], "peru_wallet", 88),
  rail(PE, "plin", ["plin peru", "pago plin"], "peru_wallet", 88),
  bank(PE, "bcp", ["banco de credito del peru", "bcp peru"]),
  merchant(PE, "metropolitano", ["metropolitano lima", "atu metropolitano"], "Transport", "transport", "transport_provider"),
  merchant(PE, "plaza-vea", ["plaza vea peru", "supermercados peruanos plaza vea"], "Groceries", "groceries", "grocer"),
  rail(UY, "mercado-pago", ["mercado pago uruguay", "mercadopago uruguay"], "uruguay_wallet"),
  bank(UY, "brou", ["banco republica uruguay", "brou uruguay"]),
  merchant(UY, "stm", ["tarjeta stm montevideo", "sistema transporte metropolitano uruguay"], "Transport", "transport", "transport_provider"),
  merchant(UY, "tienda-inglesa", ["tienda inglesa uruguay", "supermercado tienda inglesa"], "Groceries", "groceries", "grocer"),
  merchant(UY, "antel", ["antel uruguay", "administracion nacional telecomunicaciones uruguay"], "Telecom", "telecom", "telecom_provider"),
  rail(EC, "deuna", ["deuna ecuador", "de una ecuador qr"], "ecuador_wallet"),
  bank(EC, "pichincha", ["banco pichincha ecuador", "pichincha banca movil"]),
  merchant(EC, "metro-quito", ["metro de quito", "empresa metro quito"], "Transport", "transport", "transport_provider"),
  merchant(EC, "supermaxi", ["supermaxi ecuador", "corporacion favorita supermaxi"], "Groceries", "groceries", "grocer"),
  merchant(EC, "cnt", ["cnt ecuador telecom", "corporacion nacional telecomunicaciones ecuador"], "Telecom", "telecom", "telecom_provider"),
  rail(CR, "sinpe-movil", ["sinpe movil costa rica", "sinpe móvil"], "costa_rica_sinpe", 88),
  bank(CR, "bac", ["bac credomatic costa rica", "bac san jose"]),
  merchant(CR, "kolbi", ["kolbi costa rica", "kölbi ice"], "Telecom", "telecom", "telecom_provider"),
  merchant(CR, "automercado", ["automercado costa rica", "auto mercado costa rica"], "Groceries", "groceries", "grocer"),
  merchant(CR, "aya", ["aya costa rica agua", "acueductos alcantarillados costa rica"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(PA, "yappy", ["yappy panama", "yappy banco general"], "panama_wallet"),
  bank(PA, "banco-general", ["banco general panama", "bgeneral panama"]),
  merchant(PA, "metro", ["metro de panama", "tarjeta metrobus panama"], "Transport", "transport", "transport_provider"),
  merchant(PA, "super-99", ["super 99 panama", "supermercados 99 panama"], "Groceries", "groceries", "grocer"),
  merchant(PA, "ensa", ["ensa panama electricidad", "elektra noreste panama"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(DO, "tpago", ["tpago republica dominicana", "t pago dominicana"], "dominican_wallet"),
  bank(DO, "popular", ["banco popular dominicano", "popular dominicana"]),
  merchant(DO, "metro", ["metro santo domingo", "opret metro dominicana"], "Transport", "transport", "transport_provider"),
  merchant(DO, "sirena", ["la sirena dominicana", "tiendas la sirena republica dominicana"], "Groceries", "groceries", "grocer"),
  merchant(DO, "edesur", ["edesur dominicana", "edesur republica dominicana"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(GT, "tigo-money", ["tigo money guatemala", "billetera tigo guatemala"], "guatemala_wallet"),
  bank(GT, "industrial", ["banco industrial guatemala", "bi guatemala banco"]),
  merchant(GT, "transmetro", ["transmetro guatemala", "transurbano guatemala"], "Transport", "transport", "transport_provider"),
  merchant(GT, "paiz", ["paiz guatemala", "walmart paiz guatemala"], "Groceries", "groceries", "grocer"),
  merchant(GT, "eegsa", ["eegsa guatemala", "empresa electrica guatemala"], "Bills & Utilities", "utilities", "utility_provider"),

  // Europe.
  rail(PT, "mb-way", ["mb way portugal", "mbway portugal"], "portugal_mb_way", 88),
  rail(PT, "multibanco", ["multibanco portugal", "pagamento multibanco"], "portugal_multibanco", 86),
  bank(PT, "cgd", ["caixa geral depositos portugal", "cgd portugal"]),
  merchant(PT, "metro-lisboa", ["metro lisboa", "metropolitano de lisboa"], "Transport", "transport", "transport_provider"),
  merchant(PT, "continente", ["continente portugal supermercado", "modelo continente portugal"], "Groceries", "groceries", "grocer"),
  rail(FI, "mobilepay", ["mobilepay finland", "mobile pay suomi"], "finland_wallet"),
  bank(FI, "op", ["op financial group finland", "op pankki suomi"]),
  merchant(FI, "hsl", ["hsl helsinki", "helsingin seudun liikenne"], "Transport", "transport", "transport_provider"),
  merchant(FI, "k-market", ["k market finland", "k-market suomi"], "Groceries", "groceries", "grocer"),
  merchant(FI, "helen", ["helen electricity finland", "helen sahko"], "Bills & Utilities", "utilities", "utility_provider"),
  bank(CZ, "ceska-sporitelna", ["ceska sporitelna", "česká spořitelna"]),
  bank(CZ, "csob", ["csob czech republic", "čsob banka"]),
  merchant(CZ, "pid", ["pid litacka prague", "lítačka praha"], "Transport", "transport", "transport_provider"),
  merchant(CZ, "albert", ["albert czech republic", "albert cesko supermarket"], "Groceries", "groceries", "grocer"),
  merchant(CZ, "cez", ["cez energie czech", "čez prodej"] , "Bills & Utilities", "utilities", "utility_provider"),
  rail(HU, "qvik", ["qvik hungary", "qvik fizetes"], "hungary_qvik", 86),
  bank(HU, "otp", ["otp bank hungary", "otp magyarorszag"]),
  merchant(HU, "bkk", ["bkk budapest", "budapest go bkk"], "Transport", "transport", "transport_provider"),
  merchant(HU, "spar", ["spar hungary", "spar magyarorszag"], "Groceries", "groceries", "grocer"),
  merchant(HU, "mvm", ["mvm next energia", "mvm hungary utility"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(RO, "ropay", ["ropay romania", "ro pay plata instant"], "romania_ropay", 88),
  bank(RO, "transilvania", ["banca transilvania", "bt pay romania"]),
  merchant(RO, "metrorex", ["metrorex bucuresti", "metrou bucuresti"], "Transport", "transport", "transport_provider"),
  merchant(RO, "mega-image", ["mega image romania", "mega image bucuresti"], "Groceries", "groceries", "grocer"),
  merchant(RO, "electrica", ["electrica furnizare", "electrica romania factura"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(HR, "keks-pay", ["keks pay croatia", "keks pay hrvatska"], "croatia_wallet"),
  bank(HR, "zaba", ["zagrebacka banka", "zagrebačka banka"]),
  merchant(HR, "zet", ["zet zagreb", "zagrebacki elektricni tramvaj"], "Transport", "transport", "transport_provider"),
  merchant(HR, "konzum", ["konzum croatia", "konzum hrvatska"], "Groceries", "groceries", "grocer"),
  merchant(HR, "hep", ["hep elektra croatia", "hrvatska elektroprivreda"] , "Bills & Utilities", "utilities", "utility_provider"),
  rail(BG, "blink", ["blink payments bulgaria", "blink instant bulgaria"], "bulgaria_blink"),
  bank(BG, "dsk", ["dsk bank bulgaria", "банка дск"]),
  merchant(BG, "metro", ["sofia metro bulgaria", "метрополитен софия"], "Transport", "transport", "transport_provider"),
  merchant(BG, "kaufland", ["kaufland bulgaria", "кауфланд българия"], "Groceries", "groceries", "grocer"),
  merchant(BG, "evn", ["evn bulgaria electricity", "евиен българия ток"], "Bills & Utilities", "utilities", "utility_provider"),

  // Middle East and North Africa.
  rail(EG, "instapay", ["instapay egypt", "انستاباي مصر"], "egypt_ipn", 90),
  bank(EG, "banque-misr", ["banque misr egypt", "بنك مصر"]),
  merchant(EG, "metro", ["cairo metro", "مترو القاهرة"], "Transport", "transport", "transport_provider"),
  merchant(EG, "carrefour", ["carrefour egypt", "كارفور مصر"], "Groceries", "groceries", "grocer"),
  merchant(EG, "vodafone", ["vodafone egypt", "فودافون مصر"], "Telecom", "telecom", "telecom_provider"),
  rail(IL, "bit", ["bit payments israel", "ביט תשלומים"], "israel_wallet"),
  rail(IL, "paybox", ["paybox israel", "פייבוקס ישראל"], "israel_wallet"),
  bank(IL, "hapoalim", ["bank hapoalim israel", "בנק הפועלים"]),
  merchant(IL, "rav-kav", ["rav kav israel", "רב קו"], "Transport", "transport", "transport_provider"),
  merchant(IL, "shufersal", ["shufersal israel", "שופרסל"] , "Groceries", "groceries", "grocer"),
  bank(MA, "cih", ["cih bank morocco", "cih banque maroc"]),
  bank(MA, "attijariwafa", ["attijariwafa bank morocco", "التجاري وفا بنك المغرب"]),
  merchant(MA, "oncf", ["oncf maroc", "train oncf morocco"], "Transport", "transport", "transport_provider"),
  merchant(MA, "marjane", ["marjane maroc", "marjane market morocco"], "Groceries", "groceries", "grocer"),
  merchant(MA, "onee", ["onee maroc", "office national electricite eau maroc"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(JO, "cliq", ["cliq jordan", "كليك الأردن"], "jordan_cliq", 88),
  rail(JO, "zain-cash", ["zain cash jordan", "زين كاش الأردن"], "jordan_wallet"),
  bank(JO, "arab-bank", ["arab bank jordan", "البنك العربي الأردن"]),
  merchant(JO, "amman-bus", ["amman bus jordan", "باص عمان"], "Transport", "transport", "transport_provider"),
  merchant(JO, "carrefour", ["carrefour jordan", "كارفور الأردن"], "Groceries", "groceries", "grocer"),
  rail(OM, "thawani", ["thawani pay oman", "ثواني عمان"], "oman_wallet"),
  bank(OM, "bank-muscat", ["bank muscat oman", "بنك مسقط"]),
  merchant(OM, "mwasalat", ["mwasalat oman", "مواصلات عمان"], "Transport", "transport", "transport_provider"),
  merchant(OM, "lulu", ["lulu hypermarket oman", "لولو عمان"], "Groceries", "groceries", "grocer"),
  merchant(OM, "ooredoo", ["ooredoo oman", "أوريدو عمان"], "Telecom", "telecom", "telecom_provider"),
  rail(BH, "benefitpay", ["benefitpay bahrain", "بنفت بي البحرين"], "bahrain_benefitpay", 90),
  rail(BH, "fawri", ["fawri plus bahrain", "fawri+ benefit bahrain"], "bahrain_fawri", 88),
  bank(BH, "bbk", ["bank of bahrain and kuwait", "bbk bahrain"]),
  merchant(BH, "bus", ["bahrain bus", "bahrain public transport company"], "Transport", "transport", "transport_provider"),
  merchant(BH, "ewa", ["ewa bahrain", "electricity water authority bahrain"], "Bills & Utilities", "utilities", "utility_provider"),

  // Africa.
  rail(UG, "mtn-momo", ["mtn mobile money uganda", "mtn momo uganda"], "uganda_mobile_money", 86),
  rail(UG, "airtel-money", ["airtel money uganda", "airtel uganda mobile money"], "uganda_mobile_money", 84),
  bank(UG, "stanbic", ["stanbic bank uganda", "stanbic uganda"]),
  merchant(UG, "safeboda", ["safeboda uganda", "safe boda kampala"], "Transport", "transport", "transport_provider"),
  merchant(UG, "umeme", ["umeme uganda", "umeme electricity uganda"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(RW, "mtn-momo", ["mtn mobile money rwanda", "mtn momo rwanda"], "rwanda_mobile_money", 86),
  rail(RW, "airtel-money", ["airtel money rwanda", "airtel rwanda mobile money"], "rwanda_mobile_money", 84),
  bank(RW, "bk", ["bank of kigali", "bk group rwanda"]),
  merchant(RW, "tap-go", ["tap and go rwanda", "tap go kigali bus"], "Transport", "transport", "transport_provider"),
  merchant(RW, "reg", ["rwanda energy group", "reg electricity rwanda"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(ET, "telebirr", ["telebirr ethiopia", "ቴሌብር ኢትዮጵያ"], "ethiopia_mobile_money", 88),
  rail(ET, "mpesa", ["mpesa ethiopia", "m-pesa ethiopia"], "ethiopia_mobile_money", 86),
  bank(ET, "cbe", ["commercial bank of ethiopia", "የኢትዮጵያ ንግድ ባንክ"]),
  merchant(ET, "light-rail", ["addis ababa light rail", "አዲስ አበባ ቀላል ባቡር"], "Transport", "transport", "transport_provider"),
  merchant(ET, "electric", ["ethiopian electric utility", "የኢትዮጵያ ኤሌክትሪክ አገልግሎት"] , "Bills & Utilities", "utilities", "utility_provider"),
  rail(SN, "wave", ["wave senegal", "wave mobile money senegal"], "senegal_mobile_money", 86),
  rail(SN, "orange-money", ["orange money senegal", "orange finance mobiles senegal"], "senegal_mobile_money", 86),
  bank(SN, "cbao", ["cbao senegal", "cbao groupe attijariwafa senegal"]),
  merchant(SN, "ddd", ["dakar dem dikk", "dem dikk senegal"], "Transport", "transport", "transport_provider"),
  merchant(SN, "auchan", ["auchan senegal", "auchan retail senegal"], "Groceries", "groceries", "grocer"),
  rail(CI, "wave", ["wave cote divoire", "wave côte d'ivoire"], "cote_divoire_mobile_money", 86),
  rail(CI, "orange-money", ["orange money cote divoire", "orange money côte d'ivoire"], "cote_divoire_mobile_money", 86),
  rail(CI, "mtn-momo", ["mtn mobile money cote divoire", "mtn momo côte d'ivoire"], "cote_divoire_mobile_money", 84),
  merchant(CI, "sotra", ["sotra abidjan", "societe transports abidjanais"], "Transport", "transport", "transport_provider"),
  merchant(CI, "cie", ["cie cote divoire electricite", "compagnie ivoirienne electricite"], "Bills & Utilities", "utilities", "utility_provider"),
  rail(MU, "juice", ["juice by mcb mauritius", "mcb juice mauritius"], "mauritius_wallet"),
  bank(MU, "mcb", ["mauritius commercial bank", "mcb mauritius"]),
  merchant(MU, "metro-express", ["metro express mauritius", "mauritius metro express"], "Transport", "transport", "transport_provider"),
  merchant(MU, "winners", ["winners supermarket mauritius", "winners mauritius"], "Groceries", "groceries", "grocer"),
  merchant(MU, "ceb", ["central electricity board mauritius", "ceb mauritius"] , "Bills & Utilities", "utilities", "utility_provider"),
  rail(BW, "orange-money", ["orange money botswana", "orange botswana wallet"], "botswana_mobile_money"),
  rail(BW, "myzaka", ["myzaka botswana", "mascom my zaka"], "botswana_mobile_money"),
  bank(BW, "fnb", ["fnb botswana", "first national bank botswana"]),
  merchant(BW, "choppies", ["choppies botswana", "choppies supermarket botswana"], "Groceries", "groceries", "grocer"),
  merchant(BW, "bpc", ["botswana power corporation", "bpc electricity botswana"] , "Bills & Utilities", "utilities", "utility_provider"),

  // South Asia.
  rail(NP, "connectips", ["connectips nepal", "connect ips nepal"], "nepal_connectips", 90),
  rail(NP, "esewa", ["esewa nepal", "e sewa nepal"], "nepal_wallet", 86),
  rail(NP, "khalti", ["khalti nepal", "खल्ती नेपाल"], "nepal_wallet", 84),
  bank(NP, "nabil", ["nabil bank nepal", "नबिल बैंक"]),
  merchant(NP, "nea", ["nepal electricity authority", "नेपाल विद्युत प्राधिकरण"] , "Bills & Utilities", "utilities", "utility_provider"),

  // Deeper purpose coverage for previously represented markets.
  merchant({ code: "SE", region: "EUR", currency: "SEK" }, "sl", ["sl stockholm transit", "storstockholms lokaltrafik"], "Transport", "transport", "transport_provider"),
  merchant({ code: "SE", region: "EUR", currency: "SEK" }, "ica", ["ica sverige", "ica supermarket sweden"], "Groceries", "groceries", "grocer"),
  merchant({ code: "NO", region: "EUR", currency: "NOK" }, "ruter", ["ruter oslo", "ruter kollektivtrafikk"], "Transport", "transport", "transport_provider"),
  merchant({ code: "NO", region: "EUR", currency: "NOK" }, "rema", ["rema 1000 norway", "rema tusen norge"], "Groceries", "groceries", "grocer"),
  merchant({ code: "DK", region: "EUR", currency: "DKK" }, "rejsekort", ["rejsekort denmark", "rejsekort danmark"], "Transport", "transport", "transport_provider"),
  merchant({ code: "DK", region: "EUR", currency: "DKK" }, "netto", ["netto denmark", "netto danmark"], "Groceries", "groceries", "grocer"),
  merchant({ code: "PL", region: "EUR", currency: "PLN" }, "zabka", ["zabka polska", "żabka polska"], "Groceries", "groceries", "grocer"),
  merchant({ code: "PL", region: "EUR", currency: "PLN" }, "ztm", ["ztm warszawa", "warszawski transport publiczny"], "Transport", "transport", "transport_provider"),
  merchant({ code: "GR", region: "EUR", currency: "EUR" }, "oasa", ["oasa athens", "oasa athina transport"], "Transport", "transport", "transport_provider"),
  merchant({ code: "GR", region: "EUR", currency: "EUR" }, "sklavenitis", ["sklavenitis greece", "σκλαβενίτης"] , "Groceries", "groceries", "grocer"),
  merchant({ code: "TR", region: "EUR", currency: "TRY" }, "istanbulkart", ["istanbulkart", "istanbul kart ulaşım"], "Transport", "transport", "transport_provider"),
  merchant({ code: "TR", region: "EUR", currency: "TRY" }, "migros", ["migros turkey", "migros turkiye"] , "Groceries", "groceries", "grocer"),
  merchant({ code: "LK", region: "SAS", currency: "LKR" }, "pickme", ["pickme sri lanka", "pick me sri lanka taxi"], "Transport", "transport", "transport_provider"),
  merchant({ code: "LK", region: "SAS", currency: "LKR" }, "cargills", ["cargills food city sri lanka", "cargills sri lanka supermarket"], "Groceries", "groceries", "grocer"),
  merchant({ code: "KE", region: "AFR", currency: "KES" }, "naivas", ["naivas kenya", "naivas supermarket kenya"], "Groceries", "groceries", "grocer"),
  merchant({ code: "NG", region: "AFR", currency: "NGN" }, "ekedc", ["eko electricity distribution", "ekedc nigeria"] , "Bills & Utilities", "utilities", "utility_provider"),
  merchant({ code: "GH", region: "AFR", currency: "GHS" }, "ecg", ["electricity company of ghana", "ecg power ghana"] , "Bills & Utilities", "utilities", "utility_provider"),
  merchant({ code: "TZ", region: "AFR", currency: "TZS" }, "tanesco", ["tanesco tanzania", "tanzania electric supply company"] , "Bills & Utilities", "utilities", "utility_provider"),
];

const profile = (
  countryCode: string,
  regionCode: string,
  locales: string[],
  languages: string[],
  dateOrder: RegionalParsingProfile["dateOrder"],
  decimalSeparator: RegionalParsingProfile["decimalSeparator"],
  groupingSeparator: RegionalParsingProfile["groupingSeparator"],
  defaultCurrency: string,
  legalEntitySuffixes: string[],
  confidence = 70,
): RegionalParsingProfile => ({
  countryCode,
  regionCode,
  locales,
  primaryLocale: locales[0],
  languages,
  dateOrder,
  decimalSeparator,
  groupingSeparator,
  defaultCurrency,
  legalEntitySuffixes,
  confidence,
});

export const WORLD_REGIONAL_PROFILES: RegionalParsingProfile[] = [
  profile("AR", "LATAM", ["es-AR", "en-AR"], ["es", "en"], "dmy", ",", ".", "ARS", ["sa", "srl", "sas"], 76),
  profile("PE", "LATAM", ["es-PE", "en-PE"], ["es", "en"], "dmy", ".", ",", "PEN", ["sa", "sac", "eirl"], 78),
  profile("UY", "LATAM", ["es-UY", "en-UY"], ["es", "en"], "dmy", ",", ".", "UYU", ["sa", "srl", "sas"], 72),
  profile("EC", "LATAM", ["es-EC", "en-EC"], ["es", "en"], "dmy", ".", ",", "USD", ["sa", "cia ltda", "s a s"], 72),
  profile("CR", "LATAM", ["es-CR", "en-CR"], ["es", "en"], "dmy", ".", ",", "CRC", ["sa", "srl", "limitada"], 72),
  profile("PA", "LATAM", ["es-PA", "en-PA"], ["es", "en"], "dmy", ".", ",", "PAB", ["sa", "srl", "inc"], 72),
  profile("DO", "LATAM", ["es-DO", "en-DO"], ["es", "en"], "dmy", ".", ",", "DOP", ["sa", "srl", "sas"], 70),
  profile("GT", "LATAM", ["es-GT", "en-GT"], ["es", "en"], "dmy", ".", ",", "GTQ", ["sa", "limitada", "sociedad anonima"], 70),
  profile("PT", "EUR", ["pt-PT", "en-PT"], ["pt", "en"], "dmy", ",", ".", "EUR", ["lda", "sa", "unipessoal"], 80),
  profile("FI", "EUR", ["fi-FI", "sv-FI", "en-FI"], ["fi", "sv", "en"], "dmy", ",", " ", "EUR", ["oy", "oyj", "ky", "ab"], 78),
  profile("CZ", "EUR", ["cs-CZ", "en-CZ"], ["cs", "en"], "dmy", ",", " ", "CZK", ["sro", "as", "ks"], 76),
  profile("HU", "EUR", ["hu-HU", "en-HU"], ["hu", "en"], "ymd", ",", " ", "HUF", ["kft", "zrt", "nyrt", "bt"], 76),
  profile("RO", "EUR", ["ro-RO", "en-RO"], ["ro", "en"], "dmy", ",", ".", "RON", ["srl", "sa", "pfa"], 76),
  profile("HR", "EUR", ["hr-HR", "en-HR"], ["hr", "en"], "dmy", ",", ".", "EUR", ["doo", "dd", "obrt"], 72),
  profile("BG", "EUR", ["bg-BG", "en-BG"], ["bg", "en"], "dmy", ",", " ", "BGN", ["ood", "ead", "ad", "ет"], 72),
  profile("EG", "MEA", ["ar-EG", "en-EG"], ["ar", "en"], "dmy", ".", ",", "EGP", ["sae", "llc", "ش م م"], 78),
  profile("IL", "MEA", ["he-IL", "ar-IL", "en-IL"], ["he", "ar", "en"], "dmy", ".", ",", "ILS", ["ltd", "בעמ"], 74),
  profile("MA", "MEA", ["fr-MA", "ar-MA", "en-MA"], ["fr", "ar", "en"], "dmy", ",", " ", "MAD", ["sarl", "sa", "sas"], 70),
  profile("JO", "MEA", ["ar-JO", "en-JO"], ["ar", "en"], "dmy", ".", ",", "JOD", ["llc", "plc", "co"], 72),
  profile("OM", "MEA", ["ar-OM", "en-OM"], ["ar", "en"], "dmy", ".", ",", "OMR", ["llc", "saoc", "saog"], 74),
  profile("BH", "MEA", ["ar-BH", "en-BH"], ["ar", "en"], "dmy", ".", ",", "BHD", ["wll", "bsc", "spc"], 76),
  profile("UG", "AFR", ["en-UG", "sw-UG"], ["en", "sw"], "dmy", ".", ",", "UGX", ["ltd", "limited", "plc"], 68),
  profile("RW", "AFR", ["rw-RW", "en-RW", "fr-RW"], ["rw", "en", "fr"], "dmy", ".", ",", "RWF", ["ltd", "sa", "plc"], 68),
  profile("ET", "AFR", ["am-ET", "en-ET"], ["am", "en"], "dmy", ".", ",", "ETB", ["sc", "plc", "private limited"], 68),
  profile("SN", "AFR", ["fr-SN", "wo-SN", "en-SN"], ["fr", "wo", "en"], "dmy", ",", " ", "XOF", ["sa", "sarl", "sas"], 68),
  profile("CI", "AFR", ["fr-CI", "en-CI"], ["fr", "en"], "dmy", ",", " ", "XOF", ["sa", "sarl", "sas"], 68),
  profile("MU", "AFR", ["en-MU", "fr-MU"], ["en", "fr"], "dmy", ".", ",", "MUR", ["ltd", "limited", "plc"], 68),
  profile("BW", "AFR", ["en-BW", "tn-BW"], ["en", "tn"], "dmy", ".", ",", "BWP", ["pty ltd", "limited", "inc"], 66),
  profile("NP", "SAS", ["ne-NP", "en-NP"], ["ne", "en"], "ymd", ".", ",", "NPR", ["pvt ltd", "limited", "ltd"], 72),
];
