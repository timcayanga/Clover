import type { ContextEntry } from "@/lib/context-corpus";

type Seed = [id: string, officialName: string, billingDescriptor: string];
type VerticalPack = [
  countryCode: string,
  regionCode: string,
  currency: string,
  telecom: Seed,
  healthcare: Seed,
  fuel: Seed,
  education: Seed,
];

const entry = (
  pack: VerticalPack,
  seed: Seed,
  categoryHint: string,
  purposeHint: NonNullable<ContextEntry["purposeHint"]>,
  counterpartyType: NonNullable<ContextEntry["counterpartyType"]>,
): ContextEntry => ({
  id: `${pack[0].toLowerCase()}-vertical-${seed[0]}`,
  aliases: [seed[1], seed[2]],
  signalKind: "merchant",
  countryCode: pack[0],
  regionCode: pack[1],
  currency: pack[2],
  categoryHint,
  purposeHint,
  counterpartyType,
  confidence: 78,
});

/**
 * Reviewed purpose-depth signals for markets that already have regional
 * profiles. Shared brands remain explicitly country-qualified so this layer
 * enriches purpose without turning a generic brand mention into geography.
 */
const VERTICAL_PACKS: VerticalPack[] = [
  // Europe.
  ["AT", "EUR", "EUR", ["a1", "A1 Telekom Austria", "A1 telecom Austria"], ["akh", "Allgemeines Krankenhaus Wien", "AKH hospital Austria"], ["omv", "OMV Austria fuel", "OMV station Austria"], ["univie", "Universitat Wien Austria", "University of Vienna Austria"]],
  ["BE", "EUR", "EUR", ["proximus", "Proximus Belgium telecom", "Proximus Belgique billing"], ["uz-leuven", "UZ Leuven Belgium", "University Hospitals Leuven Belgium"], ["q8", "Q8 Belgium fuel", "Q8 station Belgium"], ["ku-leuven", "KU Leuven Belgium", "Katholieke Universiteit Leuven Belgium"]],
  ["NL", "EUR", "EUR", ["kpn", "KPN Netherlands telecom", "KPN Nederland billing"], ["amsterdam-umc", "Amsterdam UMC Netherlands", "Amsterdam university medical center Netherlands"], ["shell", "Shell Netherlands fuel", "Shell Nederland station"], ["uva", "Universiteit van Amsterdam Netherlands", "University of Amsterdam Netherlands"]],
  ["DK", "EUR", "DKK", ["tdc", "TDC Denmark telecom", "TDC Danmark billing"], ["rigshospitalet", "Rigshospitalet Denmark", "Rigshospitalet Copenhagen healthcare"], ["circle-k", "Circle K Denmark fuel", "Circle K Danmark station"], ["ku", "Kobenhavns Universitet Denmark", "University of Copenhagen Denmark"]],
  ["SE", "EUR", "SEK", ["telia", "Telia Sweden telecom", "Telia Sverige billing"], ["karolinska", "Karolinska University Hospital Sweden", "Karolinska sjukhuset Sweden"], ["okq8", "OKQ8 Sweden fuel", "OKQ8 Sverige station"], ["su", "Stockholm University Sweden", "Stockholms universitet Sweden"]],
  ["NO", "EUR", "NOK", ["telenor", "Telenor Norway telecom", "Telenor Norge billing"], ["ous", "Oslo University Hospital Norway", "Oslo universitetssykehus Norway"], ["circle-k", "Circle K Norway fuel", "Circle K Norge station"], ["uio", "University of Oslo Norway", "Universitetet i Oslo Norway"]],
  ["FI", "EUR", "EUR", ["elisa", "Elisa Finland telecom", "Elisa Suomi billing"], ["hus", "HUS Helsinki University Hospital Finland", "HUS healthcare Finland"], ["neste", "Neste Finland fuel", "Neste station Finland"], ["helsinki", "University of Helsinki Finland", "Helsingin yliopisto Finland"]],
  ["PL", "EUR", "PLN", ["orange", "Orange Polska telecom", "Orange Poland billing"], ["luxmed", "Lux Med Poland healthcare", "LuxMed Polska medical"], ["orlen", "Orlen Poland fuel", "Orlen Polska station"], ["uw", "University of Warsaw Poland", "Uniwersytet Warszawski Poland"]],
  ["GR", "EUR", "EUR", ["cosmote", "Cosmote Greece telecom", "Cosmote Greek billing"], ["hygeia", "Hygeia Hospital Greece", "Hygeia healthcare Athens Greece"], ["eko", "EKO Greece fuel", "EKO station Greece"], ["uoa", "National and Kapodistrian University Athens Greece", "University of Athens Greece"]],
  ["EE", "EUR", "EUR", ["telia", "Telia Eesti telecom", "Telia Estonia billing"], ["confido", "Confido Medical Centre Estonia", "Confido healthcare Estonia"], ["circle-k", "Circle K Estonia fuel", "Circle K Eesti station"], ["tartu", "University of Tartu Estonia", "Tartu Ulikool Estonia"]],
  ["LV", "EUR", "EUR", ["lmt", "Latvijas Mobilais Telefons", "LMT Latvia telecom"], ["raus", "Riga East University Hospital Latvia", "Rigas Austrumu hospital Latvia"], ["virsi", "VIRSI Latvia fuel", "Virsi station Latvia"], ["lu", "University of Latvia", "Latvijas Universitate billing"]],
  ["LT", "EUR", "EUR", ["telia", "Telia Lietuva telecom", "Telia Lithuania billing"], ["santaros", "Santaros Clinics Lithuania", "Santaros Klinikos healthcare Lithuania"], ["circle-k", "Circle K Lithuania fuel", "Circle K Lietuva station"], ["vu", "Vilnius University Lithuania", "Vilniaus Universitetas Lithuania"]],
  ["SK", "EUR", "EUR", ["telekom", "Slovak Telekom telecom", "Telekom Slovakia billing"], ["penta", "Penta Hospitals Slovakia", "Penta healthcare Slovakia"], ["slovnaft", "Slovnaft Slovakia fuel", "Slovnaft station Slovakia"], ["comenius", "Comenius University Bratislava", "Univerzita Komenskeho Slovakia"]],
  ["SI", "EUR", "EUR", ["telekom", "Telekom Slovenije", "Telekom Slovenia billing"], ["ukc", "UKC Ljubljana Slovenia", "University Medical Centre Ljubljana Slovenia"], ["petrol", "Petrol Slovenia fuel", "Petrol station Slovenia"], ["ljubljana", "University of Ljubljana Slovenia", "Univerza v Ljubljani Slovenia"]],
  ["HR", "EUR", "EUR", ["ht", "Hrvatski Telekom Croatia", "Croatian Telecom billing"], ["kbc-zagreb", "KBC Zagreb Croatia", "University Hospital Centre Zagreb Croatia"], ["ina", "INA Croatia fuel", "INA station Croatia"], ["zagreb", "University of Zagreb Croatia", "Sveuciliste u Zagrebu Croatia"]],
  ["BG", "EUR", "BGN", ["a1", "A1 Bulgaria telecom", "A1 Bulgarian billing"], ["acibadem", "Acibadem City Clinic Bulgaria", "Acibadem healthcare Bulgaria"], ["lukoil", "Lukoil Bulgaria fuel", "Lukoil station Bulgaria"], ["sofia", "Sofia University Bulgaria", "Sofiyski Universitet Bulgaria"]],
  ["RO", "EUR", "RON", ["orange", "Orange Romania telecom", "Orange Romanian billing"], ["regina-maria", "Regina Maria Romania healthcare", "Reteaua Regina Maria Romania"], ["petrom", "OMV Petrom Romania fuel", "Petrom station Romania"], ["bucharest", "University of Bucharest Romania", "Universitatea din Bucuresti Romania"]],
  ["HU", "EUR", "HUF", ["telekom", "Magyar Telekom Hungary", "Telekom Hungary billing"], ["semmelweis", "Semmelweis University Clinics Hungary", "Semmelweis healthcare Hungary"], ["mol", "MOL Hungary fuel", "MOL station Hungary"], ["elte", "Eotvos Lorand University Hungary", "ELTE Hungary education"]],
  ["CY", "EUR", "EUR", ["cyta", "Cyta Cyprus telecom", "Cyta billing Cyprus"], ["mediterranean", "Mediterranean Hospital Cyprus", "Mediterranean healthcare Cyprus"], ["petrolina", "Petrolina Cyprus fuel", "Petrolina station Cyprus"], ["ucy", "University of Cyprus", "Panepistimio Kyprou education"]],
  ["MT", "EUR", "EUR", ["epic", "Epic Malta telecom", "Epic Communications Malta"], ["mater-dei", "Mater Dei Hospital Malta", "Mater Dei healthcare Malta"], ["enemed", "Enemed Malta fuel", "Enemed station Malta"], ["um", "University of Malta", "L-Universita ta Malta education"]],

  // Latin America and the Caribbean.
  ["MX", "LATAM", "MXN", ["telcel", "Telcel Mexico telecom", "Radiomovil Dipsa Mexico"], ["angeles", "Hospital Angeles Mexico", "Hospitales Angeles Mexico"], ["pemex", "Pemex Mexico fuel", "Pemex station Mexico"], ["unam", "Universidad Nacional Autonoma Mexico", "UNAM Mexico education"]],
  ["PE", "LATAM", "PEN", ["claro", "Claro Peru telecom", "America Movil Peru billing"], ["clinica-internacional", "Clinica Internacional Peru", "Clinica Internacional Lima healthcare"], ["primax", "Primax Peru fuel", "Primax station Peru"], ["pucp", "Pontificia Universidad Catolica Peru", "PUCP Peru education"]],
  ["CO", "LATAM", "COP", ["claro", "Claro Colombia telecom", "Comcel Colombia billing"], ["santa-fe", "Fundacion Santa Fe Bogota", "Hospital Santa Fe Colombia"], ["terpel", "Terpel Colombia fuel", "Organizacion Terpel Colombia"], ["uniandes", "Universidad de los Andes Colombia", "Uniandes Colombia education"]],
  ["CL", "LATAM", "CLP", ["entel", "Entel Chile telecom", "Empresa Nacional Telecomunicaciones Chile"], ["alemana", "Clinica Alemana Chile", "Clinica Alemana Santiago healthcare"], ["copec-depth", "Copec Chile fuel station", "Compania Petroleos Chile"], ["uchile", "Universidad de Chile", "University of Chile education"]],
  ["AR", "LATAM", "ARS", ["movistar", "Movistar Argentina telecom", "Telefonica Moviles Argentina"], ["swiss-medical", "Swiss Medical Argentina healthcare", "Swiss Medical Group Argentina"], ["ypf", "YPF Argentina fuel", "YPF station Argentina"], ["uba", "Universidad de Buenos Aires Argentina", "UBA Argentina education"]],
  ["UY", "LATAM", "UYU", ["antel", "Antel Uruguay telecom", "Administracion Nacional Telecomunicaciones Uruguay"], ["hospital-britanico", "Hospital Britanico Uruguay", "British Hospital Montevideo Uruguay"], ["ancap", "Ancap Uruguay fuel", "Ancap station Uruguay"], ["udelar", "Universidad de la Republica Uruguay", "Udelar Uruguay education"]],
  ["PY", "LATAM", "PYG", ["tigo", "Tigo Paraguay telecom", "Telecel Paraguay billing"], ["migone", "Sanatorio Migone Paraguay", "Migone healthcare Asuncion"], ["petropar", "Petropar Paraguay fuel", "Petropar station Paraguay"], ["una", "Universidad Nacional Asuncion Paraguay", "UNA Paraguay education"]],
  ["BO", "LATAM", "BOB", ["entel", "Entel Bolivia telecom", "Empresa Nacional Telecomunicaciones Bolivia"], ["foianini", "Clinica Foianini Bolivia", "Foianini healthcare Santa Cruz Bolivia"], ["ypfb", "YPFB Bolivia fuel", "YPFB station Bolivia"], ["umsa", "Universidad Mayor San Andres Bolivia", "UMSA Bolivia education"]],
  ["EC", "LATAM", "USD", ["claro", "Claro Ecuador telecom", "Conecel Ecuador billing"], ["metropolitano", "Hospital Metropolitano Ecuador", "Hospital Metropolitano Quito"], ["primax", "Primax Ecuador fuel", "Primax station Ecuador"], ["usfq", "Universidad San Francisco Quito Ecuador", "USFQ Ecuador education"]],
  ["CR", "LATAM", "CRC", ["kolbi", "Kolbi Costa Rica telecom", "ICE Kolbi Costa Rica"], ["biblica", "Hospital Clinica Biblica Costa Rica", "Clinica Biblica San Jose Costa Rica"], ["recope", "Recope Costa Rica fuel", "Refinadora Costarricense Petroleo"], ["ucr", "Universidad de Costa Rica", "UCR Costa Rica education"]],
  ["PA", "LATAM", "PAB", ["tigo", "Tigo Panama telecom", "Millicom Panama billing"], ["punta-pacifica", "Hospital Punta Pacifica Panama", "Punta Pacifica healthcare Panama"], ["terpel", "Terpel Panama fuel", "Terpel station Panama"], ["up", "Universidad de Panama", "University Panama education"]],
  ["GT", "LATAM", "GTQ", ["tigo", "Tigo Guatemala telecom", "Comunicaciones Celulares Guatemala"], ["herrera", "Hospital Herrera Llerandi Guatemala", "Herrera Llerandi healthcare Guatemala"], ["puma", "Puma Energy Guatemala fuel", "Puma station Guatemala"], ["usac", "Universidad San Carlos Guatemala", "USAC Guatemala education"]],
  ["HN", "LATAM", "HNL", ["tigo", "Tigo Honduras telecom", "Celtel Honduras billing"], ["cemesa", "Hospital Cemesa Honduras", "Cemesa healthcare San Pedro Sula"], ["uno", "UNO Honduras fuel", "UNO station Honduras"], ["unah", "Universidad Nacional Autonoma Honduras", "UNAH Honduras education"]],
  ["SV", "LATAM", "USD", ["claro", "Claro El Salvador telecom", "CTE Telecom El Salvador"], ["diagnostico", "Hospital de Diagnostico El Salvador", "Diagnostico healthcare San Salvador"], ["texaco", "Texaco El Salvador fuel", "Texaco station El Salvador"], ["ues", "Universidad de El Salvador", "UES El Salvador education"]],
  ["DO", "CAR", "DOP", ["claro", "Claro Dominicana telecom", "Codetel Dominican Republic billing"], ["homs", "Hospital Metropolitano Santiago Dominican Republic", "HOMS healthcare Dominicana"], ["sunix", "Sunix Dominican Republic fuel", "Sunix station Dominicana"], ["uasd", "Universidad Autonoma Santo Domingo", "UASD Dominican Republic education"]],

  // Africa and the Middle East.
  ["DZ", "MEA", "DZD", ["djezzy", "Djezzy Algeria telecom", "Optimum Telecom Algeria"], ["al-azhar", "Clinique Al Azhar Algeria", "Al Azhar healthcare Algiers"], ["naftal", "Naftal Algeria fuel", "Naftal station Algeria"], ["algiers", "University of Algiers Algeria", "Universite Alger Algeria"]],
  ["TN", "MEA", "TND", ["ooredoo", "Ooredoo Tunisia telecom", "Ooredoo Tunisie billing"], ["taoufik", "Clinique Taoufik Tunisia", "Taoufik healthcare Tunis"], ["agil", "Agil Tunisia fuel", "Agil station Tunisie"], ["tunis", "University of Tunis Tunisia", "Universite Tunis education"]],
  ["EG", "MEA", "EGP", ["vodafone", "Vodafone Egypt telecom", "Vodafone Egyptian billing"], ["cleopatra", "Cleopatra Hospitals Egypt", "Cleopatra healthcare Cairo"], ["misr", "Misr Petroleum Egypt fuel", "Misr station Egypt"], ["cairo", "Cairo University Egypt", "جامعة القاهرة مصر"]],
  ["KE", "AFR", "KES", ["safaricom", "Safaricom Kenya telecom", "Safaricom mobile Kenya"], ["aga-khan", "Aga Khan University Hospital Nairobi", "Aga Khan healthcare Kenya"], ["rubis", "Rubis Kenya fuel", "Rubis station Kenya"], ["uon", "University of Nairobi Kenya", "UON Kenya education"]],
  ["TZ", "AFR", "TZS", ["vodacom", "Vodacom Tanzania telecom", "Vodacom mobile Tanzania"], ["aga-khan", "Aga Khan Hospital Dar es Salaam Tanzania", "Aga Khan healthcare Tanzania"], ["puma", "Puma Energy Tanzania fuel", "Puma station Tanzania"], ["udsm", "University of Dar es Salaam Tanzania", "UDSM Tanzania education"]],
  ["UG", "AFR", "UGX", ["mtn", "MTN Uganda telecom", "MTN mobile Uganda"], ["nakasero", "Nakasero Hospital Uganda", "Nakasero healthcare Kampala"], ["total", "TotalEnergies Uganda fuel", "Total station Uganda"], ["makerere", "Makerere University Uganda", "Makerere Uganda education"]],
  ["RW", "AFR", "RWF", ["mtn", "MTN Rwanda telecom", "MTN mobile Rwanda"], ["king-faisal", "King Faisal Hospital Rwanda", "King Faisal healthcare Kigali"], ["rubis", "Rubis Rwanda fuel", "Rubis station Rwanda"], ["ur", "University of Rwanda", "UR Rwanda education"]],
  ["SN", "AFR", "XOF", ["orange", "Orange Senegal telecom", "Sonatel Senegal billing"], ["principal", "Hopital Principal Dakar Senegal", "Principal healthcare Senegal"], ["elton", "Elton Oil Senegal fuel", "Elton station Senegal"], ["ucad", "Universite Cheikh Anta Diop Senegal", "UCAD Senegal education"]],
  ["CI", "AFR", "XOF", ["orange", "Orange Cote Ivoire telecom", "Orange CI billing"], ["pisam", "Polyclinique Internationale Sainte Anne Marie", "PISAM healthcare Cote Ivoire"], ["vivo", "Vivo Energy Cote Ivoire fuel", "Shell station Cote Ivoire"], ["ufhb", "Universite Felix Houphouet Boigny", "UFHB Cote Ivoire education"]],
  ["ZA", "AFR", "ZAR", ["vodacom", "Vodacom South Africa telecom", "Vodacom mobile South Africa"], ["netcare", "Netcare South Africa healthcare", "Netcare hospital South Africa"], ["engen", "Engen South Africa fuel", "Engen station South Africa"], ["uct", "University of Cape Town South Africa", "UCT South Africa education"]],
  ["ZM", "AFR", "ZMW", ["airtel", "Airtel Zambia telecom", "Airtel mobile Zambia"], ["cfb", "CFB Medical Centre Zambia", "CFB healthcare Lusaka"], ["puma", "Puma Energy Zambia fuel", "Puma station Zambia"], ["unza", "University of Zambia", "UNZA Zambia education"]],
  ["ZW", "AFR", "USD", ["econet", "Econet Zimbabwe telecom", "Econet Wireless Zimbabwe"], ["healthpoint", "Healthpoint Hospital Zimbabwe", "Healthpoint healthcare Harare"], ["zuva", "Zuva Petroleum Zimbabwe fuel", "Zuva station Zimbabwe"], ["uz", "University of Zimbabwe", "UZ Zimbabwe education"]],
  ["GH", "AFR", "GHS", ["mtn", "MTN Ghana telecom", "MTN mobile Ghana"], ["lister", "Lister Hospital Ghana", "Lister healthcare Accra"], ["goil", "GOIL Ghana fuel", "GOIL station Ghana"], ["ug", "University of Ghana", "UG Legon Ghana education"]],
  ["NG", "AFR", "NGN", ["mtn", "MTN Nigeria telecom", "MTN mobile Nigeria"], ["lagoon", "Lagoon Hospitals Nigeria", "Lagoon healthcare Lagos"], ["nnpc", "NNPC Nigeria fuel", "NNPC station Nigeria"], ["unilag", "University of Lagos Nigeria", "UNILAG Nigeria education"]],
  ["MA", "MEA", "MAD", ["inwi", "Inwi Morocco telecom", "Wana Corporate Morocco billing"], ["cheikh-khalifa", "Hopital Universitaire Cheikh Khalifa Morocco", "Cheikh Khalifa healthcare Casablanca"], ["afriquia", "Afriquia Morocco fuel", "Afriquia station Morocco"], ["um6p", "Universite Mohammed VI Polytechnique Morocco", "UM6P Morocco education"]],

  // Asia and Oceania.
  ["JP", "EAS", "JPY", ["docomo", "NTT Docomo Japan telecom", "Docomo mobile Japan"], ["st-lukes", "St Lukes International Hospital Japan", "聖路加国際病院 日本"], ["eneos", "ENEOS Japan fuel", "ENEOS service station Japan"], ["utokyo", "University of Tokyo Japan", "東京大学 日本"]],
  ["KR", "EAS", "KRW", ["skt", "SK Telecom Korea", "SKT mobile South Korea"], ["samsung-medical", "Samsung Medical Center Korea", "삼성서울병원 대한민국"], ["sk-energy", "SK Energy Korea fuel", "SK gas station Korea"], ["snu", "Seoul National University Korea", "서울대학교 대한민국"]],
  ["CN", "EAS", "CNY", ["china-mobile", "China Mobile telecom China", "中国移动 中国"], ["pumch", "Peking Union Medical College Hospital China", "北京协和医院 中国"], ["sinopec", "Sinopec China fuel", "中国石化 加油站"], ["pku", "Peking University China", "北京大学 中国"]],
  ["IN", "SAS", "INR", ["airtel", "Bharti Airtel India telecom", "Airtel mobile India"], ["apollo", "Apollo Hospitals India", "Apollo healthcare India"], ["indian-oil", "Indian Oil India fuel", "IndianOil station India"], ["du", "University of Delhi India", "Delhi University India education"]],
  ["BD", "SAS", "BDT", ["grameenphone", "Grameenphone Bangladesh telecom", "GP mobile Bangladesh"], ["evercare", "Evercare Hospital Dhaka Bangladesh", "Evercare healthcare Bangladesh"], ["padma-oil", "Padma Oil Bangladesh fuel", "Padma station Bangladesh"], ["du", "University of Dhaka Bangladesh", "Dhaka University education Bangladesh"]],
  ["PK", "SAS", "PKR", ["jazz", "Jazz Pakistan telecom", "Pakistan Mobile Communications billing"], ["shifa", "Shifa International Hospital Pakistan", "Shifa healthcare Islamabad"], ["pso", "Pakistan State Oil fuel", "PSO station Pakistan"], ["lums", "Lahore University Management Sciences Pakistan", "LUMS Pakistan education"]],
  ["LK", "SAS", "LKR", ["dialog", "Dialog Sri Lanka telecom", "Dialog Axiata Sri Lanka"], ["asiri", "Asiri Health Sri Lanka", "Asiri hospital Sri Lanka"], ["lanka-ioc", "Lanka IOC Sri Lanka fuel", "LIOC station Sri Lanka"], ["colombo", "University of Colombo Sri Lanka", "Colombo University education Sri Lanka"]],
  ["NP", "SAS", "NPR", ["ncell", "Ncell Nepal telecom", "Ncell Axiata Nepal"], ["grande", "Grande International Hospital Nepal", "Grande healthcare Kathmandu"], ["noc", "Nepal Oil Corporation fuel", "NOC fuel Nepal"], ["tu", "Tribhuvan University Nepal", "TU Nepal education"]],
  ["KZ", "CAS", "KZT", ["beeline", "Beeline Kazakhstan telecom", "Kar Tel Kazakhstan billing"], ["sunkar", "Sunkar Medical Center Kazakhstan", "Sunkar healthcare Almaty"], ["qazaq-oil", "Qazaq Oil Kazakhstan fuel", "Qazaq Oil station Kazakhstan"], ["nu", "Nazarbayev University Kazakhstan", "NU Kazakhstan education"]],
  ["UZ", "CAS", "UZS", ["ucell", "Ucell Uzbekistan telecom", "Coscom Uzbekistan billing"], ["akfa", "Akfa Medline Uzbekistan", "Akfa healthcare Tashkent"], ["ung", "Uzbekneftegaz Uzbekistan fuel", "UNG fuel Uzbekistan"], ["nuu", "National University Uzbekistan", "Ozbekiston Milliy Universiteti"]],
];

export const WORLD_VERTICAL_CONTEXT_ENTRIES: ContextEntry[] = VERTICAL_PACKS.flatMap((pack) => [
  entry(pack, pack[3], "Bills & Utilities", "telecom", "telecom_provider"),
  entry(pack, pack[4], "Health & Wellness", "healthcare", "healthcare_provider"),
  entry(pack, pack[5], "Transport", "fuel", "merchant"),
  entry(pack, pack[6], "Education", "education", "education_provider"),
]);
