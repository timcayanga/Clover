/**
 * Versioned context corpus for transaction normalization.
 *
 * This corpus provides evidence and hints; it must not replace a user's
 * confirmed transaction values. Keep raw statement text outside this module.
 */

export const CONTEXT_CORPUS_VERSION = "2026.07.18";

export type ContextSignal = {
  id: string;
  kind: "institution" | "payment_rail" | "travel" | "fee" | "currency" | "merchant";
  value: string;
  confidence: number;
  evidence: string;
  source: "curated" | "learned" | "user_confirmed";
  reviewStatus: "active" | "candidate" | "retired";
};

export type RegionalParsingProfile = {
  countryCode: string;
  regionCode: string;
  locales: string[];
  primaryLocale: string;
  languages: string[];
  dateOrder: "mdy" | "dmy" | "ymd" | "unknown";
  decimalSeparator: "." | ",";
  groupingSeparator: "," | "." | " " | "'" | "unknown";
  defaultCurrency: string;
  legalEntitySuffixes: string[];
  confidence: number;
  source?: ContextSignal["source"];
  reviewStatus?: ContextSignal["reviewStatus"];
};

export type TransactionContext = {
  corpusVersion: string;
  countryCode: string | null;
  regionCode: string | null;
  paymentRail: string | null;
  institutionType: string | null;
  currency: string | null;
  categoryHint: string | null;
  transactionTypeHint: "income" | "expense" | "transfer" | null;
  counterpartyType: "merchant" | "employer" | "government" | "government_service" | "financial_institution" | "remittance_provider" | "travel_provider" | "transport_provider" | "grocer" | "telecom_provider" | "utility_provider" | "healthcare_provider" | "education_provider" | "insurer" | "investment_platform" | "wallet" | null;
  purposeHint: "salary" | "tax" | "government_contribution" | "remittance" | "travel" | "fee" | "transfer" | "bill_payment" | "groceries" | "dining" | "retail" | "fuel" | "transport" | "telecom" | "utilities" | "healthcare" | "education" | "housing" | "subscription" | "cash_withdrawal" | "investment" | "insurance" | "charity" | "food_delivery" | "ecommerce" | "entertainment" | "fitness" | "personal_care" | null;
  primaryLocale: string | null;
  dateOrder: RegionalParsingProfile["dateOrder"];
  decimalSeparator: RegionalParsingProfile["decimalSeparator"] | null;
  groupingSeparator: RegionalParsingProfile["groupingSeparator"] | null;
  languages: string[];
  legalEntitySuffixes: string[];
  parsingProfileConfidence: number;
  travelLikely: boolean;
  foreignCurrencyLikely: boolean;
  contextStatus: "matched" | "ambiguous" | "unmatched";
  coverageTier: "canonical" | "descriptor_variant" | "currency_only" | "none";
  matchedEntryIds: string[];
  matchedAliases: string[];
  fieldConfidence: {
    countryCode: number;
    regionCode: number;
    paymentRail: number;
    institutionType: number;
    currency: number;
    categoryHint: number;
    transactionTypeHint: number;
    counterpartyType: number;
    purposeHint: number;
  };
  signals: ContextSignal[];
  confidence: number;
  evidence: string[];
};

export type TravelEpisodeContext = {
  episodeId: string;
  startDate: string;
  endDate: string;
  countries: string[];
  currencies: string[];
  transactionCount: number;
  confidence: number;
  evidence: string[];
};

type ContextEntry = {
  id: string;
  aliases: string[];
  negativeAliases?: string[];
  signalKind?: ContextSignal["kind"];
  countryCode: string;
  regionCode: string;
  paymentRail?: string;
  institutionType?: string;
  currency?: string;
  categoryHint?: string;
  transactionTypeHint?: TransactionContext["transactionTypeHint"];
  counterpartyType?: TransactionContext["counterpartyType"];
  purposeHint?: TransactionContext["purposeHint"];
  travelLikely?: boolean;
  foreignCurrencyLikely?: boolean;
  confidence: number;
  source?: ContextSignal["source"];
  reviewStatus?: ContextSignal["reviewStatus"];
  coverage?: "canonical" | "descriptor_variant";
};

const baseEntries: ContextEntry[] = [
  // Philippines: launch market and strongest deterministic context.
  { id: "ph-gcash", aliases: ["gcash", "g-xchange", "gcash cash in", "gcash cash out"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "gcash", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", counterpartyType: "wallet", purposeHint: "transfer", confidence: 96 },
  { id: "ph-maya", aliases: ["maya", "maya wallet", "paymaya", "maya bank"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "maya", institutionType: "wallet", currency: "PHP", transactionTypeHint: "transfer", counterpartyType: "wallet", purposeHint: "transfer", confidence: 94 },
  { id: "ph-bank-transfer", aliases: ["instapay", "insta pay", "pesonet", "pesonet transfer"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_bank_transfer", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 98 },
  { id: "ph-bpi", aliases: ["bpi", "bank of the philippine islands"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-bdo", aliases: ["bdo", "banco de oro"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-unionbank", aliases: ["unionbank", "union bank of the philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-metrobank", aliases: ["metrobank", "metropolitan bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-security-bank", aliases: ["security bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-eastwest", aliases: ["eastwest", "east west bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-rcbc", aliases: ["rcbc", "rizal commercial banking"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-landbank", aliases: ["landbank", "land bank of the philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-chinabank", aliases: ["chinabank", "china bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-psbank", aliases: ["psbank", "philippine savings bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-ucpb", aliases: ["ucpb", "united coconut planters bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 98 },
  { id: "ph-cimb", aliases: ["cimb", "gsave"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-maribank", aliases: ["maribank", "seabank philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-gotyme", aliases: ["gotyme", "go tyme"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-aub", aliases: ["aub", "asia united bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-pnb", aliases: ["pnb", "philippine national bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-dbp", aliases: ["dbp", "development bank of the philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 94 },
  { id: "ph-bank-of-commerce", aliases: ["bank of commerce philippines", "bankcom"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-bank-of-china", aliases: ["bank of china philippines", "boc philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-hsbc", aliases: ["hsbc philippines", "hsbc ph"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-citibank", aliases: ["citibank philippines", "citi ph"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-tonik", aliases: ["tonik bank", "tonik digital bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-uno", aliases: ["uno digital bank", "uno bank philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-ubx", aliases: ["ubx", "banko", "komo"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 88 },
  { id: "ph-diskartech", aliases: ["diskartech", "rcbc diskartech"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "wallet", currency: "PHP", confidence: 90 },
  { id: "ph-palawanpay", aliases: ["palawanpay", "palawan pawnshop"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "palawanpay", institutionType: "wallet", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "wallet", purposeHint: "transfer", confidence: 90 },
  { id: "ph-remittance-agencies", aliases: ["cebuana lhuillier", "m lhuillier", "mlhuillier", "rd pawn", "lbc pera padala"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_remittance", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 90 },
  { id: "ph-bills-payment", aliases: ["bayad", "bayad center", "e cpay", "ecpay"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_bill_payment", currency: "PHP", categoryHint: "Bills & Utilities", transactionTypeHint: "expense", counterpartyType: "financial_institution", purposeHint: "bill_payment", confidence: 88 },
  { id: "ph-retail-grocery", aliases: ["sm supermarket", "sm hypermarket", "savemore", "puregold", "robinsons supermarket", "landmark supermarket", "landers", "s&r membership"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 86 },
  { id: "ph-retail-convenience", aliases: ["7 eleven philippines", "7 eleven ph", "alfamart philippines", "ministop philippines", "uncle johns"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Groceries", counterpartyType: "merchant", purposeHint: "groceries", confidence: 84 },
  { id: "ph-pharmacy", aliases: ["mercury drug", "watsons philippines", "southstar drug", "rose pharmacy"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Health & Wellness", counterpartyType: "healthcare_provider", purposeHint: "healthcare", confidence: 86 },
  { id: "ph-food-delivery", aliases: ["grabfood philippines", "foodpanda philippines", "jollibee", "mang inasal", "chowking", "maxs restaurant", "mcdo philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Dining", counterpartyType: "merchant", purposeHint: "dining", confidence: 82 },
  { id: "ph-transport", aliases: ["beep card", "autosweep", "easytrip", "lrt manila", "mrt manila", "angkas", "joyride philippines"], signalKind: "travel", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 84 },
  { id: "ph-fuel", aliases: ["petron philippines", "shell philippines", "caltex philippines", "phoenix petroleum philippines", "seaoil philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Transport", counterpartyType: "merchant", purposeHint: "fuel", confidence: 86 },
  { id: "ph-utilities", aliases: ["meralco", "maynilad", "manila water", "pldt", "globe telecom", "smart communications", "converge ict"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 88 },
  { id: "ph-ecommerce", aliases: ["lazada philippines", "shopee philippines", "tiktok shop philippines", "zalora philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "ecommerce", confidence: 84 },
  { id: "ph-airlines", aliases: ["philippine airlines", "pal", "cebu pacific", "cebgo", "airasia philippines"], signalKind: "travel", countryCode: "PH", regionCode: "SEA", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 88 },

  // Southeast Asia expansion packs.
  { id: "sg-paynow", aliases: ["paynow", "fast transfer", "fast payments"], signalKind: "payment_rail", countryCode: "SG", regionCode: "SEA", paymentRail: "paynow_fast", currency: "SGD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "my-duitnow", aliases: ["duitnow", "instant transfer malaysia"], signalKind: "payment_rail", countryCode: "MY", regionCode: "SEA", paymentRail: "duitnow", currency: "MYR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "id-qris", aliases: ["qris", "bi-fast", "bifast"], signalKind: "payment_rail", countryCode: "ID", regionCode: "SEA", paymentRail: "qris_bi_fast", currency: "IDR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
  { id: "th-promptpay", aliases: ["promptpay", "พร้อมเพย์", "พร้อมเพย์โอนเงิน"], signalKind: "payment_rail", countryCode: "TH", regionCode: "SEA", paymentRail: "promptpay", currency: "THB", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 96 },
  { id: "vn-napas", aliases: ["napas", "vietqr", "viet qr"], signalKind: "payment_rail", countryCode: "VN", regionCode: "SEA", paymentRail: "napas_vietqr", currency: "VND", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 92 },
  { id: "sg-banks", aliases: ["dbs singapore", "posb", "ocbc singapore", "uob singapore", "standard chartered singapore", "trust bank singapore", "gxs bank"], signalKind: "institution", countryCode: "SG", regionCode: "SEA", institutionType: "bank", currency: "SGD", confidence: 90 },
  { id: "sg-wallets", aliases: ["nets pay", "nets qr", "grabpay singapore", "shopeepay singapore", "dash singapore", "youtrip singapore"], signalKind: "payment_rail", countryCode: "SG", regionCode: "SEA", paymentRail: "singapore_wallet", currency: "SGD", institutionType: "wallet", confidence: 88 },
  { id: "sg-transit", aliases: ["ez link", "ez-link", "simplygo", "mrt singapore", "smrt", "sbs transit singapore"], signalKind: "travel", countryCode: "SG", regionCode: "SEA", paymentRail: "singapore_transit", currency: "SGD", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 88 },
  { id: "sg-retail", aliases: ["ntuc fairprice", "fairprice", "sheng siong", "cold storage singapore", "giant singapore", "mustafa centre", "don don donki singapore"], signalKind: "merchant", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 86 },
  { id: "sg-services", aliases: ["singtel", "starhub", "m1 singapore", "sp services", "singapore power", "grabfood singapore", "foodpanda singapore", "deliveroo singapore"], signalKind: "merchant", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 82 },
  { id: "my-banks", aliases: ["maybank malaysia", "cimb malaysia", "public bank malaysia", "rhb bank", "hong leong bank malaysia", "ambank", "bank islam malaysia", "bank rakyat malaysia"], signalKind: "institution", countryCode: "MY", regionCode: "SEA", institutionType: "bank", currency: "MYR", confidence: 90 },
  { id: "my-wallets", aliases: ["touch n go ewallet", "touch n go", "grabpay malaysia", "boost malaysia", "mae maybank", "bigpay malaysia", "setel", "shopeepay malaysia"], signalKind: "payment_rail", countryCode: "MY", regionCode: "SEA", paymentRail: "malaysia_wallet", currency: "MYR", institutionType: "wallet", confidence: 88 },
  { id: "my-bills-rails", aliases: ["fpx malaysia", "jompay", "mydebit", "interbank giro malaysia", "duitnow request"], signalKind: "payment_rail", countryCode: "MY", regionCode: "SEA", paymentRail: "malaysia_bill_payment", currency: "MYR", categoryHint: "Bills & Utilities", transactionTypeHint: "expense", purposeHint: "bill_payment", confidence: 88 },
  { id: "my-transit", aliases: ["rapid kl", "myrapid", "ktm komuter", "touch n go card", "rapid penang", "grab malaysia"], signalKind: "travel", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 84 },
  { id: "my-retail", aliases: ["mydin", "aeon malaysia", "lotus's malaysia", "jaya grocer", "village grocer", "99 speedmart", "petronas", "shell malaysia"], signalKind: "merchant", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 84 },
  { id: "id-banks", aliases: ["bank central asia", "bca indonesia", "bank mandiri", "bank rakyat indonesia", "bri indonesia", "bank negara indonesia", "bni indonesia", "bank jago", "bank syariah indonesia"], signalKind: "institution", countryCode: "ID", regionCode: "SEA", institutionType: "bank", currency: "IDR", confidence: 90 },
  { id: "id-wallets", aliases: ["gopay indonesia", "go pay", "ovo indonesia", "dana indonesia", "shopeepay indonesia", "linkaja", "sakuku", "seabank indonesia"], signalKind: "payment_rail", countryCode: "ID", regionCode: "SEA", paymentRail: "indonesia_wallet", currency: "IDR", institutionType: "wallet", confidence: 88 },
  { id: "id-commerce", aliases: ["tokopedia", "bukalapak", "blibli", "traveloka indonesia", "gojek indonesia", "grab indonesia", "indomaret", "alfamart indonesia"], signalKind: "merchant", countryCode: "ID", regionCode: "SEA", currency: "IDR", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "ecommerce", confidence: 84 },
  { id: "id-transit-fuel", aliases: ["jaklingko", "kai indonesia", "commuter line jakarta", "pertamina", "shell indonesia", "bluebird indonesia", "transjakarta"], signalKind: "travel", countryCode: "ID", regionCode: "SEA", currency: "IDR", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 84 },
  { id: "th-banks", aliases: ["bangkok bank", "kasikornbank", "kbank thailand", "siam commercial bank", "scb thailand", "krungthai bank", "krungsri", "ttb bank"], signalKind: "institution", countryCode: "TH", regionCode: "SEA", institutionType: "bank", currency: "THB", confidence: 90 },
  { id: "th-wallets", aliases: ["truemoney thailand", "ทรูมันนี่", "เป๋าตัง", "rabbit line pay", "line pay thailand", "shopeepay thailand", "airpay thailand"], signalKind: "payment_rail", countryCode: "TH", regionCode: "SEA", paymentRail: "thailand_wallet", currency: "THB", institutionType: "wallet", confidence: 86 },
  { id: "th-transit", aliases: ["bts skytrain", "mrt bangkok", "rabbit card", "airport rail link thailand", "bolt thailand", "grab thailand"], signalKind: "travel", countryCode: "TH", regionCode: "SEA", currency: "THB", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 86 },
  { id: "th-retail", aliases: ["big c thailand", "lotus's thailand", "tops thailand", "central thailand", "makro thailand", "7 eleven thailand", "ptt thailand"], signalKind: "merchant", countryCode: "TH", regionCode: "SEA", currency: "THB", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 84 },
  { id: "vn-banks", aliases: ["vietcombank", "bidv vietnam", "vietinbank", "agribank vietnam", "techcombank", "acb vietnam", "mb bank vietnam", "tpbank"], signalKind: "institution", countryCode: "VN", regionCode: "SEA", institutionType: "bank", currency: "VND", confidence: 90 },
  { id: "vn-wallets", aliases: ["momo vietnam", "momo wallet", "zalopay", "shopeepay vietnam", "vnpay", "viettel money"], signalKind: "payment_rail", countryCode: "VN", regionCode: "SEA", paymentRail: "vietnam_wallet", currency: "VND", institutionType: "wallet", confidence: 88 },
  { id: "vn-commerce", aliases: ["tiki vietnam", "shopee vietnam", "lazada vietnam", "winmart", "coopmart", "circle k vietnam", "grab vietnam", "be vietnam"], signalKind: "merchant", countryCode: "VN", regionCode: "SEA", currency: "VND", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "ecommerce", confidence: 84 },
  { id: "vn-transit-fuel", aliases: ["vinasun", "mai linh taxi", "petrolimex", "pvoil", "metro ho chi minh", "hanoi metro"], signalKind: "travel", countryCode: "VN", regionCode: "SEA", currency: "VND", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 84 },
  { id: "kh-payment", aliases: ["khqr", "aba bank cambodia", "acleda", "wing cambodia", "true money cambodia", "pi pay"], signalKind: "payment_rail", countryCode: "KH", regionCode: "SEA", paymentRail: "cambodia_qr_wallet", currency: "KHR", institutionType: "wallet", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 86 },
  { id: "kh-commerce", aliases: ["passapp cambodia", "grab cambodia", "lucky supermarket cambodia", "aeon mall cambodia", "brown coffee cambodia"], signalKind: "merchant", countryCode: "KH", regionCode: "SEA", currency: "KHR", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 80 },
  { id: "mm-payment", aliases: ["mmqr", "kbzpay", "wave money myanmar", "cb pay myanmar", "yoma bank"], signalKind: "payment_rail", countryCode: "MM", regionCode: "SEA", paymentRail: "myanmar_wallet", currency: "MMK", institutionType: "wallet", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 82 },
  { id: "bn-payment", aliases: ["bibd", "baiduri bank", "quickpay brunei", "progresif pay"], signalKind: "payment_rail", countryCode: "BN", regionCode: "SEA", paymentRail: "brunei_wallet", currency: "BND", institutionType: "bank", confidence: 80 },
  { id: "la-payment", aliases: ["bcel onepay", "onepay laos", "lpay laos", "u-money laos"], signalKind: "payment_rail", countryCode: "LA", regionCode: "SEA", paymentRail: "laos_wallet", currency: "LAK", institutionType: "wallet", confidence: 78 },

  // Travel-heavy East Asia context.
  { id: "jp-transit", aliases: ["suica", "スイカ", "pasmo", "パスモ", "icoca", "イコカ", "jr east", "jr central"], signalKind: "travel", countryCode: "JP", regionCode: "EAS", paymentRail: "japan_transit", currency: "JPY", categoryHint: "Transport", transactionTypeHint: "expense", travelLikely: true, confidence: 92 },
  { id: "hk-wallet-rail", aliases: ["octopus", "八達通", "alipay hk", "fps hong kong", "轉數快", "faster payment system"], signalKind: "payment_rail", countryCode: "HK", regionCode: "EAS", paymentRail: "hong_kong_fps", currency: "HKD", categoryHint: "Transfers", confidence: 90 },
  { id: "tw-wallet", aliases: ["line pay taiwan", "jko pay", "jkopay", "街口支付", "悠遊卡", "一卡通", "easycard"], signalKind: "payment_rail", countryCode: "TW", regionCode: "EAS", paymentRail: "taiwan_wallet", currency: "TWD", confidence: 88 },
  { id: "jp-wallets", aliases: ["paypay japan", "ペイペイ", "rakuten pay japan", "楽天ペイ", "d payment japan", "d払い", "au pay japan", "nanaco", "waon"], signalKind: "payment_rail", countryCode: "JP", regionCode: "EAS", paymentRail: "japan_wallet", currency: "JPY", institutionType: "wallet", confidence: 88 },
  { id: "jp-commerce", aliases: ["7 eleven japan", "familymart japan", "lawson japan", "don quijote", "aeon japan", "uniqlo japan", "rakuten japan", "amazon japan"], signalKind: "merchant", countryCode: "JP", regionCode: "EAS", currency: "JPY", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 84 },
  { id: "jp-transit-expanded", aliases: ["kitaca", "toica", "manaca", "sugoca", "hayakaken", "tokyo metro", "osaka metro", "jr west", "jr kyushu"], signalKind: "travel", countryCode: "JP", regionCode: "EAS", paymentRail: "japan_transit", currency: "JPY", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 90 },
  { id: "kr-banks", aliases: ["shinhan bank", "kb kookmin", "hana bank korea", "woori bank", "nh bank korea", "kakao bank", "toss bank"], signalKind: "institution", countryCode: "KR", regionCode: "EAS", institutionType: "bank", currency: "KRW", confidence: 88 },
  { id: "kr-wallets", aliases: ["kakao pay", "카카오페이", "naver pay", "네이버페이", "toss pay", "토스페이", "samsung pay korea", "payco korea", "ssg pay"], signalKind: "payment_rail", countryCode: "KR", regionCode: "EAS", paymentRail: "korea_wallet", currency: "KRW", institutionType: "wallet", confidence: 88 },
  { id: "kr-transit", aliases: ["t money", "tmoney", "티머니", "cashbee", "캐시비", "korea subway", "korail", "kakao t", "seoul metro"], signalKind: "travel", countryCode: "KR", regionCode: "EAS", paymentRail: "korea_transit", currency: "KRW", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 88 },
  { id: "kr-commerce", aliases: ["coupang", "gmarket korea", "olive young", "emart korea", "lotte korea", "cu korea", "gs25 korea", "daiso korea"], signalKind: "merchant", countryCode: "KR", regionCode: "EAS", currency: "KRW", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 84 },
  { id: "hk-banks", aliases: ["hsbc hong kong", "hang seng bank", "bank of china hong kong", "bochk", "standard chartered hong kong", "za bank hong kong"], signalKind: "institution", countryCode: "HK", regionCode: "EAS", institutionType: "bank", currency: "HKD", confidence: 88 },
  { id: "hk-wallets", aliases: ["octopus wallet", "payme hong kong", "alipayhk", "wechat pay hk", "tap and go hong kong"], signalKind: "payment_rail", countryCode: "HK", regionCode: "EAS", paymentRail: "hong_kong_wallet", currency: "HKD", institutionType: "wallet", confidence: 88 },
  { id: "hk-transit", aliases: ["mtr hong kong", "kmb hong kong", "citybus hong kong", "tramways hong kong", "octopus card"], signalKind: "travel", countryCode: "HK", regionCode: "EAS", paymentRail: "hong_kong_transit", currency: "HKD", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 88 },
  { id: "hk-retail", aliases: ["wellcome hong kong", "parknshop", "aeon hong kong", "don don donki hong kong", "mannings hong kong", "watsons hong kong"], signalKind: "merchant", countryCode: "HK", regionCode: "EAS", currency: "HKD", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 84 },
  { id: "tw-banks", aliases: ["cathay united bank", "ctbc bank taiwan", "esun bank", "taiwan cooperative bank", "taipei fubon", "first bank taiwan"], signalKind: "institution", countryCode: "TW", regionCode: "EAS", institutionType: "bank", currency: "TWD", confidence: 86 },
  { id: "tw-transit-commerce", aliases: ["ipass", "easycard taiwan", "taipei metro", "taiwan high speed rail", "px mart", "familymart taiwan", "7 eleven taiwan", "carrefour taiwan"], signalKind: "travel", countryCode: "TW", regionCode: "EAS", currency: "TWD", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 84 },
  { id: "cn-wallets", aliases: ["alipay china", "支付宝", "wechat pay", "微信支付", "unionpay", "云闪付", "alipay mainland"], signalKind: "payment_rail", countryCode: "CN", regionCode: "EAS", paymentRail: "china_wallet", currency: "CNY", institutionType: "wallet", confidence: 88 },
  { id: "cn-commerce", aliases: ["taobao", "tmall", "jd.com", "meituan", "didi china", "ctrip", "12306 china"], signalKind: "merchant", countryCode: "CN", regionCode: "EAS", currency: "CNY", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "ecommerce", confidence: 84 },

  // Diaspora and international-account context.
  { id: "in-bank-rail", aliases: ["upi", "यूपीआई", "upi collect", "imps", "neft", "rtgs india"], signalKind: "payment_rail", countryCode: "IN", regionCode: "SAS", paymentRail: "india_bank_rail", currency: "INR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 94 },
  { id: "ae-remittance", aliases: ["uae exchange", "al ansari exchange", "lu lu exchange", "remittance"], signalKind: "payment_rail", countryCode: "AE", regionCode: "MEA", paymentRail: "remittance", currency: "AED", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 86 },
  { id: "eu-sepa", aliases: ["sepa", "sepa direct debit", "iban transfer"], signalKind: "payment_rail", countryCode: "EU", regionCode: "EUR", paymentRail: "sepa", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 92 },
  { id: "us-ach-wallet", aliases: ["ach", "zelle", "venmo", "cash app"], signalKind: "payment_rail", countryCode: "US", regionCode: "NAM", paymentRail: "us_ach_wallet", currency: "USD", confidence: 88 },
  { id: "gb-bank-rail", aliases: ["faster payments", "bacs", "chaps", "direct debit uk"], signalKind: "payment_rail", countryCode: "GB", regionCode: "EUR", paymentRail: "uk_bank_rail", currency: "GBP", confidence: 90 },
  { id: "au-bank-rail", aliases: ["payid", "osko", "bpay"], signalKind: "payment_rail", countryCode: "AU", regionCode: "OCE", paymentRail: "australia_bank_rail", currency: "AUD", confidence: 88 },
  { id: "au-banks", aliases: ["commbank", "commonwealth bank australia", "westpac", "nab australia", "anz australia", "macquarie bank australia"], signalKind: "institution", countryCode: "AU", regionCode: "OCE", institutionType: "bank", currency: "AUD", confidence: 88 },
  { id: "au-transit", aliases: ["opal card", "myki", "go card australia", "smart rider perth", "transperth", "transport for nsw"], signalKind: "travel", countryCode: "AU", regionCode: "OCE", currency: "AUD", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 86 },
  { id: "au-retail", aliases: ["woolworths australia", "coles australia", "aldi australia", "bunnings", "kmart australia", "chemist warehouse", "myer"], signalKind: "merchant", countryCode: "AU", regionCode: "OCE", currency: "AUD", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 84 },
  { id: "us-wallets", aliases: ["apple cash", "paypal us"], signalKind: "payment_rail", countryCode: "US", regionCode: "NAM", paymentRail: "us_wallet", currency: "USD", institutionType: "wallet", confidence: 88 },
  { id: "us-commerce", aliases: ["amazon.com", "walmart", "costco", "target store", "whole foods", "trader joes", "walgreens", "cvs pharmacy", "uber eats", "doordash"], signalKind: "merchant", countryCode: "US", regionCode: "NAM", currency: "USD", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 84 },
  { id: "ca-wallets", aliases: ["interac e-transfer", "interac etransfer", "wealthsimple", "koho canada"], signalKind: "payment_rail", countryCode: "CA", regionCode: "NAM", paymentRail: "canada_transfer", currency: "CAD", confidence: 84 },
  { id: "ca-commerce", aliases: ["loblaws", "shoppers drug mart", "canadian tire", "save on foods", "no frills canada", "uber eats canada"], signalKind: "merchant", countryCode: "CA", regionCode: "NAM", currency: "CAD", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 80 },
  { id: "gb-wallets", aliases: ["faster payments uk", "bacs uk", "monzo", "revolut uk", "starling bank"], signalKind: "payment_rail", countryCode: "GB", regionCode: "EUR", paymentRail: "uk_wallet", currency: "GBP", institutionType: "fintech", confidence: 86 },
  { id: "gb-retail", aliases: ["tesco uk", "sainsburys", "asda uk", "aldi uk", "marks and spencer", "boots uk", "deliveroo uk"], signalKind: "merchant", countryCode: "GB", regionCode: "EUR", currency: "GBP", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 82 },
  { id: "ae-banks", aliases: ["emirates nbd", "first abu dhabi bank", "fab uae", "abu dhabi commercial bank", "mashreq bank", "adcb", "liv bank"], signalKind: "institution", countryCode: "AE", regionCode: "MEA", institutionType: "bank", currency: "AED", confidence: 86 },
  { id: "ae-wallets-remittance", aliases: ["careem pay", "e& money", "lulu exchange", "al futtaim exchange", "wall street exchange uae"], signalKind: "payment_rail", countryCode: "AE", regionCode: "MEA", paymentRail: "uae_wallet_remittance", currency: "AED", institutionType: "wallet", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 86 },
  { id: "ae-commerce", aliases: ["noon uae", "amazon.ae", "carrefour uae", "lulu hypermarket uae", "spinney's uae", "talabat uae", "deliveroo uae"], signalKind: "merchant", countryCode: "AE", regionCode: "MEA", currency: "AED", categoryHint: "Shopping", counterpartyType: "merchant", purposeHint: "retail", confidence: 82 },
  { id: "sa-banks", aliases: ["al rajhi bank", "saudi national bank", "riyad bank", "albilad bank", "sab bank saudi", "anb saudi"], signalKind: "institution", countryCode: "SA", regionCode: "MEA", institutionType: "bank", currency: "SAR", confidence: 84 },
  { id: "sa-wallets-remittance", aliases: ["stc pay saudi", "urpay", "mobily pay", "enjaz saudi", "al rajhi tahweel", "muhammad al osaimi exchange"], signalKind: "payment_rail", countryCode: "SA", regionCode: "MEA", paymentRail: "saudi_wallet_remittance", currency: "SAR", institutionType: "wallet", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 82 },
  { id: "qa-banks-remittance", aliases: ["qnb qatar", "commercial bank qatar", "doha bank", "qatar islamic bank", "ooredoo money qatar", "alfardan exchange qatar", "doha exchange"], signalKind: "payment_rail", countryCode: "QA", regionCode: "MEA", paymentRail: "qatar_wallet_remittance", currency: "QAR", institutionType: "bank", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 80 },
  { id: "kw-banks-remittance", aliases: ["national bank of kuwait", "nbk kuwait", "kfh kuwait", "boubyan bank", "ooredoo money kuwait", "western union kuwait", "al muzaini exchange"], signalKind: "payment_rail", countryCode: "KW", regionCode: "MEA", paymentRail: "kuwait_wallet_remittance", currency: "KWD", institutionType: "bank", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 78 },

  // Global providers and cross-border context.
  { id: "global-wise", aliases: ["wise", "wise transfer", "transferwise"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "cross_border_transfer", institutionType: "fintech", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "financial_institution", purposeHint: "transfer", confidence: 96 },
  { id: "global-paypal", aliases: ["paypal"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "paypal", institutionType: "wallet", confidence: 94 },
  { id: "global-card-network", aliases: ["visa", "mastercard", "american express", "amex"], signalKind: "institution", countryCode: "GLOBAL", regionCode: "GLOBAL", institutionType: "card_network", confidence: 82 },

  // Travel and FX signals intentionally do not infer a country on their own.
  { id: "global-airline", aliases: ["airlines", "airways", "airport", "flight", "booking.com", "agoda", "expedia"], signalKind: "travel", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Travel & Lifestyle", travelLikely: true, counterpartyType: "travel_provider", purposeHint: "travel", confidence: 78 },
  { id: "global-lodging", aliases: ["hotel", "resort", "hostel", "airbnb"], signalKind: "travel", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Travel & Lifestyle", travelLikely: true, counterpartyType: "travel_provider", purposeHint: "travel", confidence: 78 },
  { id: "global-fx-fee", aliases: ["foreign transaction fee", "international service fee", "currency conversion fee", "dynamic currency conversion", "dcc fee"], signalKind: "fee", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Financial", foreignCurrencyLikely: true, counterpartyType: "financial_institution", purposeHint: "fee", confidence: 94 },
  { id: "global-foreign-currency", aliases: ["exchange rate", "fx markup", "foreign exchange", "overseas transaction"], signalKind: "currency", countryCode: "GLOBAL", regionCode: "GLOBAL", foreignCurrencyLikely: true, confidence: 88 },

  // Financial semantics: these are hints, not automatic user categorization.
  { id: "global-salary-payroll", aliases: ["salary", "payroll", "pay credit", "wage payment"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Income", transactionTypeHint: "income", counterpartyType: "employer", purposeHint: "salary", confidence: 84 },
  { id: "global-tax", aliases: ["tax withheld", "withholding tax", "income tax", "vat", "gst", "sales tax"], signalKind: "fee", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Financial", transactionTypeHint: "expense", counterpartyType: "government", purposeHint: "tax", confidence: 82 },
  { id: "ph-contributions", aliases: ["sss", "philhealth", "pag ibig", "pag-ibig", "bir ewt", "expanded withholding tax"], signalKind: "fee", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Financial", transactionTypeHint: "expense", counterpartyType: "government", purposeHint: "government_contribution", confidence: 90 },
  { id: "sg-contributions", aliases: ["cpf contribution", "cpf", "iras gst"], signalKind: "fee", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Financial", transactionTypeHint: "expense", counterpartyType: "government", purposeHint: "government_contribution", confidence: 86 },
  { id: "my-contributions", aliases: ["epf contribution", "kwsp", "socso", "perkeso"], signalKind: "fee", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Financial", transactionTypeHint: "expense", counterpartyType: "government", purposeHint: "government_contribution", confidence: 86 },
  { id: "global-remittance-provider", aliases: ["western union", "moneygram", "remitly", "worldremit"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "remittance", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 90 },
  { id: "global-remittance-provider-expanded", aliases: ["ria money transfer", "sendwave", "xoom", "transfast", "mukuru", "small world money transfer"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "GLOBAL", paymentRail: "remittance", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 88 },
  { id: "global-travel-booking", aliases: ["trip.com", "tripadvisor", "klook", "getyourguide", "viator", "traveloka"], signalKind: "travel", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 82 },
  { id: "global-rideshare", aliases: ["uber", "grab", "lyft", "bolt", "gojek", "careem"], signalKind: "travel", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 80 },
  { id: "global-subscriptions", aliases: ["netflix", "spotify", "youtube premium", "apple services", "google *", "amazon prime", "disney plus", "microsoft 365", "adobe"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Subscriptions", counterpartyType: "merchant", purposeHint: "subscription", confidence: 80 },
  { id: "global-healthcare", aliases: ["hospital", "clinic", "medical center", "pharmacy", "chemist", "dental clinic", "doctor consultation"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Health & Wellness", counterpartyType: "healthcare_provider", purposeHint: "healthcare", confidence: 72 },
  { id: "global-education", aliases: ["university", "college", "school fees", "tuition", "coursera", "udemy", "student accommodation"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Education", counterpartyType: "education_provider", purposeHint: "education", confidence: 72 },
  { id: "global-insurance", aliases: ["insurance premium", "life insurance", "health insurance", "axa", "allianz", "prudential", "sun life"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Insurance", counterpartyType: "insurer", purposeHint: "insurance", confidence: 78 },
  { id: "global-investment", aliases: ["brokerage", "securities", "mutual fund", "etf purchase", "interactive brokers", "robinhood", "trading account", "coinbase"], signalKind: "merchant", countryCode: "GLOBAL", regionCode: "GLOBAL", categoryHint: "Investments", transactionTypeHint: "transfer", counterpartyType: "investment_platform", purposeHint: "investment", confidence: 76 },
  // Additional canonical coverage harvested from common statement ecosystems.
  { id: "ph-union-digital", aliases: ["uniondigital bank", "union digital bank philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 92 },
  { id: "ph-netbank", aliases: ["netbank philippines", "netbank rural bank"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 86 },
  { id: "ph-bdo-network", aliases: ["bdo network bank", "bdo private bank", "bdo remittance"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 86 },
  { id: "ph-pbcom", aliases: ["pbcom", "philippine bank of communications"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 84 },
  { id: "ph-pbb", aliases: ["philippine business bank", "pbb philippines"], signalKind: "institution", countryCode: "PH", regionCode: "SEA", institutionType: "bank", currency: "PHP", confidence: 84 },
  { id: "ph-psbank-rails", aliases: ["psbank online", "psbank card payment", "psbank transfer"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_bank_transfer", currency: "PHP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 84 },
  { id: "ph-atm-networks", aliases: ["bancnet", "megacash", "expressnet philippines"], signalKind: "payment_rail", countryCode: "PH", regionCode: "SEA", paymentRail: "philippines_atm_network", currency: "PHP", categoryHint: "Cash & ATM", counterpartyType: "financial_institution", purposeHint: "cash_withdrawal", confidence: 88 },
  { id: "ph-investment-platforms", aliases: ["first metro sec", "bdo securities", "col financial", "philstocks", "mytrade philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Investments", counterpartyType: "investment_platform", purposeHint: "investment", confidence: 82 },
  { id: "ph-insurance", aliases: ["sun life philippines", "pru life uk philippines", "axa philippines", "fwd philippines", "manulife philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Insurance", counterpartyType: "insurer", purposeHint: "insurance", confidence: 82 },
  { id: "ph-education", aliases: ["ateneo de manila", "de la salle university", "university of the philippines", "mapua university", "ust philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Education", counterpartyType: "education_provider", purposeHint: "education", confidence: 80 },
  { id: "ph-hospitals", aliases: ["st lukes medical center", "makati medical center", "asian hospital", "medical city philippines", "cardinal santos medical center"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Health & Wellness", counterpartyType: "healthcare_provider", purposeHint: "healthcare", confidence: 82 },
  { id: "ph-fitness", aliases: ["anytime fitness philippines", "fitness first philippines", "gold's gym philippines", "surge fitness philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Health & Wellness", purposeHint: "fitness", confidence: 76 },
  { id: "ph-home-services", aliases: ["ikea philippines", "home depot philippines", "wilcon depot", "ace hardware philippines", "allhome philippines"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Home", purposeHint: "housing", confidence: 78 },
  { id: "ph-entertainment", aliases: ["sm cinemas", "sureseats", "enchanted kingdom", "okada manila", "resorts world manila"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Entertainment", purposeHint: "entertainment", confidence: 78 },
  { id: "ph-local-delivery", aliases: ["lalamove philippines", "grabexpress philippines", "jnt express philippines", "ninja van philippines", "2go travel"], signalKind: "merchant", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", confidence: 78 },
  { id: "ph-government", aliases: ["bir philippines", "sss contribution", "philhealth contribution", "pag ibig fund", "lto philippines"], signalKind: "fee", countryCode: "PH", regionCode: "SEA", currency: "PHP", categoryHint: "Financial", counterpartyType: "government", purposeHint: "government_contribution", confidence: 86 },
  { id: "sg-banks-expanded", aliases: ["bank of china singapore", "cimb singapore", "hsbc singapore", "icbc singapore", "maybank singapore", "state bank of india singapore"], signalKind: "institution", countryCode: "SG", regionCode: "SEA", institutionType: "bank", currency: "SGD", confidence: 88 },
  { id: "sg-wallets-expanded", aliases: ["dbs paylah", "ocbc digital", "uob tmrw", "singtel dash", "mari bank singapore", "paylah singapore"], signalKind: "payment_rail", countryCode: "SG", regionCode: "SEA", paymentRail: "singapore_wallet", currency: "SGD", institutionType: "wallet", confidence: 86 },
  { id: "sg-bill-rails", aliases: ["axs singapore", "sam machine singapore", "giro singapore", "egiro singapore", "invoice now singapore"], signalKind: "payment_rail", countryCode: "SG", regionCode: "SEA", paymentRail: "singapore_bill_payment", currency: "SGD", categoryHint: "Bills & Utilities", purposeHint: "bill_payment", confidence: 84 },
  { id: "sg-government", aliases: ["cpf board", "iras singapore", "hdb singapore", "pub singapore"], signalKind: "fee", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Bills & Utilities", counterpartyType: "government_service", purposeHint: "utilities", confidence: 84 },
  { id: "sg-airlines", aliases: ["singapore airlines", "scoot singapore", "jetstar asia", "silkair", "changi airport"], signalKind: "travel", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 86 },
  { id: "sg-retail-expanded", aliases: ["watsons singapore", "guardian singapore", "cold storage", "prime supermarket singapore", "little farms singapore"], signalKind: "merchant", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 82 },
  { id: "sg-telecom", aliases: ["singtel mobile", "starhub mobile", "m1 mobile singapore", "circles life singapore", "simba telecom singapore"], signalKind: "merchant", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Bills & Utilities", counterpartyType: "telecom_provider", purposeHint: "telecom", confidence: 82 },
  { id: "my-banks-expanded", aliases: ["bank muamalat malaysia", "bank simpanan nasional", "agrobank malaysia", "mBank malaysia", "uob malaysia", "standard chartered malaysia"], signalKind: "institution", countryCode: "MY", regionCode: "SEA", institutionType: "bank", currency: "MYR", confidence: 84 },
  { id: "my-wallets-expanded", aliases: ["fave malaysia", "grabpay wallet malaysia", "shopee pay malaysia", "razer pay malaysia", "merchantrade money"], signalKind: "payment_rail", countryCode: "MY", regionCode: "SEA", paymentRail: "malaysia_wallet", currency: "MYR", institutionType: "wallet", confidence: 82 },
  { id: "my-bills-expanded", aliases: ["tng ewallet bill payment", "jompay malaysia", "sarawak pay", "selangor pay", "paynet malaysia"], signalKind: "payment_rail", countryCode: "MY", regionCode: "SEA", paymentRail: "malaysia_bill_payment", currency: "MYR", categoryHint: "Bills & Utilities", purposeHint: "bill_payment", confidence: 82 },
  { id: "my-retail-expanded", aliases: ["econsave malaysia", "seg i fresh", "hero market malaysia", "nsiang malaysia", "watsons malaysia", "guardian malaysia"], signalKind: "merchant", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 80 },
  { id: "my-utilities", aliases: ["tenaga nasional", "syabas malaysia", "indah water", "tm unifi", "maxis malaysia", "celcomdigi"], signalKind: "merchant", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 84 },
  { id: "my-transit-expanded", aliases: ["mrt corp malaysia", "rapid kl my50", "ktm malaysia", "penang ferry", "klia ekspres"], signalKind: "travel", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 82 },
  { id: "id-banks-expanded", aliases: ["bank permata", "bank mega indonesia", "bank danamon", "bank cimb niaga", "bank ocbc nisp", "bank seabank indonesia"], signalKind: "institution", countryCode: "ID", regionCode: "SEA", institutionType: "bank", currency: "IDR", confidence: 84 },
  { id: "id-wallets-expanded", aliases: ["doku wallet", "isaku indonesia", "shopeepay id", "flip indonesia", "motionpay indonesia", "blu by bca"], signalKind: "payment_rail", countryCode: "ID", regionCode: "SEA", paymentRail: "indonesia_wallet", currency: "IDR", institutionType: "wallet", confidence: 82 },
  { id: "id-retail-expanded", aliases: ["super indo", "hypermart indonesia", "transmart indonesia", "lotte mart indonesia", "guardian indonesia", "watsons indonesia"], signalKind: "merchant", countryCode: "ID", regionCode: "SEA", currency: "IDR", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 80 },
  { id: "id-services", aliases: ["pln indonesia", "telkomsel", "indosat ooredoo", "xl axiata", "pdam indonesia", "pertamina dex"], signalKind: "merchant", countryCode: "ID", regionCode: "SEA", currency: "IDR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 82 },
  { id: "id-travel-expanded", aliases: ["garuda indonesia", "lion air indonesia", "batik air indonesia", "mrt jakarta"], signalKind: "travel", countryCode: "ID", regionCode: "SEA", currency: "IDR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 82 },
  { id: "th-banks-expanded", aliases: ["government savings bank thailand", "bank of ayudhya", "ttb thailand", "cimb thai", "uob thailand", "standard chartered thailand"], signalKind: "institution", countryCode: "TH", regionCode: "SEA", institutionType: "bank", currency: "THB", confidence: 84 },
  { id: "th-wallets-expanded", aliases: ["scb easy thailand", "k plus thailand", "krungthai next", "paotang thailand", "line bk thailand"], signalKind: "payment_rail", countryCode: "TH", regionCode: "SEA", paymentRail: "thailand_wallet", currency: "THB", institutionType: "wallet", confidence: 82 },
  { id: "th-retail-expanded", aliases: ["villa market thailand", "foodland thailand", "gourmet market thailand", "the mall thailand", "boots thailand"], signalKind: "merchant", countryCode: "TH", regionCode: "SEA", currency: "THB", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 80 },
  { id: "th-utilities", aliases: ["mea thailand", "pea thailand", "การไฟฟ้านครหลวง", "ais thailand", "dtac thailand", "true corporation thailand"], signalKind: "merchant", countryCode: "TH", regionCode: "SEA", currency: "THB", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 80 },
  { id: "th-travel-expanded", aliases: ["thai airways", "thai smile", "bangkok airport", "bts rabbit line", "airport rail link bangkok"], signalKind: "travel", countryCode: "TH", regionCode: "SEA", currency: "THB", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 82 },
  { id: "vn-banks-expanded", aliases: ["sacombank vietnam", "shinhan bank vietnam", "standard chartered vietnam", "hsbc vietnam", "kbank vietnam", "vib vietnam"], signalKind: "institution", countryCode: "VN", regionCode: "SEA", institutionType: "bank", currency: "VND", confidence: 82 },
  { id: "vn-wallets-expanded", aliases: ["airpay vietnam", "vnpt money", "moca vietnam", "payoo vietnam", "viettelpay vietnam"], signalKind: "payment_rail", countryCode: "VN", regionCode: "SEA", paymentRail: "vietnam_wallet", currency: "VND", institutionType: "wallet", confidence: 80 },
  { id: "vn-retail-expanded", aliases: ["bach hoa xanh", "go vietnam supermarket", "lotte mart vietnam", "aeon vietnam", "con cung vietnam"], signalKind: "merchant", countryCode: "VN", regionCode: "SEA", currency: "VND", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 78 },
  { id: "vn-utilities", aliases: ["evn vietnam", "viettel mobile", "vinaphone", "mobifone", "fpt telecom vietnam", "saigon water"], signalKind: "merchant", countryCode: "VN", regionCode: "SEA", currency: "VND", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 80 },
  { id: "vn-travel-expanded", aliases: ["vietnam airlines", "vietjet air", "bamboo airways", "vinbus", "hanoi bus", "danang airport"], signalKind: "travel", countryCode: "VN", regionCode: "SEA", currency: "VND", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 80 },
  { id: "kr-banks-expanded", aliases: ["ibk industrial bank korea", "sc bank korea", "k bank korea", "suhyup bank", "busan bank", "daegu bank"], signalKind: "institution", countryCode: "KR", regionCode: "EAS", institutionType: "bank", currency: "KRW", confidence: 82 },
  { id: "kr-commerce-expanded", aliases: ["11st korea", "ssg.com", "lotte department store korea", "starfield korea", "costco korea", "olive young global"], signalKind: "merchant", countryCode: "KR", regionCode: "EAS", currency: "KRW", categoryHint: "Shopping", purposeHint: "retail", confidence: 78 },
  { id: "kr-travel-expanded", aliases: ["korean air", "asiana airlines", "jeju air", "tway air", "incheon airport", "busan metro"], signalKind: "travel", countryCode: "KR", regionCode: "EAS", currency: "KRW", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 82 },
  { id: "hk-commerce-expanded", aliases: ["citysuper hong kong", "sogo hong kong", "jasons ichiba", "ikea hong kong", "log on hong kong", "yue hwa"], signalKind: "merchant", countryCode: "HK", regionCode: "EAS", currency: "HKD", categoryHint: "Shopping", purposeHint: "retail", confidence: 78 },
  { id: "hk-travel-expanded", aliases: ["cathay pacific", "hong kong express", "hong kong airport", "airport express hong kong", "star ferry hong kong"], signalKind: "travel", countryCode: "HK", regionCode: "EAS", currency: "HKD", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 82 },
  { id: "tw-commerce-expanded", aliases: ["momo shopping taiwan", "pchome taiwan", "shopee taiwan", "watsons taiwan", "cosmed taiwan", "don don donki taiwan"], signalKind: "merchant", countryCode: "TW", regionCode: "EAS", currency: "TWD", categoryHint: "Shopping", purposeHint: "ecommerce", confidence: 78 },
  { id: "tw-travel-expanded", aliases: ["eva air", "china airlines taiwan", "starlux airlines", "taoyuan airport", "kaohsiung metro", "taiwan railway"], signalKind: "travel", countryCode: "TW", regionCode: "EAS", currency: "TWD", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 80 },
  { id: "au-financial-expanded", aliases: ["bankwest australia", "bendigobank", "suncorp bank australia", "up bank australia", "ing australia"], signalKind: "institution", countryCode: "AU", regionCode: "OCE", institutionType: "bank", currency: "AUD", confidence: 82 },
  { id: "au-services-expanded", aliases: ["telstra australia", "optus australia", "vodafone australia", "agl energy", "origin energy", "ausgrid"], signalKind: "merchant", countryCode: "AU", regionCode: "OCE", currency: "AUD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 80 },
  { id: "us-financial-expanded", aliases: ["bank of america", "chase bank", "wells fargo", "citibank us", "capital one", "discover bank"], signalKind: "institution", countryCode: "US", regionCode: "NAM", institutionType: "bank", currency: "USD", confidence: 82 },
  { id: "us-services-expanded", aliases: ["verizon wireless", "at&t wireless", "t mobile us", "comcast xfinity", "con edison", "pge california"], signalKind: "merchant", countryCode: "US", regionCode: "NAM", currency: "USD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "ca-financial-expanded", aliases: ["royal bank canada", "toronto dominion bank", "bank of montreal", "scotiabank canada", "cibc canada"], signalKind: "institution", countryCode: "CA", regionCode: "NAM", institutionType: "bank", currency: "CAD", confidence: 82 },
  { id: "gb-financial-expanded", aliases: ["barclays uk", "lloyds bank", "hsbc uk", "natwest", "nationwide building society"], signalKind: "institution", countryCode: "GB", regionCode: "EUR", institutionType: "bank", currency: "GBP", confidence: 82 },
  { id: "ae-services-expanded", aliases: ["du telecom uae", "etisalat uae", "dewa dubai", "addc abu dhabi", "du home internet"], signalKind: "merchant", countryCode: "AE", regionCode: "MEA", currency: "AED", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "sa-services-expanded", aliases: ["stc saudi", "mobily saudi", "zain saudi", "saudi electricity", "water national saudi"], signalKind: "merchant", countryCode: "SA", regionCode: "MEA", currency: "SAR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 76 },
  { id: "in-banks-expanded", aliases: ["state bank of india", "hdfc bank", "icici bank", "axis bank india", "kotak mahindra bank", "indusind bank", "yes bank india"], signalKind: "institution", countryCode: "IN", regionCode: "SAS", institutionType: "bank", currency: "INR", confidence: 84 },
  { id: "in-wallets-expanded", aliases: ["phonepe", "google pay india", "paytm", "amazon pay india", "bharatpe", "mobikwik", "freecharge india"], signalKind: "payment_rail", countryCode: "IN", regionCode: "SAS", paymentRail: "india_wallet", currency: "INR", institutionType: "wallet", confidence: 84 },
  { id: "in-rails-expanded", aliases: ["bharat billpay", "bbps india", "rupay", "aadhaar enabled payment", "national electronic funds transfer", "real time gross settlement india"], signalKind: "payment_rail", countryCode: "IN", regionCode: "SAS", paymentRail: "india_bank_rail", currency: "INR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 84 },
  { id: "in-commerce", aliases: ["flipkart", "bigbasket", "blinkit", "zepto india", "swiggy", "zomato india", "myntra", "nykaa"], signalKind: "merchant", countryCode: "IN", regionCode: "SAS", currency: "INR", categoryHint: "Shopping", purposeHint: "ecommerce", confidence: 80 },
  { id: "in-transport", aliases: ["ola cabs india", "rapido india", "delhi metro", "mumbai local", "indian railways", "fastag india"], signalKind: "travel", countryCode: "IN", regionCode: "SAS", currency: "INR", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 80 },
  { id: "in-utilities", aliases: ["airtel india", "jio india", "vi india", "tata power india", "bescom", "mahanagar gas"], signalKind: "merchant", countryCode: "IN", regionCode: "SAS", currency: "INR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "in-investment", aliases: ["zerodha", "groww india", "upstox", "angel one", "motilal oswal"], signalKind: "merchant", countryCode: "IN", regionCode: "SAS", currency: "INR", categoryHint: "Investments", counterpartyType: "investment_platform", purposeHint: "investment", confidence: 80 },
  { id: "nz-banks-expanded", aliases: ["anz new zealand", "asb bank", "bnz", "kiwibank", "westpac new zealand", "heartland bank nz", "tsb bank nz"], signalKind: "institution", countryCode: "NZ", regionCode: "OCE", institutionType: "bank", currency: "NZD", confidence: 84 },
  { id: "nz-payment-rails", aliases: ["eftpos new zealand", "payments nz", "direct credit nz", "automatic payment nz", "internet banking nz"], signalKind: "payment_rail", countryCode: "NZ", regionCode: "OCE", paymentRail: "new_zealand_bank_rail", currency: "NZD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 82 },
  { id: "nz-retail", aliases: ["countdown new zealand", "new world nz", "paknsave", "four square nz", "the warehouse nz", "mitre 10 nz", "chemist warehouse nz"], signalKind: "merchant", countryCode: "NZ", regionCode: "OCE", currency: "NZD", categoryHint: "Groceries", counterpartyType: "grocer", purposeHint: "groceries", confidence: 80 },
  { id: "nz-services", aliases: ["spark new zealand", "one nz", "2degrees nz", "mercury energy nz", "contact energy nz", "vector new zealand"], signalKind: "merchant", countryCode: "NZ", regionCode: "OCE", currency: "NZD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "nz-transport", aliases: ["at hop card", "snapper card nz", "metlink wellington", "christchurch metro", "intercity nz", "air new zealand"], signalKind: "travel", countryCode: "NZ", regionCode: "OCE", currency: "NZD", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 80 },
  { id: "eu-rails-expanded", aliases: ["sepa instant", "sepa credit transfer", "european payment council", "iban transfer europe"], signalKind: "payment_rail", countryCode: "EU", regionCode: "EUR", paymentRail: "sepa", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 88 },
  { id: "eu-banks-expanded", aliases: ["deutsche bank", "commerzbank", "bn p paribas", "credit agricole", "societe generale", "unicredit", "ing bank europe"], signalKind: "institution", countryCode: "EU", regionCode: "EUR", institutionType: "bank", currency: "EUR", confidence: 82 },
  { id: "eu-wallets-expanded", aliases: ["revolut europe", "n26 bank", "wise europe", "klarna europe", "bunq bank", "paypal europe"], signalKind: "payment_rail", countryCode: "EU", regionCode: "EUR", paymentRail: "europe_wallet", currency: "EUR", institutionType: "fintech", confidence: 80 },
  { id: "eu-commerce-expanded", aliases: ["amazon germany", "zalando europe", "carrefour france", "aldi europe", "lidl europe", "ikea europe", "decathlon europe"], signalKind: "merchant", countryCode: "EU", regionCode: "EUR", currency: "EUR", categoryHint: "Shopping", purposeHint: "retail", confidence: 76 },
  { id: "eu-transport-expanded", aliases: ["deutsche bahn", "sncf connect", "trenitalia", "renfe spain", "flixbus europe", "ryanair europe", "easyjet europe"], signalKind: "travel", countryCode: "EU", regionCode: "EUR", currency: "EUR", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 80 },
  { id: "eu-utilities-expanded", aliases: ["edf france", "eon germany", "enel italy", "iberdrola spain", "vodafone europe", "orange france"], signalKind: "merchant", countryCode: "EU", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "qa-banks-expanded", aliases: ["dukhan bank", "masraf al rayyan", "qatar national bank", "qatar central bank", "qatar post"], signalKind: "institution", countryCode: "QA", regionCode: "MEA", institutionType: "bank", currency: "QAR", confidence: 78 },
  { id: "qa-services-expanded", aliases: ["vodafone qatar", "ooredoo qatar", "kahramaa", "moi qatar", "mowasalat karwa"], signalKind: "merchant", countryCode: "QA", regionCode: "MEA", currency: "QAR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "kw-services-expanded", aliases: ["zain kuwait", "ooredoo kuwait", "stc kuwait", "ministry of electricity kuwait", "kuwait public transport"], signalKind: "merchant", countryCode: "KW", regionCode: "MEA", currency: "KWD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "sa-commerce-expanded", aliases: ["jarir bookstore saudi", "nahdi pharmacy saudi", "panda saudi", "danube saudi", "noon saudi", "hungerstation"], signalKind: "merchant", countryCode: "SA", regionCode: "MEA", currency: "SAR", categoryHint: "Shopping", purposeHint: "retail", confidence: 74 },
  { id: "ca-rails-expanded", aliases: ["interac request money", "interac autodeposit", "interac debit", "payments canada", "pre authorized debit canada"], signalKind: "payment_rail", countryCode: "CA", regionCode: "NAM", paymentRail: "canada_transfer", currency: "CAD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 82 },
  { id: "ca-banks-expanded", aliases: ["rbc canada", "td canada trust", "bmo canada", "scotia bank canada", "national bank canada", "desjardins canada"], signalKind: "institution", countryCode: "CA", regionCode: "NAM", institutionType: "bank", currency: "CAD", confidence: 82 },
  { id: "ca-commerce-expanded", aliases: ["walmart canada", "costco canada", "metro grocery canada", "farm boy canada", "lcbo ontario"], signalKind: "merchant", countryCode: "CA", regionCode: "NAM", currency: "CAD", categoryHint: "Shopping", purposeHint: "retail", confidence: 76 },
  { id: "ca-services-expanded", aliases: ["rogers canada", "bell canada", "telus canada", "hydro one", "toronto hydro", "enbridge gas"], signalKind: "merchant", countryCode: "CA", regionCode: "NAM", currency: "CAD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 76 },
  { id: "gulf-payment-rails", aliases: ["mada saudi", "mada pay", "knet kuwait", "uae switch", "naps qatar", "oman net"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "MEA", paymentRail: "gulf_domestic_rail", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 78 },
  { id: "gulf-remittance-expanded", aliases: ["al mulla exchange", "bfc bahrain", "khaliji exchange", "waseela exchange", "al rostamani exchange", "lu lu international exchange"], signalKind: "payment_rail", countryCode: "GLOBAL", regionCode: "MEA", paymentRail: "gulf_remittance", categoryHint: "Transfers", transactionTypeHint: "transfer", counterpartyType: "remittance_provider", purposeHint: "remittance", confidence: 76 },
  { id: "br-payment-rails", aliases: ["pix brazil", "ted brazil", "doc brazil", "boleto bancario", "pagamento pix"], signalKind: "payment_rail", countryCode: "BR", regionCode: "LATAM", paymentRail: "brazil_pix", currency: "BRL", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 78 },
  { id: "br-wallets-commerce", aliases: ["nubank brazil", "mercado pago brazil", "picpay brazil", "pagbank", "ifood brazil", "mercado livre brazil"], signalKind: "merchant", countryCode: "BR", regionCode: "LATAM", currency: "BRL", categoryHint: "Shopping", purposeHint: "ecommerce", confidence: 74 },
  { id: "mx-payment-rails", aliases: ["spei mexico", "coDi mexico", "transferencia spei", "tarjeta bienestar"], signalKind: "payment_rail", countryCode: "MX", regionCode: "LATAM", paymentRail: "mexico_spei", currency: "MXN", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 76 },
  { id: "mx-commerce", aliases: ["mercado pago mexico", "oxxo mexico", "santander mexico", "bbva mexico", "banorte", "coppel mexico"], signalKind: "merchant", countryCode: "MX", regionCode: "LATAM", currency: "MXN", categoryHint: "Shopping", purposeHint: "retail", confidence: 72 },
  { id: "za-payment-rails", aliases: ["payshap south africa", "eft south africa", "payfast south africa", "snapscan south africa"], signalKind: "payment_rail", countryCode: "ZA", regionCode: "AFR", paymentRail: "south_africa_rail", currency: "ZAR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 72 },
  { id: "za-commerce", aliases: ["capitec south africa", "standard bank south africa", "shoprite south africa", "checkers south africa", "woolworths south africa"], signalKind: "merchant", countryCode: "ZA", regionCode: "AFR", currency: "ZAR", categoryHint: "Shopping", purposeHint: "retail", confidence: 70 },
  { id: "tr-payment-rails", aliases: ["fast turkey", "eft turkey", "havale turkey", "papara turkey", "iyzico turkey"], signalKind: "payment_rail", countryCode: "TR", regionCode: "EUR", paymentRail: "turkey_bank_rail", currency: "TRY", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 70 },
  { id: "tr-commerce", aliases: ["trendyol", "hepsiburada", "getir turkey", "bim turkey", "migros turkey", "turkish airlines"], signalKind: "merchant", countryCode: "TR", regionCode: "EUR", currency: "TRY", categoryHint: "Shopping", purposeHint: "retail", confidence: 70 },
  { id: "ie-payment-rails", aliases: ["aib ireland", "bank of ireland", "permanent tsb", "revolut ireland", "irish sepa transfer"], signalKind: "payment_rail", countryCode: "IE", regionCode: "EUR", paymentRail: "sepa", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 78 },
  { id: "ie-commerce-transit", aliases: ["leap card ireland", "irish rail", "tesco ireland", "dunnes stores", "supervalu ireland", "ryanair ireland"], signalKind: "travel", countryCode: "IE", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 76 },
  { id: "ie-utilities", aliases: ["eir ireland", "vodafone ireland", "three ireland", "electric ireland", "bord gais"], signalKind: "merchant", countryCode: "IE", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "ch-payment-rails", aliases: ["ubs switzerland", "postfinance", "twint switzerland", "credit suisse switzerland", "swiss sepa transfer"], signalKind: "payment_rail", countryCode: "CH", regionCode: "EUR", paymentRail: "switzerland_bank_rail", currency: "CHF", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 76 },
  { id: "ch-commerce-transit", aliases: ["sbb cff ffs", "migros switzerland", "coop switzerland", "aldi suisse", "swiss international air lines"], signalKind: "travel", countryCode: "CH", regionCode: "EUR", currency: "CHF", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 74 },
  { id: "ch-utilities", aliases: ["swisscom", "sunrise switzerland", "salt switzerland", "ewz zurich", "romande energie"], signalKind: "merchant", countryCode: "CH", regionCode: "EUR", currency: "CHF", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "de-payment-rails", aliases: ["girocard germany", "echtzeituberweisung", "sparkasse germany", "volksbank germany", "wero germany"], signalKind: "payment_rail", countryCode: "DE", regionCode: "EUR", paymentRail: "germany_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 76 },
  { id: "de-commerce-transit", aliases: ["bvg berlin", "mvv munich", "rewe germany", "edeka germany", "lidl deutschland", "lufthansa germany"], signalKind: "travel", countryCode: "DE", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 76 },
  { id: "de-utilities", aliases: ["telekom deutschland", "vodafone germany", "1und1 germany", "stadtwerke germany", "vattenfall germany"], signalKind: "merchant", countryCode: "DE", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "es-payment-rails", aliases: ["bizum spain", "caixabank spain", "bbva spain", "santander spain", "banco sabadell"], signalKind: "payment_rail", countryCode: "ES", regionCode: "EUR", paymentRail: "spain_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 76 },
  { id: "es-commerce-transit", aliases: ["metro madrid", "tmb barcelona", "mercadona", "el corte ingles", "iberia spain"], signalKind: "travel", countryCode: "ES", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 76 },
  { id: "es-utilities", aliases: ["movistar spain", "vodafone spain", "orange espana", "endesa", "naturgy spain"], signalKind: "merchant", countryCode: "ES", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "it-payment-rails", aliases: ["bancomat pay", "poste italiane", "intesa sanpaolo", "unicredit italy", "fineco bank"], signalKind: "payment_rail", countryCode: "IT", regionCode: "EUR", paymentRail: "italy_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 74 },
  { id: "it-commerce-transit", aliases: ["atm milano", "trenord", "esselunga", "conad italy", "poste pay", "ita airways"], signalKind: "travel", countryCode: "IT", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 74 },
  { id: "it-utilities", aliases: ["tim italy", "windtre", "iliad italy", "acea italy", "eni gas luce"], signalKind: "merchant", countryCode: "IT", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "fr-payment-rails", aliases: ["cartes bancaires france", "wero france", "lydia france", "banque postale", "credit mutuel france"], signalKind: "payment_rail", countryCode: "FR", regionCode: "EUR", paymentRail: "france_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 74 },
  { id: "fr-commerce-transit", aliases: ["ratp paris", "navigo france", "sncf france", "monoprix france", "intermarche", "air france"], signalKind: "travel", countryCode: "FR", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 74 },
  { id: "fr-utilities", aliases: ["sfr france", "bouygues telecom france", "free mobile france", "engie france", "total energies france"], signalKind: "merchant", countryCode: "FR", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "nl-be-payment-rails", aliases: ["ideal netherlands", "tikkie netherlands", "ing netherlands", "abn amro", "kbc belgium", "bancontact belgium"], signalKind: "payment_rail", countryCode: "EU", regionCode: "EUR", paymentRail: "benelux_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 74 },
  { id: "nl-be-commerce-transit", aliases: ["ns nederland", "ret belgium", "albert heijn", "jumbo supermarkets", "bol.com", "brussels airlines"], signalKind: "travel", countryCode: "EU", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 72 },
  { id: "pt-payment-rails", aliases: ["mb way portugal", "multibanco portugal", "sibs portugal", "millennium bcp", "caixa geral de depositos"], signalKind: "payment_rail", countryCode: "EU", regionCode: "EUR", paymentRail: "portugal_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 72 },
  { id: "pt-commerce-transit", aliases: ["metro lisboa", "cp comboios portugal", "continente portugal", "pingo doce", "tap air portugal"], signalKind: "travel", countryCode: "EU", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 72 },
  { id: "bd-payment-rails", aliases: ["bkash bangladesh", "nagad bangladesh", "rocket bangladesh", "upay bangladesh", "npsb bangladesh"], signalKind: "payment_rail", countryCode: "BD", regionCode: "SAS", paymentRail: "bangladesh_wallet", currency: "BDT", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 70 },
  { id: "pk-payment-rails", aliases: ["easypaisa pakistan", "jazzcash pakistan", "sadapay pakistan", "nayapay pakistan", "raast pakistan"], signalKind: "payment_rail", countryCode: "PK", regionCode: "SAS", paymentRail: "pakistan_wallet", currency: "PKR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 70 },
  { id: "co-payment-rails", aliases: ["nequi colombia", "daviplata colombia", "pse colombia", "transfiya colombia", "bancolombia"], signalKind: "payment_rail", countryCode: "CO", regionCode: "LATAM", paymentRail: "colombia_wallet", currency: "COP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 70 },
  { id: "cl-payment-rails", aliases: ["mach chile", "transbank chile", "mercado pago chile", "webpay chile", "bancoestado chile"], signalKind: "payment_rail", countryCode: "CL", regionCode: "LATAM", paymentRail: "chile_bank_rail", currency: "CLP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "ke-payment-rails", aliases: ["mpesa kenya", "airtel money kenya", "equity bank kenya", "pesalink kenya", "till number kenya"], signalKind: "payment_rail", countryCode: "KE", regionCode: "AFR", paymentRail: "kenya_wallet", currency: "KES", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "ng-payment-rails", aliases: ["paga nigeria", "opay nigeria", "flutterwave nigeria", "paystack nigeria", "ussd nigeria"], signalKind: "payment_rail", countryCode: "NG", regionCode: "AFR", paymentRail: "nigeria_wallet", currency: "NGN", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 66 },
  { id: "at-payment-rails", aliases: ["eps austria", "bank austria", "erste bank austria", "raiffeisen austria", "wero austria"], signalKind: "payment_rail", countryCode: "AT", regionCode: "EUR", paymentRail: "austria_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "at-commerce-transit", aliases: ["wiener linien", "oebb austria", "billa austria", "spar austria", "austrian airlines"], signalKind: "travel", countryCode: "AT", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 68 },
  { id: "be-payment-rails", aliases: ["payconiq belgium", "belfius", "argenta belgium"], signalKind: "payment_rail", countryCode: "BE", regionCode: "EUR", paymentRail: "belgium_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "be-commerce-transit", aliases: ["sncb belgium", "delhaize belgium", "colruyt belgium", "carrefour belgium"], signalKind: "travel", countryCode: "BE", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 68 },
  { id: "nl-payment-rails", aliases: ["abn amro netherlands", "rabobank netherlands"], signalKind: "payment_rail", countryCode: "NL", regionCode: "EUR", paymentRail: "netherlands_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 70 },
  { id: "nl-commerce-transit", aliases: ["ns netherlands", "gvb amsterdam", "albert heijn netherlands", "jumbo netherlands", "coolblue"], signalKind: "travel", countryCode: "NL", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 70 },
  { id: "se-payment-rails", aliases: ["swish sweden", "bankid sweden", "klarna sweden", "seb sweden", "swedbank"], signalKind: "payment_rail", countryCode: "SE", regionCode: "EUR", paymentRail: "sweden_bank_rail", currency: "SEK", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "se-commerce-transit", aliases: ["sl stockholm", "sj sweden", "ica sweden", "coop sverige", "volvo cars"], signalKind: "travel", countryCode: "SE", regionCode: "EUR", currency: "SEK", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 66 },
  { id: "no-payment-rails", aliases: ["vipps norway", "bankid norway", "dnb norway", "sparebank norway", "nordea norway"], signalKind: "payment_rail", countryCode: "NO", regionCode: "EUR", paymentRail: "norway_bank_rail", currency: "NOK", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "no-commerce-transit", aliases: ["ruter oslo", "vy norway", "rema 1000", "kiwi norway", "norwegian air shuttle"], signalKind: "travel", countryCode: "NO", regionCode: "EUR", currency: "NOK", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 66 },
  { id: "dk-payment-rails", aliases: ["mobilepay denmark", "mitid denmark", "danske bank", "nordea denmark", "jyske bank"], signalKind: "payment_rail", countryCode: "DK", regionCode: "EUR", paymentRail: "denmark_bank_rail", currency: "DKK", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "dk-commerce-transit", aliases: ["dsb denmark", "rejsekort", "netto denmark", "foetex", "sas denmark"], signalKind: "travel", countryCode: "DK", regionCode: "EUR", currency: "DKK", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 66 },
  { id: "pl-payment-rails", aliases: ["blik poland", "przelewy24", "payu poland", "zloty transfer", "mBank poland"], signalKind: "payment_rail", countryCode: "PL", regionCode: "EUR", paymentRail: "poland_bank_rail", currency: "PLN", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "pl-commerce-transit", aliases: ["zabka poland", "biedronka", "allegro poland", "pkp intercity", "lot polish airlines"], signalKind: "travel", countryCode: "PL", regionCode: "EUR", currency: "PLN", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 66 },
  { id: "gr-payment-rails", aliases: ["iris payments greece", "piraeus bank", "alpha bank greece", "national bank of greece", "eurobank greece"], signalKind: "payment_rail", countryCode: "GR", regionCode: "EUR", paymentRail: "greece_bank_rail", currency: "EUR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 66 },
  { id: "gr-commerce-transit", aliases: ["oasa athens", "hellenic train", "sklavenitis", "masoutis", "aegean airlines"], signalKind: "travel", countryCode: "GR", regionCode: "EUR", currency: "EUR", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 64 },
  { id: "mo-payment-rails", aliases: ["mpay macau", "macau pass", "alipay macau", "bank of china macau", "bcm macau"], signalKind: "payment_rail", countryCode: "MO", regionCode: "EAS", paymentRail: "macau_wallet", currency: "MOP", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 68 },
  { id: "mo-commerce-transit", aliases: ["macau light rapid transit", "macau bus", "sands macau", "wynn macau", "macau airport"], signalKind: "travel", countryCode: "MO", regionCode: "EAS", currency: "MOP", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 66 },
  { id: "gu-payment-rails", aliases: ["bank of guam", "first hawaiian bank guam", "payless guam", "guam bank transfer"], signalKind: "payment_rail", countryCode: "GU", regionCode: "OCE", paymentRail: "us_ach_wallet", currency: "USD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 64 },
  { id: "gu-commerce-transit", aliases: ["guam regional transit", "macy's guam", "micronesia mall", "united airlines guam", "docomo pacific guam"], signalKind: "travel", countryCode: "GU", regionCode: "OCE", currency: "USD", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 62 },
  { id: "fj-payment-rails", aliases: ["m-paisa fiji", "vodafone fiji money", "bsp fiji", "westpac fiji", "anz fiji"], signalKind: "payment_rail", countryCode: "FJ", regionCode: "OCE", paymentRail: "fiji_wallet", currency: "FJD", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 62 },
  { id: "fj-commerce-transit", aliases: ["fiji bus card", "suva bus", "fiji airways", "mhcc fiji", "courts fiji"], signalKind: "travel", countryCode: "FJ", regionCode: "OCE", currency: "FJD", categoryHint: "Travel & Lifestyle", counterpartyType: "travel_provider", purposeHint: "travel", travelLikely: true, confidence: 60 },
  { id: "gh-payment-rails", aliases: ["mobile money ghana", "momo ghana", "vodafone cash ghana", "mtn momo ghana", "expresspay ghana"], signalKind: "payment_rail", countryCode: "GH", regionCode: "AFR", paymentRail: "ghana_wallet", currency: "GHS", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 64 },
  { id: "tz-payment-rails", aliases: ["mpesa tanzania", "tigopesa tanzania", "airtel money tanzania", "mixx by yas", "nmb bank tanzania"], signalKind: "payment_rail", countryCode: "TZ", regionCode: "AFR", paymentRail: "tanzania_wallet", currency: "TZS", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 62 },
  { id: "lk-payment-rails", aliases: ["lankaqr", "frimi sri lanka", "sampath bank sri lanka", "commercial bank sri lanka", "dialog genie"], signalKind: "payment_rail", countryCode: "LK", regionCode: "SAS", paymentRail: "sri_lanka_wallet", currency: "LKR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 62 },
  { id: "sg-healthcare-education", aliases: ["raffles medical singapore", "parkway pantai singapore", "national university of singapore", "nanyang technological university"], signalKind: "merchant", countryCode: "SG", regionCode: "SEA", currency: "SGD", categoryHint: "Health & Wellness", counterpartyType: "healthcare_provider", purposeHint: "healthcare", confidence: 78 },
  { id: "my-healthcare-education", aliases: ["gleneagles hospital malaysia", "pantai hospital malaysia", "universiti malaya", "monash university malaysia"], signalKind: "merchant", countryCode: "MY", regionCode: "SEA", currency: "MYR", categoryHint: "Health & Wellness", counterpartyType: "healthcare_provider", purposeHint: "healthcare", confidence: 76 },
  { id: "hk-utilities-telecom", aliases: ["hong kong electric", "hong kong and china gas", "csl hong kong", "smartone hong kong"], signalKind: "merchant", countryCode: "HK", regionCode: "EAS", currency: "HKD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "tw-wallets-telecom", aliases: ["taiwan pay", "chunghwa telecom taiwan", "taiwan mobile", "fareastone taiwan"], signalKind: "payment_rail", countryCode: "TW", regionCode: "EAS", paymentRail: "taiwan_wallet", currency: "TWD", institutionType: "wallet", categoryHint: "Transfers", transactionTypeHint: "transfer", purposeHint: "transfer", confidence: 78 },
  { id: "jp-utilities-telecom", aliases: ["tepco japan", "tokyo electric power", "ntt docomo japan", "softbank japan"], signalKind: "merchant", countryCode: "JP", regionCode: "EAS", currency: "JPY", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "ae-utilities-telecom", aliases: ["abu dhabi distribution company", "al ain distribution company", "emirates central cooling", "du home broadband"], signalKind: "merchant", countryCode: "AE", regionCode: "MEA", currency: "AED", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 78 },
  { id: "sa-utilities-retail-health", aliases: ["saudi electricity company", "national water company saudi", "nahdi medical saudi", "saudi telecom business"], signalKind: "merchant", countryCode: "SA", regionCode: "MEA", currency: "SAR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 76 },
  { id: "qa-utilities-telecom", aliases: ["qatar cool", "kahramaa qatar", "qatar fuel", "vodafone qatar business"], signalKind: "merchant", countryCode: "QA", regionCode: "MEA", currency: "QAR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "kw-utilities-telecom", aliases: ["mew kuwait", "kuwait municipality", "ooredoo kuwait business", "koc kuwait"], signalKind: "merchant", countryCode: "KW", regionCode: "MEA", currency: "KWD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "us-utilities-telecom", aliases: ["duke energy", "pge california residential", "verizon fios", "spectrum mobile us"], signalKind: "merchant", countryCode: "US", regionCode: "NAM", currency: "USD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 76 },
  { id: "ca-utilities-telecom", aliases: ["hydro quebec", "hydro one residential", "rogers wireless canada", "bell mobility canada"], signalKind: "merchant", countryCode: "CA", regionCode: "NAM", currency: "CAD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 74 },
  { id: "au-utilities-telecom", aliases: ["origin energy australia", "energex australia", "telstra business australia", "optus business australia"], signalKind: "merchant", countryCode: "AU", regionCode: "OCE", currency: "AUD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 76 },
  { id: "gb-utilities-telecom", aliases: ["british gas", "octopus energy uk", "bt broadband uk", "ee mobile uk"], signalKind: "merchant", countryCode: "GB", regionCode: "EUR", currency: "GBP", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 76 },
  // Canonical depth pass for thinner regional packs.
  { id: "br-payment-rails-expanded", aliases: ["pix transferencia", "pix copia e cola", "pix qr code brazil", "pix agendado", "pix devolucao"], signalKind: "payment_rail", countryCode: "BR", regionCode: "LATAM", paymentRail: "brazil_pix", currency: "BRL", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 76 },
  { id: "br-services-commerce", aliases: ["enel brasil", "sabesp", "claro brasil", "vivo brasil", "ifood brasil", "assai atacadista"], signalKind: "merchant", countryCode: "BR", regionCode: "LATAM", currency: "BRL", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "mx-payment-rails-expanded", aliases: ["spei transferencia", "codi transferencia", "stp transferencia", "transferencia interbancaria mexico", "clave spei mexico"], signalKind: "payment_rail", countryCode: "MX", regionCode: "LATAM", paymentRail: "mexico_spei", currency: "MXN", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 74 },
  { id: "mx-services-commerce", aliases: ["cfe mexico", "telcel mexico", "telmex mexico", "izzi hogar mexico", "soriana mexico", "farmacias del ahorro"], signalKind: "merchant", countryCode: "MX", regionCode: "LATAM", currency: "MXN", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 70 },
  { id: "za-payment-rails-expanded", aliases: ["capitec pay", "nedbank money transfer", "fnb ewallet", "standard bank instant money", "absa cash send"], signalKind: "payment_rail", countryCode: "ZA", regionCode: "AFR", paymentRail: "south_africa_payshap", currency: "ZAR", categoryHint: "Transfers", transactionTypeHint: "transfer", confidence: 72 },
  { id: "za-services-commerce", aliases: ["eskom south africa", "vodacom south africa", "mtn south africa", "dischem south africa", "pick n pay south africa", "game south africa"], signalKind: "merchant", countryCode: "ZA", regionCode: "AFR", currency: "ZAR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 70 },
  { id: "tr-services-transit", aliases: ["istanbulkart", "istanbulkart reload", "metro istanbul", "turkcell turkey", "turk telekom", "a101 turkey"], signalKind: "travel", countryCode: "TR", regionCode: "EUR", currency: "TRY", categoryHint: "Transport", counterpartyType: "transport_provider", purposeHint: "transport", travelLikely: true, confidence: 68 },
  { id: "bd-banks-commerce", aliases: ["brac bank bangladesh", "city bank bangladesh", "dutch bangla bank", "daraz bangladesh", "meena bazar bangladesh", "robi bangladesh"], signalKind: "institution", countryCode: "BD", regionCode: "SAS", institutionType: "bank", currency: "BDT", confidence: 68 },
  { id: "pk-banks-commerce", aliases: ["hbl pakistan", "ubl pakistan", "mcb bank pakistan", "bank alfalah pakistan", "daraz pakistan", "jazz pakistan"], signalKind: "institution", countryCode: "PK", regionCode: "SAS", institutionType: "bank", currency: "PKR", confidence: 68 },
  { id: "co-services-commerce", aliases: ["epm colombia", "claro colombia", "tigo colombia", "exito colombia", "olimpica colombia", "rappi colombia"], signalKind: "merchant", countryCode: "CO", regionCode: "LATAM", currency: "COP", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 66 },
  { id: "cl-services-commerce", aliases: ["enel chile", "entel chile", "movistar chile", "lider chile", "jumbo chile", "farmacias ahumada"], signalKind: "merchant", countryCode: "CL", regionCode: "LATAM", currency: "CLP", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 66 },
  { id: "ke-services-commerce", aliases: ["kenya power", "airtel kenya", "safaricom kenya", "naivas kenya", "quickmart kenya", "jumia kenya"], signalKind: "merchant", countryCode: "KE", regionCode: "AFR", currency: "KES", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 66 },
  { id: "ng-services-commerce", aliases: ["ikeja electric", "mtn nigeria", "airtel nigeria", "shoprite nigeria", "spar nigeria", "jiji nigeria"], signalKind: "merchant", countryCode: "NG", regionCode: "AFR", currency: "NGN", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 64 },
  { id: "gh-services-commerce", aliases: ["ecg ghana", "vodafone ghana", "mtn ghana", "melcom ghana", "shoprite ghana", "jiji ghana"], signalKind: "merchant", countryCode: "GH", regionCode: "AFR", currency: "GHS", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 62 },
  { id: "tz-services-commerce", aliases: ["tanesco tanzania", "vodacom tanzania", "airtel tanzania", "simba cement tanzania", "shoppers plaza tanzania", "kariakoo tanzania"], signalKind: "merchant", countryCode: "TZ", regionCode: "AFR", currency: "TZS", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 60 },
  { id: "lk-services-commerce", aliases: ["ceylon electricity board", "dialog sri lanka", "mobitel sri lanka", "keells sri lanka", "cargills food city", "daraz sri lanka"], signalKind: "merchant", countryCode: "LK", regionCode: "SAS", currency: "LKR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 60 },
  { id: "nz-services-commerce", aliases: ["vector auckland electricity", "mercury energy bill nz", "spark broadband nz", "one nz mobile", "paknsave online nz", "mitre 10 nz trade"], signalKind: "merchant", countryCode: "NZ", regionCode: "OCE", currency: "NZD", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 72 },
  { id: "at-services-commerce", aliases: ["wien energie", "a1 austria", "magenta austria", "hofer austria", "dm austria", "bipa austria"], signalKind: "merchant", countryCode: "AT", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 64 },
  { id: "be-services-commerce", aliases: ["proximus belgium", "telenet belgium", "engie belgium", "aldi belgium", "action belgium", "medi market belgium"], signalKind: "merchant", countryCode: "BE", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 64 },
  { id: "nl-services-commerce", aliases: ["kpn netherlands", "ziggo netherlands", "eneco netherlands", "kruidvat netherlands", "hema netherlands", "et os netherlands"], signalKind: "merchant", countryCode: "NL", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 64 },
  { id: "se-services-commerce", aliases: ["telia sweden", "tele2 sweden", "vattenfall sweden", "willys sweden", "apoteket sweden", "pressbyran sweden"], signalKind: "merchant", countryCode: "SE", regionCode: "EUR", currency: "SEK", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 62 },
  { id: "no-services-commerce", aliases: ["telenor norway", "telia norway", "hafslund norway", "coop mega norway", "apotek 1 norway", "elkjop norway"], signalKind: "merchant", countryCode: "NO", regionCode: "EUR", currency: "NOK", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 62 },
  { id: "dk-services-commerce", aliases: ["tdc net denmark", "norlys denmark", "andels energi denmark", "ir ma denmark", "matas denmark", "elgiganten denmark"], signalKind: "merchant", countryCode: "DK", regionCode: "EUR", currency: "DKK", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 62 },
  { id: "pl-services-commerce", aliases: ["orange poland", "pge poland", "energa poland", "rossmann poland", "carrefour poland", "empik poland"], signalKind: "merchant", countryCode: "PL", regionCode: "EUR", currency: "PLN", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 62 },
  { id: "gr-services-commerce", aliases: ["dei greece", "cosmote greece", "nova greece", "my market greece", "sklavenitis market", "public greece"], signalKind: "merchant", countryCode: "GR", regionCode: "EUR", currency: "EUR", categoryHint: "Bills & Utilities", counterpartyType: "utility_provider", purposeHint: "utilities", confidence: 60 },
];

/**
 * Statement providers frequently decorate a known name with a descriptor word
 * such as "payment", "transaction", or "merchant". Keep these as separate,
 * lower-confidence evidence entries so the corpus can recognize those forms
 * without making them as authoritative as the canonical alias.
 */
const buildDescriptorExpansion = (sourceEntries: ContextEntry[]): ContextEntry[] =>
  sourceEntries.flatMap((entry) =>
    entry.aliases
      .filter((alias) => alias.trim().split(/\s+/).length >= 2)
      .flatMap((alias, aliasIndex) =>
        ["payment", "transaction", "merchant"].map((suffix, suffixIndex) => ({
          ...entry,
          id: `descriptor-${entry.id}-${aliasIndex + 1}-${suffixIndex + 1}`,
          aliases: [`${alias} ${suffix}`],
          negativeAliases: [],
          confidence: Math.max(55, entry.confidence - 18),
          source: "curated" as const,
          reviewStatus: "active" as const,
          coverage: "descriptor_variant" as const,
        }))
      )
  );

const entries: ContextEntry[] = [...baseEntries, ...buildDescriptorExpansion(baseEntries)];

const regionalProfiles: RegionalParsingProfile[] = [
  { countryCode: "PH", regionCode: "SEA", locales: ["en-PH", "fil-PH"], primaryLocale: "en-PH", languages: ["en", "fil"], dateOrder: "mdy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "PHP", legalEntitySuffixes: ["inc", "corp", "corporation", "co", "ltd"], confidence: 86 },
  { countryCode: "SG", regionCode: "SEA", locales: ["en-SG", "zh-SG", "ms-SG"], primaryLocale: "en-SG", languages: ["en", "zh", "ms"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "SGD", legalEntitySuffixes: ["pte ltd", "ltd", "llp", "inc"] , confidence: 84 },
  { countryCode: "MY", regionCode: "SEA", locales: ["en-MY", "ms-MY", "zh-MY"], primaryLocale: "en-MY", languages: ["en", "ms", "zh"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "MYR", legalEntitySuffixes: ["sdn bhd", "bhd", "berhad", "ltd"], confidence: 84 },
  { countryCode: "ID", regionCode: "SEA", locales: ["id-ID", "en-ID"], primaryLocale: "id-ID", languages: ["id", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "IDR", legalEntitySuffixes: ["pt", "tbk", "cv", "persero"], confidence: 84 },
  { countryCode: "TH", regionCode: "SEA", locales: ["th-TH", "en-TH"], primaryLocale: "th-TH", languages: ["th", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "THB", legalEntitySuffixes: ["co ltd", "ltd", "public company limited"], confidence: 78 },
  { countryCode: "VN", regionCode: "SEA", locales: ["vi-VN", "en-VN"], primaryLocale: "vi-VN", languages: ["vi", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "VND", legalEntitySuffixes: ["tnhh", "jsc", "cp", "co ltd"], confidence: 78 },
  { countryCode: "JP", regionCode: "EAS", locales: ["ja-JP", "en-JP"], primaryLocale: "ja-JP", languages: ["ja", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "JPY", legalEntitySuffixes: ["kk", "kabushiki kaisha", "yugen kaisha"], confidence: 82 },
  { countryCode: "HK", regionCode: "EAS", locales: ["zh-HK", "en-HK"], primaryLocale: "zh-HK", languages: ["zh", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "HKD", legalEntitySuffixes: ["ltd", "limited", "company"], confidence: 80 },
  { countryCode: "TW", regionCode: "EAS", locales: ["zh-TW", "en-TW"], primaryLocale: "zh-TW", languages: ["zh", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "TWD", legalEntitySuffixes: ["co ltd", "ltd", "inc"], confidence: 78 },
  { countryCode: "IN", regionCode: "SAS", locales: ["en-IN", "hi-IN"], primaryLocale: "en-IN", languages: ["en", "hi"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "INR", legalEntitySuffixes: ["pvt ltd", "private limited", "ltd", "llp"], confidence: 82 },
  { countryCode: "AE", regionCode: "MEA", locales: ["en-AE", "ar-AE"], primaryLocale: "en-AE", languages: ["en", "ar"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "AED", legalEntitySuffixes: ["llc", "l l c", "pjsc", "est"], confidence: 80 },
  { countryCode: "EU", regionCode: "EUR", locales: ["en-IE", "de-DE", "fr-FR"], primaryLocale: "en-IE", languages: ["en", "de", "fr"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["gmbh", "sarl", "sa", "bv", "oy", "ab", "ltd"], confidence: 64 },
  { countryCode: "US", regionCode: "NAM", locales: ["en-US", "es-US"], primaryLocale: "en-US", languages: ["en", "es"], dateOrder: "mdy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "USD", legalEntitySuffixes: ["inc", "incorporated", "llc", "corp", "corporation", "co"], confidence: 86 },
  { countryCode: "GB", regionCode: "EUR", locales: ["en-GB"], primaryLocale: "en-GB", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "GBP", legalEntitySuffixes: ["ltd", "limited", "plc", "llp"], confidence: 86 },
  { countryCode: "AU", regionCode: "OCE", locales: ["en-AU"], primaryLocale: "en-AU", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "AUD", legalEntitySuffixes: ["pty ltd", "proprietary limited", "ltd", "inc"], confidence: 86 },
  { countryCode: "NZ", regionCode: "OCE", locales: ["en-NZ"], primaryLocale: "en-NZ", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "NZD", legalEntitySuffixes: ["limited", "ltd", "inc", "trust"], confidence: 82 },
  { countryCode: "BR", regionCode: "LATAM", locales: ["pt-BR", "en-BR"], primaryLocale: "pt-BR", languages: ["pt", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "BRL", legalEntitySuffixes: ["ltda", "sa", "me", "eireli"], confidence: 74 },
  { countryCode: "MX", regionCode: "LATAM", locales: ["es-MX", "en-MX"], primaryLocale: "es-MX", languages: ["es", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "MXN", legalEntitySuffixes: ["sa de cv", "sc", "s de rl", "ac"], confidence: 72 },
  { countryCode: "ZA", regionCode: "AFR", locales: ["en-ZA", "zu-ZA"], primaryLocale: "en-ZA", languages: ["en", "zu"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "ZAR", legalEntitySuffixes: ["pty ltd", "cc", "ltd", "inc"], confidence: 70 },
  { countryCode: "TR", regionCode: "EUR", locales: ["tr-TR", "en-TR"], primaryLocale: "tr-TR", languages: ["tr", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "TRY", legalEntitySuffixes: ["as", "ltd sti", "anonim sirketi"], confidence: 70 },
  { countryCode: "IE", regionCode: "EUR", locales: ["en-IE"], primaryLocale: "en-IE", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "EUR", legalEntitySuffixes: ["ltd", "plc", "dac", "teoranta"], confidence: 78 },
  { countryCode: "CH", regionCode: "EUR", locales: ["de-CH", "fr-CH", "it-CH", "en-CH"], primaryLocale: "de-CH", languages: ["de", "fr", "it", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: "'", defaultCurrency: "CHF", legalEntitySuffixes: ["ag", "gmbh", "sa", "sarl"], confidence: 76 },
  { countryCode: "DE", regionCode: "EUR", locales: ["de-DE", "en-DE"], primaryLocale: "de-DE", languages: ["de", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["gmbh", "ag", "kg", "ohg"], confidence: 78 },
  { countryCode: "ES", regionCode: "EUR", locales: ["es-ES", "en-ES"], primaryLocale: "es-ES", languages: ["es", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["sl", "sa", "slu", "sc"], confidence: 76 },
  { countryCode: "IT", regionCode: "EUR", locales: ["it-IT", "en-IT"], primaryLocale: "it-IT", languages: ["it", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["srl", "spa", "snc", "sas"], confidence: 76 },
  { countryCode: "FR", regionCode: "EUR", locales: ["fr-FR", "en-FR"], primaryLocale: "fr-FR", languages: ["fr", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: " ", defaultCurrency: "EUR", legalEntitySuffixes: ["sarl", "sa", "sas", "eurl"], confidence: 76 },
  { countryCode: "BD", regionCode: "SAS", locales: ["bn-BD", "en-BD"], primaryLocale: "bn-BD", languages: ["bn", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "BDT", legalEntitySuffixes: ["ltd", "limited", "plc"], confidence: 66 },
  { countryCode: "PK", regionCode: "SAS", locales: ["ur-PK", "en-PK"], primaryLocale: "en-PK", languages: ["ur", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "PKR", legalEntitySuffixes: ["pvt ltd", "limited", "plc"], confidence: 66 },
  { countryCode: "CO", regionCode: "LATAM", locales: ["es-CO", "en-CO"], primaryLocale: "es-CO", languages: ["es", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "COP", legalEntitySuffixes: ["sa", "sas", "ltda", "s en c"], confidence: 64 },
  { countryCode: "CL", regionCode: "LATAM", locales: ["es-CL", "en-CL"], primaryLocale: "es-CL", languages: ["es", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "CLP", legalEntitySuffixes: ["spa", "ltda", "sa", "eirl"], confidence: 64 },
  { countryCode: "KE", regionCode: "AFR", locales: ["sw-KE", "en-KE"], primaryLocale: "en-KE", languages: ["sw", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "KES", legalEntitySuffixes: ["ltd", "plc", "llp"], confidence: 62 },
  { countryCode: "NG", regionCode: "AFR", locales: ["en-NG"], primaryLocale: "en-NG", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "NGN", legalEntitySuffixes: ["ltd", "plc", "limited"], confidence: 62 },
  { countryCode: "AT", regionCode: "EUR", locales: ["de-AT", "en-AT"], primaryLocale: "de-AT", languages: ["de", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["gmbh", "ag", "kg", "e u"], confidence: 66 },
  { countryCode: "BE", regionCode: "EUR", locales: ["nl-BE", "fr-BE", "en-BE"], primaryLocale: "nl-BE", languages: ["nl", "fr", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["nv", "sa", "bv", "sprl"], confidence: 66 },
  { countryCode: "NL", regionCode: "EUR", locales: ["nl-NL", "en-NL"], primaryLocale: "nl-NL", languages: ["nl", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["bv", "nv", "vof", "stichting"], confidence: 68 },
  { countryCode: "SE", regionCode: "EUR", locales: ["sv-SE", "en-SE"], primaryLocale: "sv-SE", languages: ["sv", "en"], dateOrder: "ymd", decimalSeparator: ",", groupingSeparator: " ", defaultCurrency: "SEK", legalEntitySuffixes: ["ab", "hb", "ek for"], confidence: 66 },
  { countryCode: "NO", regionCode: "EUR", locales: ["nb-NO", "en-NO"], primaryLocale: "nb-NO", languages: ["nb", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: " ", defaultCurrency: "NOK", legalEntitySuffixes: ["as", "asa", "nuf"], confidence: 66 },
  { countryCode: "DK", regionCode: "EUR", locales: ["da-DK", "en-DK"], primaryLocale: "da-DK", languages: ["da", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "DKK", legalEntitySuffixes: ["aps", "as", "a s"], confidence: 66 },
  { countryCode: "PL", regionCode: "EUR", locales: ["pl-PL", "en-PL"], primaryLocale: "pl-PL", languages: ["pl", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: " ", defaultCurrency: "PLN", legalEntitySuffixes: ["sp z oo", "sa", "sp k", "sp j"], confidence: 66 },
  { countryCode: "GR", regionCode: "EUR", locales: ["el-GR", "en-GR"], primaryLocale: "el-GR", languages: ["el", "en"], dateOrder: "dmy", decimalSeparator: ",", groupingSeparator: ".", defaultCurrency: "EUR", legalEntitySuffixes: ["ae", "epe", "ike", "oe"], confidence: 64 },
  { countryCode: "MO", regionCode: "EAS", locales: ["zh-MO", "pt-MO", "en-MO"], primaryLocale: "zh-MO", languages: ["zh", "pt", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "MOP", legalEntitySuffixes: ["ltd", "limited", "sa"], confidence: 62 },
  { countryCode: "GU", regionCode: "OCE", locales: ["en-GU"], primaryLocale: "en-GU", languages: ["en"], dateOrder: "mdy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "USD", legalEntitySuffixes: ["inc", "llc", "corp"], confidence: 60 },
  { countryCode: "FJ", regionCode: "OCE", locales: ["en-FJ", "fj-FJ"], primaryLocale: "en-FJ", languages: ["en", "fj"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "FJD", legalEntitySuffixes: ["ltd", "pte", "inc"], confidence: 58 },
  { countryCode: "GH", regionCode: "AFR", locales: ["en-GH"], primaryLocale: "en-GH", languages: ["en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "GHS", legalEntitySuffixes: ["ltd", "plc", "co"], confidence: 58 },
  { countryCode: "TZ", regionCode: "AFR", locales: ["sw-TZ", "en-TZ"], primaryLocale: "sw-TZ", languages: ["sw", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "TZS", legalEntitySuffixes: ["ltd", "plc", "co"], confidence: 58 },
  { countryCode: "LK", regionCode: "SAS", locales: ["si-LK", "ta-LK", "en-LK"], primaryLocale: "en-LK", languages: ["si", "ta", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "LKR", legalEntitySuffixes: ["pvt ltd", "plc", "ltd"], confidence: 58 },
  { countryCode: "KR", regionCode: "EAS", locales: ["ko-KR", "en-KR"], primaryLocale: "ko-KR", languages: ["ko", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "KRW", legalEntitySuffixes: ["co ltd", "corp", "inc", "주식회사"], confidence: 82 },
  { countryCode: "CN", regionCode: "EAS", locales: ["zh-CN", "en-CN"], primaryLocale: "zh-CN", languages: ["zh", "en"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "CNY", legalEntitySuffixes: ["有限公司", "co ltd", "limited"], confidence: 78 },
  { countryCode: "KH", regionCode: "SEA", locales: ["km-KH", "en-KH"], primaryLocale: "km-KH", languages: ["km", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "KHR", legalEntitySuffixes: ["co ltd", "plc"], confidence: 72 },
  { countryCode: "MM", regionCode: "SEA", locales: ["my-MM", "en-MM"], primaryLocale: "en-MM", languages: ["my", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "MMK", legalEntitySuffixes: ["co ltd", "ltd"], confidence: 70 },
  { countryCode: "BN", regionCode: "SEA", locales: ["ms-BN", "en-BN"], primaryLocale: "en-BN", languages: ["ms", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "BND", legalEntitySuffixes: ["sdn bhd", "bhd", "ltd"], confidence: 72 },
  { countryCode: "LA", regionCode: "SEA", locales: ["lo-LA", "en-LA"], primaryLocale: "lo-LA", languages: ["lo", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "LAK", legalEntitySuffixes: ["co ltd", "sole", "public"], confidence: 68 },
  { countryCode: "CA", regionCode: "NAM", locales: ["en-CA", "fr-CA"], primaryLocale: "en-CA", languages: ["en", "fr"], dateOrder: "ymd", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "CAD", legalEntitySuffixes: ["inc", "corp", "ltd", "ulc"], confidence: 84 },
  { countryCode: "SA", regionCode: "MEA", locales: ["ar-SA", "en-SA"], primaryLocale: "ar-SA", languages: ["ar", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "SAR", legalEntitySuffixes: ["llc", "est", "co"], confidence: 78 },
  { countryCode: "QA", regionCode: "MEA", locales: ["ar-QA", "en-QA"], primaryLocale: "en-QA", languages: ["ar", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "QAR", legalEntitySuffixes: ["llc", "wll", "est"], confidence: 74 },
  { countryCode: "KW", regionCode: "MEA", locales: ["ar-KW", "en-KW"], primaryLocale: "en-KW", languages: ["ar", "en"], dateOrder: "dmy", decimalSeparator: ".", groupingSeparator: ",", defaultCurrency: "KWD", legalEntitySuffixes: ["wll", "k s c", "co"], confidence: 74 },
];

const getRegionalProfile = (countryCode: string | null | undefined) =>
  regionalProfiles.find((profile) => profile.countryCode === countryCode) ?? null;

const emptyParsingContext = {
  primaryLocale: null,
  dateOrder: "unknown" as const,
  decimalSeparator: null,
  groupingSeparator: null,
  languages: [] as string[],
  legalEntitySuffixes: [] as string[],
  parsingProfileConfidence: 0,
};

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCompactText = (value: unknown) => normalizeText(value).replace(/\s+/g, "");

type AliasMatchMode = "boundary" | "compact";

const findAliasMatch = (text: string, alias: string): AliasMatchMode | null => {
  const normalizedAlias = normalizeText(alias);
  if (!normalizedAlias) return null;
  const escapedAlias = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:^|\\s)${escapedAlias}(?=$|\\s)`, "u").test(text)) return "boundary";
  const compactAlias = normalizedAlias.replace(/\s+/g, "");
  if (!/\s/.test(text) && compactAlias.length >= 6 && normalizeCompactText(text).includes(compactAlias)) return "compact";
  return null;
};

const matchesAlias = (text: string, alias: string) => Boolean(findAliasMatch(text, alias));

export const resolveTransactionContext = (params: {
  institution?: string | null;
  accountName?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  currency?: string | null;
}): TransactionContext => {
  const text = [params.institution, params.accountName, params.merchantRaw, params.merchantClean, params.description]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
  const explicitCurrency = String(params.currency ?? "").trim().toUpperCase() || null;
  const matches = entries
    .map((entry) => ({
      entry,
      aliasMatch: entry.aliases
        .map((candidate) => ({ alias: candidate, mode: findAliasMatch(text, candidate) }))
        .sort((left, right) => right.alias.length - left.alias.length)
        .find((candidate): candidate is { alias: string; mode: AliasMatchMode } => Boolean(candidate.mode)),
    }))
    .filter((match): match is { entry: ContextEntry; aliasMatch: { alias: string; mode: AliasMatchMode } } => {
      if (!match.aliasMatch) return false;
      return !(match.entry.negativeAliases ?? []).some((alias) => matchesAlias(text, alias));
    })
    .sort((left, right) => {
      const lengthDifference = right.aliasMatch.alias.length - left.aliasMatch.alias.length;
      return lengthDifference !== 0 ? lengthDifference : right.entry.confidence - left.entry.confidence;
    });

  if (matches.length === 0) {
    return {
      corpusVersion: CONTEXT_CORPUS_VERSION,
      countryCode: null,
      regionCode: null,
      paymentRail: null,
      institutionType: null,
      currency: explicitCurrency,
      categoryHint: null,
      transactionTypeHint: null,
      counterpartyType: null,
      purposeHint: null,
      ...emptyParsingContext,
      travelLikely: false,
      foreignCurrencyLikely: false,
      contextStatus: "unmatched",
      coverageTier: explicitCurrency ? "currency_only" : "none",
      matchedEntryIds: [],
      matchedAliases: [],
      fieldConfidence: { countryCode: 0, regionCode: 0, paymentRail: 0, institutionType: 0, currency: explicitCurrency ? 55 : 0, categoryHint: 0, transactionTypeHint: 0, counterpartyType: 0, purposeHint: 0 },
      signals: explicitCurrency ? [{ id: "explicit-currency", kind: "currency", value: explicitCurrency, confidence: 55, evidence: `currency:${explicitCurrency}`, source: "curated", reviewStatus: "active" }] : [],
      confidence: explicitCurrency ? 55 : 0,
      evidence: explicitCurrency ? [`currency:${explicitCurrency}`] : [],
    };
  }

  const matched = matches[0].entry;
  const strongestMatches = matches.filter(({ entry }) => entry.confidence >= matched.confidence - 8);
  const distinctCountries = new Set(strongestMatches.map(({ entry }) => entry.countryCode).filter((value) => value !== "GLOBAL"));
  const distinctRails = new Set(strongestMatches.map(({ entry }) => entry.paymentRail).filter(Boolean));
  const ambiguous = distinctCountries.size > 1 || distinctRails.size > 1;
  const evidence = strongestMatches.map(({ aliasMatch }) => `alias:${aliasMatch.alias}${aliasMatch.mode === "compact" ? ":compact" : ""}`);
  const signals: ContextSignal[] = strongestMatches.map(({ entry, aliasMatch }) => ({
    id: entry.id,
    kind: entry.signalKind ?? "merchant",
    value: entry.paymentRail ?? entry.categoryHint ?? entry.id,
    confidence: entry.confidence,
    evidence: `alias:${aliasMatch.alias}${aliasMatch.mode === "compact" ? ":compact" : ""}`,
    source: entry.source ?? "curated",
    reviewStatus: entry.reviewStatus ?? "active",
  }));
  if (explicitCurrency) {
    evidence.push(`currency:${explicitCurrency}`);
    signals.push({ id: "explicit-currency", kind: "currency", value: explicitCurrency, confidence: 65, evidence: `currency:${explicitCurrency}`, source: "curated", reviewStatus: "active" });
  }
  const sameCurrency = !explicitCurrency || !matched.currency || explicitCurrency === matched.currency;
  const resolvedCountry = ambiguous || matched.countryCode === "GLOBAL" ? null : matched.countryCode;
  const resolvedRegion = ambiguous || matched.regionCode === "GLOBAL" ? null : matched.regionCode;
  const resolvedRail = ambiguous ? null : matched.paymentRail ?? null;
  const resolvedCategory = ambiguous ? null : matched.categoryHint ?? null;
  const resolvedType = ambiguous ? null : matched.transactionTypeHint ?? null;
  const resolvedCounterparty = ambiguous ? null : matched.counterpartyType ?? null;
  const resolvedPurpose = ambiguous ? null : matched.purposeHint ?? null;
  const baseConfidence = ambiguous ? Math.min(74, matched.confidence) : matched.confidence;
  const parsingProfile = getRegionalProfile(resolvedCountry);
  const coverageTier = strongestMatches.some(({ entry }) => entry.coverage === "descriptor_variant") ? "descriptor_variant" : "canonical";
  return {
    corpusVersion: CONTEXT_CORPUS_VERSION,
    countryCode: resolvedCountry,
    regionCode: resolvedRegion,
    paymentRail: resolvedRail,
    institutionType: matched.institutionType ?? null,
    currency: explicitCurrency ?? matched.currency ?? null,
    categoryHint: resolvedCategory,
    transactionTypeHint: resolvedType,
    counterpartyType: resolvedCounterparty,
    purposeHint: resolvedPurpose,
    primaryLocale: parsingProfile?.primaryLocale ?? null,
    dateOrder: parsingProfile?.dateOrder ?? "unknown",
    decimalSeparator: parsingProfile?.decimalSeparator ?? null,
    groupingSeparator: parsingProfile?.groupingSeparator ?? null,
    languages: parsingProfile?.languages ?? [],
    legalEntitySuffixes: parsingProfile?.legalEntitySuffixes ?? [],
    parsingProfileConfidence: parsingProfile?.confidence ?? 0,
    travelLikely: strongestMatches.some(({ entry }) => entry.travelLikely),
    foreignCurrencyLikely: strongestMatches.some(({ entry }) => entry.foreignCurrencyLikely) || Boolean(explicitCurrency && matched.currency && explicitCurrency !== matched.currency),
    contextStatus: ambiguous ? "ambiguous" : "matched",
    coverageTier,
    matchedEntryIds: strongestMatches.map(({ entry }) => entry.id),
    matchedAliases: strongestMatches.map(({ aliasMatch }) => aliasMatch.alias),
    fieldConfidence: {
      countryCode: resolvedCountry ? baseConfidence : 0,
      regionCode: resolvedRegion ? baseConfidence : 0,
      paymentRail: resolvedRail ? baseConfidence : 0,
      institutionType: matched.institutionType ? baseConfidence : 0,
      currency: explicitCurrency ? (sameCurrency ? 96 : 70) : matched.currency ? 82 : 0,
      categoryHint: resolvedCategory ? baseConfidence : 0,
      transactionTypeHint: resolvedType ? baseConfidence : 0,
      counterpartyType: resolvedCounterparty ? baseConfidence : 0,
      purposeHint: resolvedPurpose ? baseConfidence : 0,
    },
    signals,
    confidence: Math.min(99, baseConfidence + (explicitCurrency && sameCurrency ? 1 : 0)),
    evidence,
  };
};

export const getRegionalParsingProfile = (countryCode?: string | null) => {
  const profile = getRegionalProfile(countryCode);
  return profile ? { ...profile, locales: [...profile.locales], languages: [...profile.languages], legalEntitySuffixes: [...profile.legalEntitySuffixes] } : null;
};

const makeValidUtcDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

export const parseRegionalDateValue = (value: string | null | undefined, countryCode?: string | null) => {
  const profile = getRegionalProfile(countryCode);
  if (!profile || profile.dateOrder === "unknown" || !value) return null;
  const match = String(value).trim().match(/^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/);
  if (!match) return null;
  let first = Number(match[1]);
  let second = Number(match[2]);
  let third = Number(match[3]);
  const year = first >= 1000 ? first : third >= 1000 ? third : third + (third >= 70 ? 1900 : 2000);
  if (first >= 1000) {
    return makeValidUtcDate(year, second, third);
  }
  if (profile.dateOrder === "dmy") return makeValidUtcDate(year, second, first);
  if (profile.dateOrder === "mdy") return makeValidUtcDate(year, first, second);
  return makeValidUtcDate(year, first, second);
};

export const parseRegionalAmountValue = (value: string | number | null | undefined, countryCode?: string | null) => {
  const profile = getRegionalProfile(countryCode);
  if (!profile || value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value).trim();
  const negative = /^\s*-/.test(raw) || /^\s*\(/.test(raw);
  let cleaned = raw.replace(/\u00a0/g, " ").replace(/[^0-9,\.\s]/g, "").replace(/\s+/g, "");
  if (!cleaned) return null;
  if (profile.decimalSeparator === ",") {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
};

export const deriveTravelEpisodes = (rows: Array<{
  date?: string | null;
  merchantRaw?: string | null;
  merchantClean?: string | null;
  description?: string | null;
  currency?: string | null;
}>): Map<number, TravelEpisodeContext> => {
  const candidates = rows
    .map((row, index) => ({ row, index, context: resolveTransactionContext(row), date: new Date(String(row.date ?? "")) }))
    .filter(({ context, date }) => context.travelLikely && !Number.isNaN(date.getTime()))
    .sort((left, right) => left.date.getTime() - right.date.getTime());
  const groups: Array<typeof candidates> = [];
  for (const candidate of candidates) {
    const previous = groups.at(-1)?.at(-1);
    const daysSincePrevious = previous ? (candidate.date.getTime() - previous.date.getTime()) / 86_400_000 : Infinity;
    if (!previous || daysSincePrevious <= 5) {
      if (groups.length === 0) groups.push([]);
      groups.at(-1)!.push(candidate);
    } else {
      groups.push([candidate]);
    }
  }

  const result = new Map<number, TravelEpisodeContext>();
  groups.forEach((group, groupIndex) => {
    const startDate = group[0]!.date.toISOString().slice(0, 10);
    const endDate = group.at(-1)!.date.toISOString().slice(0, 10);
    const countries = [...new Set(group.map(({ context }) => context.countryCode).filter((value): value is string => Boolean(value)))];
    const currencies = [...new Set(group.map(({ row }) => String(row.currency ?? "").trim().toUpperCase()).filter(Boolean))];
    const episode: TravelEpisodeContext = {
      episodeId: `travel-${startDate}-${groupIndex + 1}`,
      startDate,
      endDate,
      countries,
      currencies,
      transactionCount: group.length,
      confidence: Math.min(92, 68 + group.length * 6),
      evidence: [...new Set(group.flatMap(({ context }) => context.evidence.map((value) => `travel:${value}`)))],
    };
    group.forEach(({ index }) => result.set(index, episode));
  });
  return result;
};

export const getContextCorpusEntries = () => entries.map((entry) => ({
  ...entry,
  aliases: [...entry.aliases],
  negativeAliases: [...(entry.negativeAliases ?? [])],
  source: entry.source ?? "curated",
  reviewStatus: entry.reviewStatus ?? "active",
}));

export const getContextCorpusQualityReport = () => {
  const ids = entries.map((entry) => entry.id);
  const aliasOwners = new Map<string, string[]>();
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizeText(alias);
      const owners = aliasOwners.get(normalizedAlias) ?? [];
      owners.push(entry.id);
      aliasOwners.set(normalizedAlias, owners);
    }
  }
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const duplicateAliases = [...aliasOwners.entries()]
    .filter(([, owners]) => new Set(owners).size > 1)
    .map(([alias]) => alias);
  const invalidEntries = entries.filter((entry) =>
    !entry.id ||
    entry.aliases.length === 0 ||
    entry.aliases.some((alias) => !normalizeText(alias)) ||
    entry.confidence < 0 ||
    entry.confidence > 100
  );
  const profileCodes = regionalProfiles.map((profile) => profile.countryCode);
  const duplicateProfiles = profileCodes.filter((code, index) => profileCodes.indexOf(code) !== index);
  return {
    entryCount: entries.length,
    profileCount: regionalProfiles.length,
    duplicateIds: [...new Set(duplicateIds)],
    duplicateAliases: [...new Set(duplicateAliases)],
    invalidEntryIds: invalidEntries.map((entry) => entry.id),
    duplicateProfiles: [...new Set(duplicateProfiles)],
    valid: duplicateIds.length === 0 && duplicateAliases.length === 0 && invalidEntries.length === 0 && duplicateProfiles.length === 0,
  };
};

export const getContextCorpusCoverageReport = () => {
  const quality = getContextCorpusQualityReport();
  const countBy = (values: Array<string | null | undefined>) =>
    values.reduce<Record<string, number>>((counts, value) => {
      if (value) counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  const countryPurposeCounts = entries.reduce<Record<string, Record<string, number>>>((counts, entry) => {
    if (!entry.purposeHint) return counts;
    const purposes = counts[entry.countryCode] ?? {};
    purposes[entry.purposeHint] = (purposes[entry.purposeHint] ?? 0) + 1;
    counts[entry.countryCode] = purposes;
    return counts;
  }, {});
  const purposeHintCounts = countBy(entries.map((entry) => entry.purposeHint));
  const signalKindCounts = countBy(entries.map((entry) => entry.signalKind));
  const classifyAliasScript = (alias: string) => {
    if (/[\u0E00-\u0E7F]/u.test(alias)) return "thai";
    if (/[\uAC00-\uD7AF]/u.test(alias)) return "hangul";
    if (/[\u3040-\u30FF]/u.test(alias)) return "japanese";
    if (/[\u4E00-\u9FFF]/u.test(alias)) return "han";
    if (/[\u0900-\u097F]/u.test(alias)) return "devanagari";
    if (/[\u0600-\u06FF]/u.test(alias)) return "arabic";
    return "latin_or_other";
  };
  const allAliases = entries.flatMap((entry) => entry.aliases);
  const canonicalEntries = entries.filter((entry) => entry.coverage !== "descriptor_variant");

  return {
    ...quality,
    corpusVersion: CONTEXT_CORPUS_VERSION,
    canonicalEntryCount: canonicalEntries.length,
    descriptorVariantEntryCount: entries.filter((entry) => entry.coverage === "descriptor_variant").length,
    canonicalCountryCounts: countBy(canonicalEntries.map((entry) => entry.countryCode)),
    aliasCount: allAliases.length,
    localizedAliasCount: allAliases.filter((alias) => classifyAliasScript(alias) !== "latin_or_other").length,
    aliasScriptCounts: countBy(allAliases.map(classifyAliasScript)),
    countryCounts: countBy(entries.map((entry) => entry.countryCode)),
    regionCounts: countBy(entries.map((entry) => entry.regionCode)),
    signalKindCounts,
    purposeHintCounts,
    countryPurposeCounts,
    currencies: [...new Set(entries.map((entry) => entry.currency).filter((value): value is string => Boolean(value)))].sort(),
  };
};
