import type { ContextEntry } from "@/lib/context-corpus";

type Purpose = "telecom" | "healthcare" | "education";
type Seed = [id: string, aliases: [string, string], purpose: Purpose];
type GapPack = [country: string, region: string, currency: string, seeds: Seed[]];

const entry = (pack: GapPack, seed: Seed): ContextEntry => {
  const metadata = seed[2] === "telecom"
    ? { categoryHint: "Bills & Utilities", counterpartyType: "telecom_provider" as const }
    : seed[2] === "healthcare"
      ? { categoryHint: "Health & Wellness", counterpartyType: "healthcare_provider" as const }
      : { categoryHint: "Education", counterpartyType: "education_provider" as const };
  return {
    id: `${pack[0].toLowerCase()}-essential-gap-${seed[0]}`,
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

/** Completes telecom, healthcare, and education depth for represented markets. */
const GAP_PACKS: GapPack[] = [
  ["PH", "SEA", "PHP", [["globe", ["Globe Telecom Philippines billing", "Globe mobile Philippines"], "telecom"]]],
  ["MY", "SEA", "MYR", [["maxis", ["Maxis Malaysia telecom billing", "Maxis mobile Malaysia"], "telecom"], ["um", ["University of Malaya tuition", "Universiti Malaya education"], "education"]]],
  ["ID", "SEA", "IDR", [["telkomsel", ["Telkomsel Indonesia telecom", "Telkomsel mobile Indonesia billing"], "telecom"], ["ui", ["University of Indonesia tuition", "Universitas Indonesia education"], "education"]]],
  ["TH", "SEA", "THB", [["ais", ["AIS Thailand telecom billing", "Advanced Info Service Thailand mobile"], "telecom"], ["chula", ["Chulalongkorn University Thailand", "จุฬาลงกรณ์มหาวิทยาลัย tuition"], "education"]]],
  ["VN", "SEA", "VND", [["viettel", ["Viettel Vietnam telecom billing", "Viettel mobile Vietnam"], "telecom"], ["vnu", ["Vietnam National University tuition", "Đại học Quốc gia Việt Nam"], "education"]]],
  ["KH", "SEA", "KHR", [["smart", ["Smart Axiata Cambodia telecom", "Smart mobile Cambodia billing"], "telecom"], ["rpph", ["Royal Phnom Penh Hospital Cambodia", "RPPH Cambodia medical"], "healthcare"], ["rupp", ["Royal University Phnom Penh Cambodia", "RUPP Cambodia tuition"], "education"]]],
  ["MM", "SEA", "MMK", [["mytel", ["Mytel Myanmar telecom billing", "Mytel mobile Myanmar"], "telecom"], ["uyangon", ["University of Yangon Myanmar", "Yangon University tuition Myanmar"], "education"]]],
  ["BN", "SEA", "BND", [["ubd", ["Universiti Brunei Darussalam tuition", "University Brunei Darussalam education"], "education"]]],
  ["LA", "SEA", "LAK", [["mahosot", ["Mahosot Hospital Laos", "Mahosot Vientiane medical"], "healthcare"], ["nuol", ["National University of Laos tuition", "NUOL Laos education"], "education"]]],
  ["HK", "EAS", "HKD", [["csl", ["CSL Hong Kong telecom billing", "CSL mobile Hong Kong"], "telecom"], ["hku", ["University of Hong Kong tuition", "香港大學 education"], "education"]]],
  ["TW", "EAS", "TWD", [["cht", ["Chunghwa Telecom Taiwan billing", "中華電信 台灣 mobile"], "telecom"], ["ntu", ["National Taiwan University tuition", "國立臺灣大學 education"], "education"]]],
  ["AE", "MEA", "AED", [["etisalat", ["Etisalat UAE telecom billing", "e and UAE mobile"], "telecom"], ["mediclinic", ["Mediclinic Middle East UAE", "Mediclinic UAE hospital"], "healthcare"], ["uaeu", ["United Arab Emirates University tuition", "UAEU education Al Ain"], "education"]]],
  ["US", "NAM", "USD", [["verizon", ["Verizon Wireless United States", "Verizon US mobile billing"], "telecom"], ["uc", ["University of California tuition", "UC education United States"], "education"]]],
  ["GB", "EUR", "GBP", [["bt", ["BT United Kingdom telecom billing", "British Telecom UK"], "telecom"], ["ucl", ["University College London tuition", "UCL education United Kingdom"], "education"]]],
  ["AU", "OCE", "AUD", [["telstra", ["Telstra Australia telecom", "Telstra mobile Australia billing"], "telecom"], ["usyd", ["University of Sydney Australia", "Sydney University tuition"], "education"]]],
  ["CA", "NAM", "CAD", [["rogers", ["Rogers Canada telecom", "Rogers mobile Canada billing"], "telecom"], ["utoronto", ["University of Toronto tuition", "U of T Canada education"], "education"]]],
  ["SA", "MEA", "SAR", [["stc", ["STC Saudi Arabia telecom", "Saudi Telecom billing"], "telecom"], ["ksu", ["King Saud University Saudi Arabia", "جامعة الملك سعود tuition"], "education"]]],
  ["QA", "MEA", "QAR", [["ooredoo", ["Ooredoo Qatar telecom", "Ooredoo mobile Qatar billing"], "telecom"], ["qu", ["Qatar University tuition", "جامعة قطر education"], "education"]]],
  ["KW", "MEA", "KWD", [["zain", ["Zain Kuwait telecom", "Zain mobile Kuwait billing"], "telecom"], ["ku", ["Kuwait University tuition", "جامعة الكويت education"], "education"]]],
  ["NZ", "OCE", "NZD", [["uoa", ["University of Auckland New Zealand", "Auckland University tuition"], "education"]]],
  ["BR", "LATAM", "BRL", [["vivo", ["Vivo Brazil telecom", "Vivo Brasil mobile billing"], "telecom"], ["usp", ["University of Sao Paulo Brazil", "Universidade de Sao Paulo tuition"], "education"]]],
  ["DE", "EUR", "EUR", [["telekom", ["Deutsche Telekom Germany billing", "Telekom Deutschland mobile"], "telecom"], ["heidelberg", ["Heidelberg University Germany", "Universitat Heidelberg tuition"], "education"]]],
  ["FR", "EUR", "EUR", [["orange", ["Orange mobile France billing", "Orange France telecom invoice"], "telecom"], ["sorbonne", ["Sorbonne University France", "Sorbonne Universite tuition"], "education"]]],
  ["CZ", "EUR", "CZK", [["charles", ["Charles University Czechia", "Univerzita Karlova tuition"], "education"]]],
  ["IL", "MEA", "ILS", [["cellcom", ["Cellcom Israel telecom", "סלקום ישראל billing"], "telecom"], ["huji", ["Hebrew University Jerusalem Israel", "האוניברסיטה העברית tuition"], "education"]]],
  ["JO", "MEA", "JOD", [["uj", ["University of Jordan tuition", "الجامعة الأردنية education"], "education"]]],
  ["OM", "MEA", "OMR", [["squh", ["Sultan Qaboos University Hospital Oman", "مستشفى جامعة السلطان قابوس medical"], "healthcare"], ["squ", ["Sultan Qaboos University Oman", "جامعة السلطان قابوس tuition"], "education"]]],
  ["BH", "MEA", "BHD", [["uob", ["University of Bahrain tuition", "جامعة البحرين education"], "education"]]],
  ["ET", "AFR", "ETB", [["aau", ["Addis Ababa University Ethiopia", "የአዲስ አበባ ዩኒቨርሲቲ tuition"], "education"]]],
  ["MU", "AFR", "MUR", [["myt", ["myt Mauritius telecom", "Mauritius Telecom mobile billing"], "telecom"], ["wellkin", ["Wellkin Hospital Mauritius", "Wellkin Medical Moka"], "healthcare"], ["uom", ["University of Mauritius tuition", "UOM Mauritius education"], "education"]]],
  ["BW", "AFR", "BWP", [["ub", ["University of Botswana tuition", "UB Botswana education"], "education"]]],
  ["BA", "EUR", "BAM", [["unsa", ["University of Sarajevo Bosnia", "Univerzitet u Sarajevu tuition"], "education"]]],
  ["AL", "EUR", "ALL", [["ut", ["University of Tirana Albania", "Universiteti i Tiranes tuition"], "education"]]],
  ["GE", "EUR", "GEL", [["tsu", ["Tbilisi State University Georgia", "თბილისის სახელმწიფო უნივერსიტეტი"], "education"]]],
  ["HT", "CAR", "HTG", [["ueh", ["State University of Haiti", "Universite Etat Haiti tuition"], "education"]]],
  ["AO", "AFR", "AOA", [["uan", ["Agostinho Neto University Angola", "Universidade Agostinho Neto tuition"], "education"]]],
  ["NA", "AFR", "NAD", [["unam", ["University of Namibia tuition", "UNAM Namibia education"], "education"]]],
  ["CM", "AFR", "XAF", [["uy1", ["University of Yaounde Cameroon", "Universite Yaounde tuition"], "education"]]],
  ["GA", "AFR", "XAF", [["uob", ["Omar Bongo University Gabon", "Universite Omar Bongo tuition"], "education"]]],
  ["CD", "AFR", "CDF", [["unikin", ["University of Kinshasa DR Congo", "Universite Kinshasa tuition"], "education"]]],
  ["MG", "AFR", "MGA", [["u-ant", ["University of Antananarivo Madagascar", "Universite Antananarivo tuition"], "education"]]],
  ["SC", "AFR", "SCR", [["unisey", ["University of Seychelles tuition", "UniSey Seychelles education"], "education"]]],
  ["CV", "AFR", "CVE", [["unicv", ["University of Cabo Verde", "Universidade Cabo Verde tuition"], "education"]]],
  ["BJ", "AFR", "XOF", [["uac", ["University Abomey Calavi Benin", "Universite Abomey Calavi tuition"], "education"]]],
  ["TG", "AFR", "XOF", [["ul", ["University of Lome Togo", "Universite de Lome tuition"], "education"]]],
  ["SL", "AFR", "SLE", [["usl", ["University of Sierra Leone", "USL Sierra Leone tuition"], "education"]]],
  ["LB", "MEA", "LBP", [["aub", ["American University of Beirut tuition", "الجامعة الأميركية بيروت education"], "education"]]],
  ["IQ", "MEA", "IQD", [["uob", ["University of Baghdad Iraq", "جامعة بغداد tuition"], "education"]]],
  ["MV", "SAS", "MVR", [["mnu", ["Maldives National University tuition", "MNU Maldives education"], "education"]]],
  ["BT", "SAS", "BTN", [["tashicell", ["TashiCell Bhutan telecom", "Tashi Cell mobile Bhutan"], "telecom"], ["jdw", ["Jigme Dorji Wangchuck Hospital Bhutan", "JDWNRH Bhutan medical"], "healthcare"], ["rub", ["Royal University of Bhutan", "RUB Bhutan tuition"], "education"]]],
  ["PG", "OCE", "PGK", [["upng", ["University of Papua New Guinea", "UPNG tuition Papua New Guinea"], "education"]]],
  ["WS", "OCE", "WST", [["nus", ["National University of Samoa", "NUS Samoa tuition"], "education"]]],
  ["VU", "OCE", "VUV", [["usp", ["University South Pacific Vanuatu", "USP Emalus Vanuatu tuition"], "education"]]],
  ["ME", "EUR", "EUR", [["ucg", ["University of Montenegro", "Univerzitet Crne Gore tuition"], "education"]]],
  ["TJ", "CAS", "TJS", [["tnu", ["Tajik National University", "Донишгоҳи миллии Тоҷикистон"], "education"]]],
  ["IR", "MEA", "IRR", [["mci", ["MCI Iran telecom", "همراه اول ایران billing"], "telecom"], ["pars", ["Pars Hospital Tehran Iran", "بیمارستان پارس تهران"], "healthcare"], ["ut", ["University of Tehran Iran", "دانشگاه تهران tuition"], "education"]]],
  ["SZ", "AFR", "SZL", [["mtn", ["MTN Eswatini telecom", "MTN mobile Eswatini"], "telecom"], ["mbabane-clinic", ["Mbabane Clinic Eswatini", "Mbabane Private Hospital"] , "healthcare"], ["uneswa", ["University of Eswatini tuition", "UNESWA Eswatini education"], "education"]]],
  ["ST", "AFR", "STN", [["cst", ["CST Sao Tome telecom", "Companhia Santomense Telecomunicacoes"], "telecom"], ["ayres", ["Hospital Ayres de Menezes Sao Tome", "Ayres Menezes Hospital"] , "healthcare"], ["ustp", ["University of Sao Tome Principe", "Universidade Sao Tome tuition"], "education"]]],
  ["TL", "SEA", "USD", [["telemor", ["Telemor Timor Leste telecom", "Telemor mobile Dili"], "telecom"], ["hngv", ["Guido Valadares National Hospital", "HNGV Dili Timor Leste"] , "healthcare"], ["untl", ["National University Timor Lorosae", "UNTL Timor Leste tuition"], "education"]]],
];

export const WORLD_ESSENTIAL_GAP_CONTEXT_ENTRIES: ContextEntry[] = GAP_PACKS.flatMap((pack) => pack[3].map((seed) => entry(pack, seed)));
