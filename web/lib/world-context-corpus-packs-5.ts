import type { ContextEntry, RegionalParsingProfile } from "@/lib/context-corpus";

type Country = { code: string; region: string; currency: string };
type Seed = [id: string, aliases: [string, string]];
type MarketPack = Country & { financial: Seed; bank: Seed; transport: Seed; grocery: Seed; utility: Seed };

const institution = (country: Country, seed: Seed): ContextEntry => ({
  id: `${country.code.toLowerCase()}-coverage-${seed[0]}`,
  aliases: seed[1],
  signalKind: "institution",
  countryCode: country.code,
  regionCode: country.region,
  institutionType: "bank",
  currency: country.currency,
  counterpartyType: "financial_institution",
  confidence: 79,
});

const merchant = (
  country: Country,
  seed: Seed,
  categoryHint: string,
  purposeHint: NonNullable<ContextEntry["purposeHint"]>,
  counterpartyType: NonNullable<ContextEntry["counterpartyType"]>,
): ContextEntry => ({
  id: `${country.code.toLowerCase()}-coverage-${seed[0]}`,
  aliases: seed[1],
  signalKind: purposeHint === "transport" ? "travel" : "merchant",
  countryCode: country.code,
  regionCode: country.region,
  currency: country.currency,
  categoryHint,
  purposeHint,
  counterpartyType,
  travelLikely: purposeHint === "transport",
  confidence: 77,
});

/**
 * Fifth balanced market pack. Aliases include geography or an unambiguous
 * legal name; short local abbreviations are intentionally excluded.
 */
const MARKET_PACKS: MarketPack[] = [
  { code: "AG", region: "CAR", currency: "XCD", financial: ["ecab", ["Eastern Caribbean Amalgamated Bank Antigua", "ECAB Antigua Barbuda"]], bank: ["acb", ["ACB Caribbean Antigua", "Antigua Commercial Bank"]], transport: ["transport-board", ["Antigua Barbuda Transport Board", "ABTB bus Antigua"]], grocery: ["epicurean", ["Epicurean Fine Foods Antigua", "Epicurean supermarket Antigua"]], utility: ["apua", ["Antigua Public Utilities Authority", "APUA Antigua utilities"]] },
  { code: "BI", region: "AFR", currency: "BIF", financial: ["bcb", ["Banque de Credit de Bujumbura", "BCB Burundi bank"]], bank: ["bancobu", ["Banque Commerciale du Burundi", "Bancobu Burundi"]], transport: ["otraco", ["OTRACO Burundi transport", "Office Transport en Commun Burundi"]], grocery: ["chez-sioni", ["Chez Sioni supermarket Burundi", "Chez Sioni Bujumbura grocery"]], utility: ["regideso", ["REGIDESO Burundi utilities", "Regie Eau Electricite Burundi"]] },
  { code: "TD", region: "AFR", currency: "XAF", financial: ["orabank", ["Orabank Chad", "Orabank Tchad"]], bank: ["ecobank", ["Ecobank Chad", "Ecobank Tchad"]], transport: ["sotco", ["SOTCO Chad transport", "SOTCO N Djamena bus"]], grocery: ["modern-market", ["Modern Market N Djamena Chad", "Modern supermarket Chad"]], utility: ["sne", ["Societe Nationale Electricite Chad", "SNE Tchad electricity"]] },
  { code: "CU", region: "CAR", currency: "CUP", financial: ["metropolitano", ["Banco Metropolitano Cuba", "Banmet Cuba"]], bank: ["bandec", ["Banco de Credito y Comercio Cuba", "BANDEC Cuba"]], transport: ["metrobus", ["Metrobus Havana Cuba", "Metrobus La Habana"]], grocery: ["cimex", ["CIMEX Cuba retail", "Tiendas CIMEX Cuba"]], utility: ["une", ["Union Electrica Cuba", "UNE Cuba electricity"]] },
  { code: "DM", region: "CAR", currency: "XCD", financial: ["nbd", ["National Bank of Dominica", "NBD Dominica bank"]], bank: ["republic", ["Republic Bank Dominica", "Republic Bank EC Dominica"]], transport: ["minibus", ["Dominica public minibus", "Roseau minibus Dominica"]], grocery: ["fresh-market", ["Fresh Market Dominica supermarket", "Fresh Market Roseau Dominica"]], utility: ["domlec", ["DOMLEC Dominica electricity", "Dominica Electricity Services"]] },
  { code: "ER", region: "AFR", currency: "ERN", financial: ["commercial-bank", ["Commercial Bank of Eritrea", "CBE Eritrea bank"]], bank: ["housing-commerce", ["Housing and Commerce Bank Eritrea", "HCBE Eritrea"]], transport: ["asmara-bus", ["Asmara public bus Eritrea", "Asmara city bus Eritrea"]], grocery: ["alfa", ["Alfa supermarket Asmara Eritrea", "Alfa market Eritrea"]], utility: ["erec", ["Eritrean Electric Corporation", "Eritrea electricity corporation"]] },
  { code: "GD", region: "CAR", currency: "XCD", financial: ["gcb", ["Grenada Co-operative Bank", "GCB Grenada bank"]], bank: ["republic", ["Republic Bank Grenada", "Republic Bank EC Grenada"]], transport: ["bus", ["Grenada public bus", "St Georges bus Grenada"]], grocery: ["real-value", ["Real Value IGA Grenada", "Real Value supermarket Grenada"]], utility: ["grenlec", ["GRENLEC Grenada electricity", "Grenada Electricity Services"]] },
  { code: "GW", region: "AFR", currency: "XOF", financial: ["ecobank", ["Ecobank Guinea Bissau", "Ecobank Bissau"]], bank: ["bao", ["Banco da Africa Ocidental Guinea Bissau", "BAO Guinea Bissau bank"]], transport: ["toca-toca", ["Toca toca Bissau transport", "Toca toca Guinea Bissau"]], grocery: ["bandim", ["Mercado de Bandim Guinea Bissau", "Bandim market Bissau"]], utility: ["eag-b", ["Electricidade e Aguas Guinea Bissau", "EAGB Bissau utilities"]] },
  { code: "MH", region: "OCE", currency: "USD", financial: ["bomi", ["Bank of Marshall Islands", "BOMI Marshall Islands"]], bank: ["bank-guam", ["Bank of Guam Marshall Islands", "Bank Guam Majuro"]], transport: ["majuro-transit", ["Majuro public transit Marshall Islands", "Majuro bus Marshall Islands"]], grocery: ["payless", ["Payless Supermarket Marshall Islands", "Payless Majuro grocery"]], utility: ["mec", ["Marshalls Energy Company", "MEC Marshall Islands utility"]] },
  { code: "FM", region: "OCE", currency: "USD", financial: ["bank-fsm", ["Bank of the Federated States of Micronesia", "Bank FSM Micronesia"]], bank: ["bank-guam", ["Bank of Guam Micronesia", "Bank Guam FSM"]], transport: ["pohnpei-taxi", ["Pohnpei public taxi Micronesia", "Pohnpei transport FSM"]], grocery: ["palm-terrace", ["Palm Terrace Store Pohnpei", "Palm Terrace supermarket Micronesia"]], utility: ["puc", ["Pohnpei Utilities Corporation", "PUC Micronesia utilities"]] },
  { code: "KN", region: "CAR", currency: "XCD", financial: ["sknanb", ["St Kitts Nevis Anguilla National Bank", "SKNANB St Kitts"]], bank: ["republic", ["Republic Bank St Kitts Nevis", "Republic Bank EC St Kitts"]], transport: ["bus", ["St Kitts public bus", "Basseterre bus St Kitts"]], grocery: ["rams", ["Rams Supermarket St Kitts", "Rams grocery St Kitts Nevis"]], utility: ["skelec", ["SKELEC St Kitts electricity", "St Kitts Electricity Company"]] },
  { code: "LC", region: "CAR", currency: "XCD", financial: ["bosl", ["Bank of Saint Lucia", "BOSL Saint Lucia"]], bank: ["first-national", ["1st National Bank Saint Lucia", "First National Bank St Lucia"]], transport: ["minibus", ["Saint Lucia public minibus", "Castries minibus Saint Lucia"]], grocery: ["massy", ["Massy Stores Saint Lucia", "Massy supermarket St Lucia"]], utility: ["lucelec", ["LUCELEC Saint Lucia electricity", "Saint Lucia Electricity Services"]] },
  { code: "VC", region: "CAR", currency: "XCD", financial: ["bosvg", ["Bank of Saint Vincent and the Grenadines", "BOSVG Saint Vincent"]], bank: ["republic", ["Republic Bank Saint Vincent Grenadines", "Republic Bank EC SVG"]], transport: ["minibus", ["Saint Vincent public minibus", "Kingstown minibus SVG"]], grocery: ["massy", ["Massy Stores Saint Vincent", "Massy supermarket SVG"]], utility: ["vinlec", ["VINLEC Saint Vincent electricity", "St Vincent Electricity Services"]] },
  { code: "SS", region: "AFR", currency: "SSP", financial: ["equity", ["Equity Bank South Sudan", "Equity Bank Juba"]], bank: ["kcb", ["KCB Bank South Sudan", "KCB Juba South Sudan"]], transport: ["boda", ["Boda boda Juba South Sudan", "Boda transport South Sudan"]], grocery: ["phenicia", ["Phenicia Supermarket Juba", "Phenicia grocery South Sudan"]], utility: ["sse", ["South Sudan Electricity Corporation", "SSEC Juba electricity"]] },
  { code: "SY", region: "MEA", currency: "SYP", financial: ["cham", ["Cham Bank Syria", "مصرف الشام سوريا"]], bank: ["bemo", ["Bemo Saudi Fransi Bank Syria", "بنك بيمو السعودي الفرنسي سوريا"]], transport: ["damascus-transit", ["Damascus public transport Syria", "مواصلات دمشق سوريا"]], grocery: ["syrian-trade", ["Syrian Trading Establishment", "السورية للتجارة"]], utility: ["pee", ["Public Establishment for Electricity Syria", "المؤسسة العامة للكهرباء سوريا"]] },
  { code: "TL", region: "SEA", currency: "USD", financial: ["bnctl", ["Banco Nacional Comercio Timor Leste", "BNCTL Timor Leste"]], bank: ["bnu", ["Banco Nacional Ultramarino Timor Leste", "BNU Dili Timor Leste"]], transport: ["mikrolet", ["Mikrolet Dili Timor Leste", "Microlet transport Timor Leste"]], grocery: ["kmanek", ["Kmanek Supermarket Timor Leste", "Kmanek Dili grocery"]], utility: ["edtl", ["Electricidade de Timor Leste", "EDTL Timor Leste electricity"]] },
  { code: "TV", region: "OCE", currency: "AUD", financial: ["nbt", ["National Bank of Tuvalu", "NBT Tuvalu bank"]], bank: ["dbt", ["Development Bank of Tuvalu", "DBT Tuvalu bank"]], transport: ["ferry", ["Tuvalu inter island ferry", "Funafuti ferry Tuvalu"]], grocery: ["filamona", ["Filamona store Tuvalu", "Filamona supermarket Funafuti"]], utility: ["tec", ["Tuvalu Electricity Corporation", "TEC Tuvalu utility"]] },
  { code: "RU", region: "EUR", currency: "RUB", financial: ["sberbank", ["Sberbank Russia", "Сбербанк России"]], bank: ["vtb", ["VTB Bank Russia", "Банк ВТБ Россия"]], transport: ["troika", ["Troika transit card Moscow", "Карта Тройка Москва"]], grocery: ["perekrestok", ["Perekrestok supermarket Russia", "Перекресток Россия"]], utility: ["mosenergosbyt", ["Mosenergosbyt Russia electricity", "Мосэнергосбыт Россия"]] },
];

export const WORLD_CONTEXT_ENTRIES_5: ContextEntry[] = MARKET_PACKS.flatMap((pack) => [
  institution(pack, pack.financial),
  institution(pack, pack.bank),
  merchant(pack, pack.transport, "Transport", "transport", "transport_provider"),
  merchant(pack, pack.grocery, "Groceries", "groceries", "grocer"),
  merchant(pack, pack.utility, "Bills & Utilities", "utilities", "utility_provider"),
]);

const profile = (
  countryCode: string, regionCode: string, locales: string[], languages: string[],
  dateOrder: RegionalParsingProfile["dateOrder"], decimalSeparator: RegionalParsingProfile["decimalSeparator"],
  groupingSeparator: RegionalParsingProfile["groupingSeparator"], defaultCurrency: string, suffixes: string[], confidence = 66,
): RegionalParsingProfile => ({ countryCode, regionCode, locales, primaryLocale: locales[0], languages, dateOrder, decimalSeparator, groupingSeparator, defaultCurrency, legalEntitySuffixes: suffixes, confidence });

export const WORLD_REGIONAL_PROFILES_5: RegionalParsingProfile[] = [
  profile("AG", "CAR", ["en-AG"], ["en"], "dmy", ".", ",", "XCD", ["ltd", "inc", "company"]),
  profile("BI", "AFR", ["fr-BI", "rn-BI"], ["fr", "rn"], "dmy", ",", " ", "BIF", ["sa", "sarl", "sprl"]),
  profile("TD", "AFR", ["fr-TD", "ar-TD"], ["fr", "ar"], "dmy", ",", " ", "XAF", ["sa", "sarl", "societe"]),
  profile("CU", "CAR", ["es-CU"], ["es"], "dmy", ".", ",", "CUP", ["sa", "empresa", "cooperativa"]),
  profile("DM", "CAR", ["en-DM"], ["en"], "dmy", ".", ",", "XCD", ["ltd", "inc", "company"]),
  profile("ER", "AFR", ["ti-ER", "ar-ER", "en-ER"], ["ti", "ar", "en"], "dmy", ".", ",", "ERN", ["share company", "plc", "ltd"]),
  profile("GD", "CAR", ["en-GD"], ["en"], "dmy", ".", ",", "XCD", ["ltd", "inc", "company"]),
  profile("GW", "AFR", ["pt-GW"], ["pt"], "dmy", ",", ".", "XOF", ["sa", "lda", "sociedade"]),
  profile("MH", "OCE", ["en-MH", "mh-MH"], ["en", "mh"], "mdy", ".", ",", "USD", ["inc", "llc", "corp"]),
  profile("FM", "OCE", ["en-FM"], ["en"], "mdy", ".", ",", "USD", ["inc", "llc", "corp"]),
  profile("KN", "CAR", ["en-KN"], ["en"], "dmy", ".", ",", "XCD", ["ltd", "inc", "company"]),
  profile("LC", "CAR", ["en-LC"], ["en"], "dmy", ".", ",", "XCD", ["ltd", "inc", "company"]),
  profile("VC", "CAR", ["en-VC"], ["en"], "dmy", ".", ",", "XCD", ["ltd", "inc", "company"]),
  profile("SS", "AFR", ["en-SS", "ar-SS"], ["en", "ar"], "dmy", ".", ",", "SSP", ["ltd", "plc", "company"]),
  profile("SY", "MEA", ["ar-SY"], ["ar"], "dmy", ".", ",", "SYP", ["ش م م", "sa", "llc"]),
  profile("TL", "SEA", ["pt-TL", "tet-TL"], ["pt", "tet"], "dmy", ",", ".", "USD", ["lda", "sa", "unipessoal"]),
  profile("TV", "OCE", ["en-TV"], ["en"], "dmy", ".", ",", "AUD", ["ltd", "inc", "corporation"]),
  profile("RU", "EUR", ["ru-RU"], ["ru"], "dmy", ",", " ", "RUB", ["ooo", "oao", "pao"]),
];
