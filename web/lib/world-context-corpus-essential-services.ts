import type { ContextEntry } from "@/lib/context-corpus";

type Seed = [id: string, aliases: [string, string]];
type EssentialPack = [country: string, region: string, currency: string, telecom: Seed, health: Seed, education: Seed];

const essential = (
  pack: EssentialPack,
  seed: Seed,
  categoryHint: string,
  purposeHint: "telecom" | "healthcare" | "education",
  counterpartyType: "telecom_provider" | "healthcare_provider" | "education_provider",
): ContextEntry => ({
  id: `${pack[0].toLowerCase()}-essential-${seed[0]}`,
  aliases: seed[1],
  signalKind: "merchant",
  countryCode: pack[0],
  regionCode: pack[1],
  currency: pack[2],
  categoryHint,
  purposeHint,
  counterpartyType,
  confidence: 80,
});

/**
 * Essential-service depth for markets that previously had only a balanced
 * five-entry pack. Shared carriers and institution names are country-qualified.
 */
const PACKS: EssentialPack[] = [
  // Europe and Central Asia.
  ["AD", "EUR", "EUR", ["andorra-telecom", ["Andorra Telecom billing", "Andorra Telecom mobile"]], ["meritxell", ["Hospital Nostra Senyora Meritxell Andorra", "Meritxell Hospital Andorra"]], ["uda", ["Universitat d Andorra tuition", "University of Andorra education"]]],
  ["AM", "EUR", "AMD", ["team", ["Team Telecom Armenia billing", "Telecom Armenia mobile"]], ["wigmore", ["Wigmore Clinic Armenia", "Wigmore Medical Yerevan"]], ["ysu", ["Yerevan State University Armenia", "Երևանի պետական համալսարան"]]],
  ["AZ", "CAS", "AZN", ["azercell", ["Azercell Azerbaijan billing", "Azercell mobile Azerbaijan"]], ["central-clinic", ["Central Clinic Hospital Baku Azerbaijan", "Mərkəzi Klinika Azerbaijan"]], ["bsu", ["Baku State University Azerbaijan", "Bakı Dövlət Universiteti"]]],
  ["BY", "EUR", "BYN", ["a1", ["A1 Belarus telecom", "A1 Беларусь связь"]], ["republican-clinical", ["Republican Clinical Medical Center Belarus", "Республиканский клинический медцентр Беларусь"]], ["bsu", ["Belarusian State University", "Белорусский государственный университет"]]],
  ["CH", "EUR", "CHF", ["swisscom", ["Swisscom Switzerland billing", "Swisscom Schweiz mobile"]], ["hirslanden", ["Hirslanden Hospital Switzerland", "Klinik Hirslanden Schweiz"]], ["eth", ["ETH Zurich Switzerland tuition", "Eidgenossische Technische Hochschule Zurich"]]],
  ["ES", "EUR", "EUR", ["movistar", ["Movistar Spain telecom", "Movistar Espana factura"]], ["quironsalud", ["Quironsalud Spain hospital", "Quiron Salud Espana"]], ["complutense", ["Universidad Complutense Madrid", "Complutense University Spain"]]],
  ["IE", "EUR", "EUR", ["eir", ["Eir Ireland telecom", "Eir mobile Ireland billing"]], ["mater-private", ["Mater Private Hospital Ireland", "Mater Private Dublin medical"]], ["trinity", ["Trinity College Dublin Ireland", "TCD Ireland tuition"]]],
  ["IS", "EUR", "ISK", ["siminn", ["Siminn Iceland telecom", "Síminn Iceland mobile"]], ["landspitali", ["Landspitali University Hospital Iceland", "Landspítali Iceland medical"]], ["hi", ["University of Iceland tuition", "Háskóli Íslands education"]]],
  ["IT", "EUR", "EUR", ["tim", ["TIM Italy telecom billing", "Telecom Italia mobile"]], ["humanitas", ["Humanitas Hospital Italy", "Humanitas Milano medical"]], ["sapienza", ["Sapienza University Rome Italy", "Sapienza Universita Roma tuition"]]],
  ["LI", "EUR", "CHF", ["fl1", ["Telecom Liechtenstein billing", "FL1 Liechtenstein mobile"]], ["landesspital", ["Liechtensteinisches Landesspital", "Liechtenstein State Hospital"]], ["uni-li", ["University of Liechtenstein tuition", "Universitat Liechtenstein education"]]],
  ["LU", "EUR", "EUR", ["post", ["POST Luxembourg telecom", "POST mobile Luxembourg billing"]], ["hrs", ["Hopitaux Robert Schuman Luxembourg", "HRS Luxembourg hospital"]], ["uni-lu", ["University of Luxembourg tuition", "Universite du Luxembourg education"]]],
  ["MC", "EUR", "EUR", ["monaco-telecom", ["Monaco Telecom billing", "Monaco Telecom mobile"]], ["chpg", ["Princess Grace Hospital Monaco", "Centre Hospitalier Princesse Grace Monaco"]], ["ium", ["International University of Monaco tuition", "IUM Monaco education"]]],
  ["MD", "EUR", "MDL", ["moldcell", ["Moldcell Moldova telecom", "Moldcell mobile Moldova"]], ["medpark", ["Medpark Hospital Moldova", "Medpark Chisinau medical"]], ["usm", ["Moldova State University", "Universitatea de Stat Moldova"]]],
  ["MK", "EUR", "MKD", ["telekom", ["Makedonski Telekom North Macedonia", "Macedonian Telekom billing"]], ["sistina", ["Acibadem Sistina North Macedonia", "Sistina Hospital Skopje"]], ["ukim", ["Ss Cyril Methodius University Skopje", "UKIM North Macedonia tuition"]]],
  ["PT", "EUR", "EUR", ["meo", ["MEO Portugal telecom", "MEO mobile Portugal billing"]], ["cuf", ["CUF Hospital Portugal", "CUF Saude Portugal"]], ["ulisboa", ["University of Lisbon Portugal", "Universidade de Lisboa tuition"]]],
  ["RS", "EUR", "RSD", ["mts", ["Telekom Srbija billing", "MTS Serbia mobile"]], ["bel-medic", ["Acibadem Bel Medic Serbia", "Bel Medic Belgrade hospital"]], ["ub", ["University of Belgrade Serbia", "Univerzitet u Beogradu tuition"]]],
  ["RU", "EUR", "RUB", ["mts", ["MTS Russia telecom", "МТС Россия связь"]], ["medsi", ["Medsi Clinic Russia", "МЕДСИ клиника Россия"]], ["msu", ["Moscow State University Russia", "Московский государственный университет"]]],
  ["SM", "EUR", "EUR", ["tms", ["Telefonia Mobile Sammarinese", "TMS San Marino telecom"]], ["ospedale", ["Ospedale di Stato San Marino", "San Marino State Hospital"]], ["unirsm", ["University of San Marino", "Universita San Marino tuition"]]],
  ["TR", "EUR", "TRY", ["turkcell", ["Turkcell Turkey billing", "Turkcell Türkiye mobile"]], ["acibadem", ["Acibadem Healthcare Turkey", "Acibadem Hastanesi Türkiye"]], ["istanbul", ["Istanbul University Turkey", "İstanbul Üniversitesi tuition"]]],
  ["UA", "EUR", "UAH", ["kyivstar", ["Kyivstar Ukraine telecom", "Київстар Україна звязок"]], ["dobrobut", ["Dobrobut Medical Network Ukraine", "Добробут клініка Україна"]], ["knu", ["Taras Shevchenko University Kyiv", "Київський національний університет"]]],
  ["XK", "EUR", "EUR", ["ipko", ["IPKO Kosovo telecom", "IPKO Kosove mobile"]], ["american-hospital", ["American Hospital Kosovo", "Spitali Amerikan Kosove"]], ["up", ["University of Pristina Kosovo", "Universiteti Prishtines tuition"]]],
  ["KG", "CAS", "KGS", ["megacom", ["MegaCom Kyrgyzstan telecom", "МегаКом Кыргызстан связь"]], ["national-hospital", ["National Hospital Kyrgyzstan", "Национальный госпиталь Кыргызстан"]], ["knu", ["Kyrgyz National University", "Кыргызский национальный университет"]]],
  ["MN", "CAS", "MNT", ["unitel", ["Unitel Mongolia telecom", "Юнител Монгол mobile"]], ["intermed", ["Intermed Hospital Mongolia", "Интермед эмнэлэг Монгол"]], ["num", ["National University of Mongolia", "Монгол Улсын Их Сургууль"]]],
  ["TM", "CAS", "TMT", ["tmcell", ["Altyn Asyr Telecom Turkmenistan", "TM Cell Turkmenistan mobile"]], ["imc", ["International Medical Center Ashgabat", "Ashgabat International Hospital"]], ["magtymguly", ["Magtymguly State University Turkmenistan", "Magtymguly University Ashgabat"]]],

  // Caribbean and the Americas.
  ["AG", "CAR", "XCD", ["flow", ["Flow Antigua telecom", "Flow Antigua Barbuda mobile"]], ["slbmc", ["Sir Lester Bird Medical Centre Antigua", "SLBMC Antigua hospital"]], ["uwi", ["UWI Five Islands Antigua", "University West Indies Five Islands"]]],
  ["BB", "CAR", "BBD", ["digicel", ["Digicel Barbados telecom", "Digicel mobile Barbados"]], ["qeh", ["Queen Elizabeth Hospital Barbados", "QEH Barbados medical"]], ["uwi", ["UWI Cave Hill Barbados", "University West Indies Cave Hill"]]],
  ["BS", "CAR", "BSD", ["btc", ["BTC Bahamas telecom", "Bahamas Telecommunications billing"]], ["doctors", ["Doctors Hospital Bahamas", "Doctors Hospital Nassau"]], ["ub", ["University of The Bahamas tuition", "UB Bahamas education"]]],
  ["BZ", "CAR", "BZD", ["digi", ["Digi Belize telecom", "DigiCell Belize mobile"]], ["bhp", ["Belize Healthcare Partners", "BHP Belize hospital"]], ["ub", ["University of Belize tuition", "UB Belize education"]]],
  ["CU", "CAR", "CUP", ["etecsa", ["ETECSA Cuba telecom", "ETECSA Cuba mobile"]], ["ameijeiras", ["Hospital Hermanos Ameijeiras Cuba", "Hermanos Ameijeiras Havana"]], ["uh", ["University of Havana Cuba", "Universidad de La Habana tuition"]]],
  ["DM", "CAR", "XCD", ["flow", ["Flow Dominica telecom", "Flow mobile Dominica"]], ["dcfh", ["Dominica China Friendship Hospital", "DCFH Dominica medical"]], ["dsc", ["Dominica State College tuition", "DSC Dominica education"]]],
  ["GD", "CAR", "XCD", ["flow", ["Flow Grenada telecom", "Flow mobile Grenada"]], ["general-hospital", ["Grenada General Hospital", "St Georges General Hospital Grenada"]], ["sgu", ["St Georges University Grenada", "SGU Grenada tuition"]]],
  ["GY", "CAR", "GYD", ["gtt", ["GTT Guyana telecom", "Guyana Telephone Telegraph billing"]], ["woodlands", ["Woodlands Hospital Guyana", "Woodlands Georgetown medical"]], ["ug", ["University of Guyana tuition", "UG Guyana education"]]],
  ["JM", "CAR", "JMD", ["flow", ["Flow Jamaica telecom", "Flow mobile Jamaica"]], ["andrews", ["Andrews Memorial Hospital Jamaica", "Andrews Hospital Kingston"]], ["uwi", ["UWI Mona Jamaica", "University West Indies Mona"]]],
  ["KN", "CAR", "XCD", ["flow", ["Flow St Kitts Nevis telecom", "Flow mobile St Kitts"]], ["jnf", ["JNF General Hospital St Kitts", "Joseph N France Hospital"]], ["ross", ["Ross University St Kitts", "Ross Veterinary University St Kitts"]]],
  ["LC", "CAR", "XCD", ["flow", ["Flow Saint Lucia telecom", "Flow mobile St Lucia"]], ["okeu", ["Owen King EU Hospital Saint Lucia", "OKEU Hospital St Lucia"]], ["salcc", ["Sir Arthur Lewis Community College", "SALCC Saint Lucia tuition"]]],
  ["NI", "LATAM", "NIO", ["tigo", ["Tigo Nicaragua telecom", "Tigo mobile Nicaragua"]], ["vivian-pellas", ["Hospital Vivian Pellas Nicaragua", "Vivian Pellas Managua medical"]], ["unan", ["UNAN Managua Nicaragua", "Universidad Nacional Autonoma Nicaragua"]]],
  ["SR", "CAR", "SRD", ["telesur", ["Telesur Suriname telecom", "Telesur mobile Suriname"]], ["azp", ["Academic Hospital Paramaribo Suriname", "Academisch Ziekenhuis Paramaribo"]], ["adek", ["Anton de Kom University Suriname", "Universiteit van Suriname tuition"]]],
  ["TT", "CAR", "TTD", ["bmobile", ["bmobile Trinidad Tobago telecom", "TSTT bmobile Trinidad"]], ["st-clair", ["St Clair Medical Centre Trinidad", "St Clair Medical Trinidad Tobago"]], ["uwi", ["UWI St Augustine Trinidad", "University West Indies St Augustine"]]],
  ["VC", "CAR", "XCD", ["digicel", ["Digicel Saint Vincent Grenadines", "Digicel mobile SVG"]], ["milton-cato", ["Milton Cato Memorial Hospital", "MCMH Saint Vincent"]], ["svgcc", ["St Vincent Community College", "SVGCC tuition Saint Vincent"]]],
  ["VE", "LATAM", "VES", ["movistar", ["Movistar Venezuela telecom", "Movistar Venezuela factura"]], ["clinica-metropolitana", ["Clinica Metropolitana Caracas", "Metropolitan Clinic Venezuela"]], ["ucv", ["Universidad Central de Venezuela", "UCV Venezuela tuition"]]],

  // Africa and the Middle East.
  ["AF", "SAS", "AFN", ["awcc", ["Afghan Wireless Afghanistan", "AWCC Afghanistan telecom"]], ["fmic", ["French Medical Institute Kabul", "FMIC Afghanistan hospital"]], ["ku", ["Kabul University Afghanistan", "پوهنتون کابل افغانستان"]]],
  ["BF", "AFR", "XOF", ["orange", ["Orange Burkina Faso telecom", "Orange Burkina mobile"]], ["sandof", ["Clinique Sandof Burkina Faso", "Sandof Medical Ouagadougou"]], ["ujkz", ["Joseph Ki Zerbo University Burkina", "Universite Ouagadougou Burkina Faso"]]],
  ["BI", "AFR", "BIF", ["lumitel", ["Lumitel Burundi telecom", "Lumitel mobile Burundi"]], ["kira", ["Kira Hospital Burundi", "Kira Hospital Bujumbura"]], ["ub", ["University of Burundi tuition", "Universite du Burundi education"]]],
  ["CF", "AFR", "XAF", ["telecel", ["Telecel Central African Republic", "Telecel Centrafrique mobile"]], ["amitie", ["Hopital de l Amitie Bangui", "Amitie Hospital Centrafrique"]], ["ub", ["University of Bangui Central African Republic", "Universite de Bangui tuition"]]],
  ["CG", "AFR", "XAF", ["mtn", ["MTN Congo Brazzaville telecom", "MTN Republic Congo mobile"]], ["guenin", ["Clinique Guenin Congo Brazzaville", "Guenin Medical Brazzaville"]], ["umng", ["Marien Ngouabi University Congo", "Universite Marien Ngouabi tuition"]]],
  ["DJ", "AFR", "DJF", ["djibouti-telecom", ["Djibouti Telecom billing", "Djibouti Telecom mobile"]], ["al-rahma", ["Al Rahma Hospital Djibouti", "Rahma Medical Djibouti"]], ["ud", ["University of Djibouti tuition", "Universite de Djibouti education"]]],
  ["ER", "AFR", "ERN", ["eritel", ["EriTel Eritrea telecom", "Eritrean Telecommunication Services"]], ["orotta", ["Orotta Hospital Eritrea", "Orotta Medical Asmara"]], ["uoa", ["University of Asmara Eritrea", "Asmara University education"]]],
  ["GM", "AFR", "GMD", ["africell", ["Africell Gambia telecom", "Africell mobile Gambia"]], ["medicare", ["Medicare Clinic Gambia", "Medicare Banjul medical"]], ["utg", ["University of The Gambia", "UTG Gambia tuition"]]],
  ["GN", "AFR", "GNF", ["orange", ["Orange Guinea telecom", "Orange Guinee mobile"]], ["ambroise-pare", ["Clinique Ambroise Pare Guinea", "Ambroise Pare Conakry medical"]], ["uganc", ["Gamal Abdel Nasser University Conakry", "Universite Conakry Guinea"]]],
  ["GQ", "AFR", "XAF", ["getesa", ["GETESA Equatorial Guinea telecom", "Orange Getesa Guinea Ecuatorial"]], ["la-paz", ["La Paz Medical Center Bata", "Centro Medico La Paz Equatorial Guinea"]], ["unge", ["National University Equatorial Guinea", "UNGE Guinea Ecuatorial tuition"]]],
  ["GW", "AFR", "XOF", ["orange", ["Orange Guinea Bissau telecom", "Orange Bissau mobile"]], ["simao-mendes", ["Hospital Nacional Simao Mendes", "Simao Mendes Hospital Bissau"]], ["uac", ["Amilcar Cabral University Guinea Bissau", "Universidade Amilcar Cabral tuition"]]],
  ["KM", "AFR", "KMF", ["telma", ["Telma Comoros telecom", "Telma Comores mobile"]], ["el-maarouf", ["El Maarouf Hospital Comoros", "Hopital El Maarouf Moroni"]], ["udc", ["University of Comoros tuition", "Universite des Comores education"]]],
  ["LR", "AFR", "LRD", ["orange", ["Orange Liberia telecom", "Orange mobile Liberia"]], ["elwa", ["ELWA Hospital Liberia", "ELWA Medical Monrovia"]], ["ul", ["University of Liberia tuition", "UL Liberia education"]]],
  ["LS", "AFR", "LSL", ["vodacom", ["Vodacom Lesotho telecom", "Vodacom mobile Lesotho"]], ["maseru-private", ["Maseru Private Hospital Lesotho", "Maseru Private Medical"]], ["nul", ["National University of Lesotho", "NUL Lesotho tuition"]]],
  ["LY", "MEA", "LYD", ["libyana", ["Libyana Libya telecom", "ليبيانا ليبيا اتصالات"]], ["al-khadra", ["Al Khadra Hospital Libya", "مستشفى الخضراء ليبيا"]], ["uot", ["University of Tripoli Libya", "جامعة طرابلس ليبيا"]]],
  ["ML", "AFR", "XOF", ["orange", ["Orange Mali telecom", "Orange mobile Mali"]], ["pasteur", ["Polyclinique Pasteur Bamako Mali", "Pasteur Clinic Mali"]], ["usttb", ["University Sciences Techniques Bamako", "USTTB Mali tuition"]]],
  ["MR", "AFR", "MRU", ["mattel", ["Mattel Mauritania telecom", "Mattel mobile Mauritanie"]], ["chiva", ["Clinique Chiva Mauritania", "Chiva Medical Nouakchott"]], ["una", ["University of Nouakchott Mauritania", "Universite Nouakchott Al Aasriya"]]],
  ["MW", "AFR", "MWK", ["airtel", ["Airtel Malawi telecom", "Airtel mobile Malawi"]], ["mwaiwathu", ["Mwaiwathu Private Hospital Malawi", "Mwaiwathu Blantyre medical"]], ["unima", ["University of Malawi tuition", "UNIMA Malawi education"]]],
  ["MZ", "AFR", "MZN", ["vodacom", ["Vodacom Mozambique telecom", "Vodacom mobile Mocambique"]], ["hpm", ["Hospital Privado de Maputo", "Maputo Private Hospital Mozambique"]], ["uem", ["Eduardo Mondlane University Mozambique", "Universidade Eduardo Mondlane tuition"]]],
  ["NE", "AFR", "XOF", ["airtel", ["Airtel Niger telecom", "Airtel mobile Niger"]], ["gamkalley", ["Clinique Gamkalley Niger", "Gamkalley Medical Niamey"]], ["uam", ["Abdou Moumouni University Niger", "Universite Abdou Moumouni tuition"]]],
  ["PS", "MEA", "ILS", ["jawwal", ["Jawwal Palestine telecom", "جوال فلسطين اتصالات"]], ["arabcare", ["Arabcare Hospital Palestine", "المستشفى العربي التخصصي فلسطين"]], ["birzeit", ["Birzeit University Palestine", "جامعة بيرزيت فلسطين"]]],
  ["SD", "AFR", "SDG", ["zain", ["Zain Sudan telecom", "زين السودان اتصالات"]], ["royal-care", ["Royal Care Hospital Sudan", "مستشفى رويال كير السودان"]], ["uok", ["University of Khartoum Sudan", "جامعة الخرطوم السودان"]]],
  ["SO", "AFR", "SOS", ["hormuud", ["Hormuud Somalia telecom", "Hormuud mobile Somalia"]], ["erdogan", ["Somali Turkey Recep Tayyip Erdogan Hospital", "Erdogan Hospital Mogadishu"]], ["snu", ["Somali National University", "Jaamacadda Ummadda Soomaaliyeed"]]],
  ["SS", "AFR", "SSP", ["mtn", ["MTN South Sudan telecom", "MTN mobile Juba South Sudan"]], ["juba-medical", ["Juba Medical Complex South Sudan", "Juba Medical Hospital"]], ["uoj", ["University of Juba South Sudan", "Juba University tuition"]]],
  ["SY", "MEA", "SYP", ["syriatel", ["Syriatel Syria telecom", "سيريتل سوريا اتصالات"]], ["al-shami", ["Al Shami Hospital Damascus", "مستشفى الشامي دمشق"]], ["du", ["Damascus University Syria", "جامعة دمشق سوريا"]]],
  ["TD", "AFR", "XAF", ["airtel", ["Airtel Chad telecom", "Airtel Tchad mobile"]], ["providence", ["Providence Hospital Chad", "Hopital Providence N Djamena"]], ["und", ["University of N Djamena Chad", "Universite N Djamena Tchad"]]],
  ["YE", "MEA", "YER", ["yemen-mobile", ["Yemen Mobile telecom", "يمن موبايل اتصالات"]], ["saudi-german", ["Saudi German Hospital Sanaa Yemen", "المستشفى السعودي الالماني صنعاء"]], ["sanaa", ["Sanaa University Yemen", "جامعة صنعاء اليمن"]]],

  // Pacific and small island markets.
  ["FJ", "OCE", "FJD", ["vodafone", ["Vodafone Fiji telecom", "Vodafone mobile Fiji"]], ["oceania", ["Oceania Hospitals Fiji", "Oceania Hospital Suva"]], ["usp", ["University of South Pacific Fiji", "USP Fiji tuition"]]],
  ["GU", "OCE", "USD", ["docomo", ["Docomo Pacific Guam telecom", "Docomo Guam mobile"]], ["grmc", ["Guam Regional Medical City", "GRMC Guam hospital"]], ["uog", ["University of Guam tuition", "UOG Guam education"]]],
  ["MO", "EAS", "MOP", ["ctm", ["CTM Macau telecom", "澳門電訊 CTM"]], ["kiang-wu", ["Kiang Wu Hospital Macau", "鏡湖醫院 澳門"]], ["um", ["University of Macau tuition", "澳門大學 education"]]],
  ["FM", "OCE", "USD", ["fsm-telecom", ["FSM Telecom Micronesia", "FSMTC Micronesia billing"]], ["pohnpei-hospital", ["Pohnpei State Hospital Micronesia", "Pohnpei Hospital FSM"]], ["com-fsm", ["College of Micronesia FSM", "COM FSM tuition"]]],
  ["MH", "OCE", "USD", ["nta", ["National Telecommunications Authority Marshall Islands", "NTA Marshall Islands telecom"]], ["majuro-hospital", ["Majuro Hospital Marshall Islands", "Leroij Atama Zedkaia Medical Center"]], ["cmi", ["College of the Marshall Islands", "CMI Marshall Islands tuition"]]],
  ["PW", "OCE", "USD", ["pncc", ["PNCC Palau telecom", "Palau National Communications billing"]], ["belau-hospital", ["Belau National Hospital Palau", "Belau Hospital Koror"]], ["pcc", ["Palau Community College tuition", "PCC Palau education"]]],
  ["SB", "OCE", "SBD", ["our-telekom", ["Our Telekom Solomon Islands", "Solomon Telekom billing"]], ["nrh", ["National Referral Hospital Solomon Islands", "NRH Honiara medical"]], ["sinu", ["Solomon Islands National University", "SINU tuition Solomon Islands"]]],
  ["TO", "OCE", "TOP", ["digicel", ["Digicel Tonga telecom", "Digicel mobile Tonga"]], ["vaiola", ["Vaiola Hospital Tonga", "Vaiola Medical Nuku alofa"]], ["usp", ["University South Pacific Tonga", "USP Tonga campus tuition"]]],
  ["TV", "OCE", "AUD", ["tvt", ["Tuvalu Telecommunications Corporation", "TTC Tuvalu telecom"]], ["pmh", ["Princess Margaret Hospital Tuvalu", "PMH Funafuti medical"]], ["usp", ["University South Pacific Tuvalu", "USP Tuvalu campus tuition"]]],
];

export const WORLD_ESSENTIAL_SERVICE_CONTEXT_ENTRIES: ContextEntry[] = PACKS.flatMap((pack) => [
  essential(pack, pack[3], "Bills & Utilities", "telecom", "telecom_provider"),
  essential(pack, pack[4], "Health & Wellness", "healthcare", "healthcare_provider"),
  essential(pack, pack[5], "Education", "education", "education_provider"),
]);
