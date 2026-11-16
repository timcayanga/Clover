import type { ContextEntry } from "@/lib/context-corpus";

type Seed = [id: string, aliases: [string, string]];
type CommercePack = [country: string, region: string, currency: string, insurance: Seed, ecommerce: Seed, dining: Seed];

const context = (
  pack: CommercePack,
  seed: Seed,
  categoryHint: string,
  purposeHint: NonNullable<ContextEntry["purposeHint"]>,
  counterpartyType: NonNullable<ContextEntry["counterpartyType"]>,
): ContextEntry => ({
  id: `${pack[0].toLowerCase()}-commerce-${seed[0]}`,
  aliases: seed[1],
  signalKind: "merchant",
  countryCode: pack[0],
  regionCode: pack[1],
  currency: pack[2],
  categoryHint,
  purposeHint,
  counterpartyType,
  confidence: 77,
});

/**
 * Country-qualified recurring commerce context. Marketplace and delivery
 * aliases deliberately include geography because these services can operate
 * in many markets or leave a market while retaining recognizable branding.
 */
const COMMERCE_PACKS: CommercePack[] = [
  // Europe.
  ["AT", "EUR", "EUR", ["uniqa", ["UNIQA Insurance Austria", "UNIQA Versicherung Osterreich"]], ["shöpping", ["Shoepping Austria marketplace", "shöpping.at Austria ecommerce"]], ["mjam", ["Mjam Austria food delivery", "Mjam Wien delivery"]]],
  ["BE", "EUR", "EUR", ["ag", ["AG Insurance Belgium", "AG Assurances Belgique"]], ["bol", ["Bol.com Belgium ecommerce", "Bol Belgique marketplace"]], ["quick", ["Quick Belgium restaurant", "Quick Belgique dining"]]],
  ["NL", "EUR", "EUR", ["achmea", ["Achmea Insurance Netherlands", "Achmea Nederland verzekering"]], ["bol", ["Bol.com Netherlands ecommerce", "Bol Nederland marketplace"]], ["thuisbezorgd", ["Thuisbezorgd Netherlands", "Thuisbezorgd.nl food delivery"]]],
  ["DK", "EUR", "DKK", ["tryg", ["Tryg Insurance Denmark", "Tryg Forsikring Danmark"]], ["bilka", ["Bilka Denmark ecommerce", "Bilka.dk marketplace Denmark"]], ["just-eat", ["Just Eat Denmark delivery", "JustEat Danmark food"]]],
  ["SE", "EUR", "SEK", ["folksam", ["Folksam Insurance Sweden", "Folksam Forsakring Sverige"]], ["cdon", ["CDON Sweden ecommerce", "CDON Sverige marketplace"]], ["espresso-house", ["Espresso House Sweden dining", "Espresso House Sverige"]]],
  ["NO", "EUR", "NOK", ["gjensidige", ["Gjensidige Insurance Norway", "Gjensidige Forsikring Norge"]], ["komplett", ["Komplett Norway ecommerce", "Komplett.no marketplace"]], ["foodora", ["Foodora Norway delivery", "Foodora Norge food"]]],
  ["FI", "EUR", "EUR", ["op", ["OP Insurance Finland", "Pohjola Insurance Finland"]], ["verkkokauppa", ["Verkkokauppa Finland ecommerce", "Verkkokauppa.com Finland"]], ["hesburger", ["Hesburger Finland dining", "Hesburger Suomi"]]],
  ["PL", "EUR", "PLN", ["pzu", ["PZU Insurance Poland", "PZU Ubezpieczenia Polska"]], ["allegro", ["Allegro Poland ecommerce", "Allegro Polska marketplace"]], ["pyszne", ["Pyszne.pl Poland delivery", "Pyszne Polska food"]]],
  ["GR", "EUR", "EUR", ["ethniki", ["Ethniki Insurance Greece", "Ethniki Asfalistiki Greece"]], ["skroutz", ["Skroutz Greece ecommerce", "Skroutz Greek marketplace"]], ["efood", ["efood Greece delivery", "e-food Greek food delivery"]]],
  ["EE", "EUR", "EUR", ["ergo", ["ERGO Insurance Estonia", "ERGO Kindlustus Estonia"]], ["kaup24", ["Kaup24 Estonia ecommerce", "Kaup24.ee marketplace"]], ["bolt-food", ["Bolt Food Estonia", "Bolt delivery Tallinn Estonia"]]],
  ["LV", "EUR", "EUR", ["balta", ["BALTA Insurance Latvia", "BALTA Apdrosinasana Latvia"]], ["220", ["220.lv Latvia ecommerce", "220 Latvia marketplace"]], ["lido", ["LIDO Latvia restaurant", "LIDO Riga dining"]]],
  ["LT", "EUR", "EUR", ["draudimas", ["Lietuvos Draudimas Insurance", "Lietuvos Draudimas Lithuania"]], ["pigu", ["Pigu.lt Lithuania ecommerce", "Pigu Lithuania marketplace"]], ["cili", ["Cili Pizza Lithuania", "Cili dining Lithuania"]]],
  ["SK", "EUR", "EUR", ["allianz", ["Allianz Insurance Slovakia", "Allianz Slovenska Poistovna"]], ["alza", ["Alza Slovakia ecommerce", "Alza.sk marketplace"]], ["bistro", ["Bistro.sk Slovakia delivery", "Bistro Slovakia food"]]],
  ["SI", "EUR", "EUR", ["triglav", ["Triglav Insurance Slovenia", "Zavarovalnica Triglav Slovenia"]], ["mimovrste", ["Mimovrste Slovenia ecommerce", "Mimovrste.com marketplace"]], ["wolt", ["Wolt Slovenia delivery", "Wolt Ljubljana food"]]],
  ["HR", "EUR", "EUR", ["croatia", ["Croatia Osiguranje Insurance", "Croatia Insurance Croatia"]], ["ekupi", ["eKupi Croatia ecommerce", "eKupi.hr marketplace"]], ["glovo", ["Glovo Croatia delivery", "Glovo Zagreb food"]]],
  ["BG", "EUR", "BGN", ["dzi", ["DZI Insurance Bulgaria", "DZI Obshto Zastrahovane"]], ["emag", ["eMAG Bulgaria ecommerce", "eMAG.bg marketplace"]], ["happy", ["Happy Bar Grill Bulgaria", "Happy restaurant Bulgaria"]]],
  ["RO", "EUR", "RON", ["groupama", ["Groupama Insurance Romania", "Groupama Asigurari Romania"]], ["emag", ["eMAG Romania ecommerce", "eMAG.ro marketplace"]], ["wolt", ["Wolt Romania delivery", "Wolt Bucharest food"]]],
  ["HU", "EUR", "HUF", ["allianz", ["Allianz Insurance Hungary", "Allianz Hungaria Biztosito"]], ["emag", ["eMAG Hungary ecommerce", "eMAG.hu marketplace"]], ["wolt", ["Wolt Hungary delivery", "Wolt Budapest food"]]],
  ["CY", "EUR", "EUR", ["universal-life", ["Universal Life Insurance Cyprus", "Universal Life Cyprus premium"]], ["stephanis", ["Stephanis Cyprus ecommerce", "Stephanis online Cyprus"]], ["foody", ["Foody Cyprus delivery", "Foody Cyprus food"]]],
  ["MT", "EUR", "EUR", ["mapfre", ["MAPFRE Middlesea Insurance Malta", "Middlesea Insurance Malta"]], ["scan", ["Scan Malta ecommerce", "Scan Computers Malta online"]], ["wolt", ["Wolt Malta delivery", "Wolt food Malta"]]],

  // Latin America and the Caribbean.
  ["MX", "LATAM", "MXN", ["gnp", ["GNP Seguros Mexico", "Grupo Nacional Provincial Mexico"]], ["mercado-libre", ["Mercado Libre Mexico ecommerce", "MercadoLibre MX marketplace"]], ["rappi", ["Rappi Mexico delivery", "Rappi MX food"]]],
  ["PE", "LATAM", "PEN", ["rimac", ["Rimac Seguros Peru", "Rimac Insurance Peru"]], ["mercado-libre", ["Mercado Libre Peru ecommerce", "MercadoLibre PE marketplace"]], ["pedidosya", ["PedidosYa Peru delivery", "Pedidos Ya Peru food"]]],
  ["CO", "LATAM", "COP", ["sura", ["Seguros SURA Colombia", "SURA Insurance Colombia"]], ["mercado-libre", ["Mercado Libre Colombia ecommerce", "MercadoLibre CO marketplace"]], ["rappi", ["Rappi Colombia delivery", "Rappi CO food"]]],
  ["CL", "LATAM", "CLP", ["bci", ["BCI Seguros Chile", "BCI Insurance Chile"]], ["falabella", ["Falabella Chile ecommerce", "Falabella.com Chile marketplace"]], ["pedidosya", ["PedidosYa Chile delivery", "Pedidos Ya Chile food"]]],
  ["AR", "LATAM", "ARS", ["la-caja", ["La Caja Seguros Argentina", "La Caja Insurance Argentina"]], ["mercado-libre", ["Mercado Libre Argentina ecommerce", "MercadoLibre AR marketplace"]], ["pedidosya", ["PedidosYa Argentina delivery", "Pedidos Ya Argentina food"]]],
  ["UY", "LATAM", "UYU", ["bse", ["Banco de Seguros Estado Uruguay", "BSE Insurance Uruguay"]], ["mercado-libre", ["Mercado Libre Uruguay ecommerce", "MercadoLibre UY marketplace"]], ["pedidosya", ["PedidosYa Uruguay delivery", "Pedidos Ya Uruguay food"]]],
  ["PY", "LATAM", "PYG", ["mapfre", ["MAPFRE Insurance Paraguay", "MAPFRE Seguros Paraguay"]], ["nube", ["Nube Paraguay ecommerce", "Nube marketplace Paraguay"]], ["pedidosya", ["PedidosYa Paraguay delivery", "Pedidos Ya Paraguay food"]]],
  ["BO", "LATAM", "BOB", ["nacional", ["Nacional Seguros Bolivia", "Nacional Insurance Bolivia"]], ["dismac", ["Dismac Bolivia ecommerce", "Dismac online Bolivia"]], ["yaigo", ["Yaigo Bolivia delivery", "Yaigo food Bolivia"]]],
  ["EC", "LATAM", "USD", ["equinoccial", ["Seguros Equinoccial Ecuador", "Equinoccial Insurance Ecuador"]], ["de-prati", ["De Prati Ecuador ecommerce", "DePrati online Ecuador"]], ["pedidosya", ["PedidosYa Ecuador delivery", "Pedidos Ya Ecuador food"]]],
  ["CR", "LATAM", "CRC", ["ins", ["INS Insurance Costa Rica", "Instituto Nacional Seguros Costa Rica"]], ["unimart", ["Unimart Costa Rica ecommerce", "Unimart online Costa Rica"]], ["uber-eats", ["Uber Eats Costa Rica", "UberEats San Jose Costa Rica"]]],
  ["PA", "LATAM", "PAB", ["assa", ["ASSA Insurance Panama", "ASSA Seguros Panama"]], ["panafoto", ["Panafoto Panama ecommerce", "Panafoto online Panama"]], ["pedidosya", ["PedidosYa Panama delivery", "Pedidos Ya Panama food"]]],
  ["GT", "LATAM", "GTQ", ["gyt", ["Seguros GYT Guatemala", "GYT Insurance Guatemala"]], ["kemik", ["Kemik Guatemala ecommerce", "Kemik online Guatemala"]], ["pedidosya", ["PedidosYa Guatemala delivery", "Pedidos Ya Guatemala food"]]],
  ["HN", "LATAM", "HNL", ["ficohsa", ["Ficohsa Seguros Honduras", "Ficohsa Insurance Honduras"]], ["diunsa", ["Diunsa Honduras ecommerce", "Diunsa online Honduras"]], ["pedidosya", ["PedidosYa Honduras delivery", "Pedidos Ya Honduras food"]]],
  ["SV", "LATAM", "USD", ["sisa", ["SISA Seguros El Salvador", "SISA Insurance El Salvador"]], ["siman", ["Siman El Salvador ecommerce", "Almacenes Siman online El Salvador"]], ["pedidosya", ["PedidosYa El Salvador delivery", "Pedidos Ya El Salvador food"]]],
  ["DO", "CAR", "DOP", ["universal", ["Seguros Universal Dominican Republic", "Universal Insurance Dominicana"]], ["corripio", ["Plaza Lama Dominican ecommerce", "Plaza Lama online Dominicana"]], ["pedidosya", ["PedidosYa Dominican Republic", "Pedidos Ya Dominicana food"]]],

  // Africa and the Middle East.
  ["DZ", "MEA", "DZD", ["saa", ["SAA Assurance Algeria", "Societe Nationale Assurance Algeria"]], ["ouedkniss", ["Ouedkniss Algeria ecommerce", "Ouedkniss marketplace Algeria"]], ["yassir", ["Yassir Express Algeria", "Yassir food Algeria"]]],
  ["TN", "MEA", "TND", ["star", ["STAR Assurance Tunisia", "STAR Insurance Tunisie"]], ["mytek", ["Mytek Tunisia ecommerce", "Mytek.tn marketplace"]], ["glovo", ["Glovo Tunisia delivery", "Glovo Tunis food"]]],
  ["EG", "MEA", "EGP", ["misr", ["Misr Insurance Egypt", "Misr Insurance Company Egypt"]], ["jumia", ["Jumia Egypt ecommerce", "Jumia marketplace Egypt"]], ["talabat", ["Talabat Egypt delivery", "Talabat Cairo food"]]],
  ["KE", "AFR", "KES", ["jubilee", ["Jubilee Insurance Kenya", "Jubilee General Kenya"]], ["jumia", ["Jumia Kenya ecommerce", "Jumia marketplace Kenya"]], ["glovo", ["Glovo Kenya delivery", "Glovo Nairobi food"]]],
  ["TZ", "AFR", "TZS", ["jubilee", ["Jubilee Insurance Tanzania", "Jubilee General Tanzania"]], ["shoppers", ["Shoppers Plaza Tanzania ecommerce", "Shoppers online Tanzania"]], ["kfc", ["KFC Tanzania dining", "KFC Dar es Salaam Tanzania"]]],
  ["UG", "AFR", "UGX", ["jubilee", ["Jubilee Insurance Uganda", "Jubilee General Uganda"]], ["jiji", ["Jiji Uganda ecommerce", "Jiji marketplace Uganda"]], ["cafe-javas", ["Cafe Javas Uganda dining", "Cafe Javas Kampala"]]],
  ["RW", "AFR", "RWF", ["britam", ["Britam Insurance Rwanda", "Britam Rwanda premium"]], ["kasha", ["Kasha Rwanda ecommerce", "Kasha marketplace Rwanda"]], ["vuba-vuba", ["Vuba Vuba Rwanda delivery", "Vuba food Kigali"]]],
  ["SN", "AFR", "XOF", ["axa", ["AXA Assurance Senegal", "AXA Insurance Senegal"]], ["jumia", ["Jumia Senegal ecommerce", "Jumia marketplace Senegal"]], ["yassir", ["Yassir Senegal delivery", "Yassir food Dakar"]]],
  ["CI", "AFR", "XOF", ["nsia", ["NSIA Assurance Cote Ivoire", "NSIA Insurance Ivory Coast"]], ["jumia", ["Jumia Cote Ivoire ecommerce", "Jumia marketplace Ivory Coast"]], ["glovo", ["Glovo Cote Ivoire delivery", "Glovo Abidjan food"]]],
  ["ZA", "AFR", "ZAR", ["discovery", ["Discovery Insure South Africa", "Discovery Insurance South Africa"]], ["takealot", ["Takealot South Africa ecommerce", "Takealot marketplace South Africa"]], ["mr-d", ["Mr D Food South Africa", "MrD delivery South Africa"]]],
  ["ZM", "AFR", "ZMW", ["madison", ["Madison General Insurance Zambia", "Madison Insurance Zambia"]], ["tigmoo", ["Tigmoo Zambia ecommerce", "Tigmoo marketplace Zambia"]], ["yango-deli", ["Yango Deli Zambia", "Yango food Lusaka Zambia"]]],
  ["ZW", "AFR", "USD", ["old-mutual", ["Old Mutual Insurance Zimbabwe", "Old Mutual Zimbabwe premium"]], ["zimall", ["Zimall Zimbabwe ecommerce", "Zimall marketplace Zimbabwe"]], ["dial-delivery", ["Dial A Delivery Zimbabwe", "DAD food delivery Zimbabwe"]]],
  ["GH", "AFR", "GHS", ["enterprise", ["Enterprise Insurance Ghana", "Enterprise Group insurance Ghana"]], ["jumia", ["Jumia Ghana ecommerce", "Jumia marketplace Ghana"]], ["hubtel", ["Hubtel Food Ghana delivery", "Hubtel Ghana dining"]]],
  ["NG", "AFR", "NGN", ["leadway", ["Leadway Assurance Nigeria", "Leadway Insurance Nigeria"]], ["jumia", ["Jumia Nigeria ecommerce", "Jumia marketplace Nigeria"]], ["chowdeck", ["Chowdeck Nigeria delivery", "Chowdeck Lagos food"]]],
  ["MA", "MEA", "MAD", ["wafa", ["Wafa Assurance Morocco", "Wafa Insurance Maroc"]], ["jumia", ["Jumia Morocco ecommerce", "Jumia marketplace Maroc"]], ["glovo", ["Glovo Morocco delivery", "Glovo Casablanca food"]]],

  // Asia.
  ["JP", "EAS", "JPY", ["tokio-marine", ["Tokio Marine Insurance Japan", "Tokio Marine Nichido Japan"]], ["rakuten", ["Rakuten Japan ecommerce", "Rakuten Ichiba Japan"]], ["demae", ["Demae-can Japan delivery", "出前館 日本 food"]]],
  ["KR", "EAS", "KRW", ["samsung-fire", ["Samsung Fire Insurance Korea", "삼성화재 대한민국"]], ["coupang", ["Coupang Korea ecommerce", "쿠팡 대한민국"]], ["baemin", ["Baemin Korea delivery", "배달의민족 대한민국"]]],
  ["CN", "EAS", "CNY", ["ping-an", ["Ping An Insurance China", "中国平安保险"]], ["jd", ["JD.com China ecommerce", "京东商城 中国"]], ["meituan", ["Meituan China delivery", "美团外卖 中国"]]],
  ["IN", "SAS", "INR", ["icici-lombard", ["ICICI Lombard Insurance India", "ICICI Lombard premium India"]], ["flipkart", ["Flipkart India ecommerce", "Flipkart marketplace India"]], ["zomato", ["Zomato India delivery", "Zomato food India"]]],
  ["BD", "SAS", "BDT", ["green-delta", ["Green Delta Insurance Bangladesh", "Green Delta premium Bangladesh"]], ["daraz", ["Daraz Bangladesh ecommerce", "Daraz marketplace Bangladesh"]], ["foodpanda", ["Foodpanda Bangladesh delivery", "Food Panda Dhaka"]]],
  ["PK", "SAS", "PKR", ["jubilee", ["Jubilee General Insurance Pakistan", "Jubilee Insurance Pakistan"]], ["daraz", ["Daraz Pakistan ecommerce", "Daraz marketplace Pakistan"]], ["foodpanda", ["Foodpanda Pakistan delivery", "Food Panda Pakistan"]]],
  ["LK", "SAS", "LKR", ["ceylinco", ["Ceylinco General Insurance Sri Lanka", "Ceylinco Insurance Lanka"]], ["daraz", ["Daraz Sri Lanka ecommerce", "Daraz marketplace Lanka"]], ["pickme", ["PickMe Food Sri Lanka", "Pick Me delivery Lanka"]]],
  ["NP", "SAS", "NPR", ["nepal-life", ["Nepal Life Insurance", "Nepal Life premium Nepal"]], ["daraz", ["Daraz Nepal ecommerce", "Daraz marketplace Nepal"]], ["foodmandu", ["Foodmandu Nepal delivery", "Foodmandu Kathmandu"]]],
  ["KZ", "CAS", "KZT", ["halyk", ["Halyk Insurance Kazakhstan", "Halyk Saktyk Kazakhstan"]], ["kaspi", ["Kaspi Shop Kazakhstan ecommerce", "Kaspi marketplace Kazakhstan"]], ["wolt", ["Wolt Kazakhstan delivery", "Wolt Almaty food"]]],
  ["UZ", "CAS", "UZS", ["gross", ["Gross Insurance Uzbekistan", "Gross Sugurta Uzbekistan"]], ["uzum", ["Uzum Market Uzbekistan", "Uzum ecommerce Uzbekistan"]], ["express24", ["Express24 Uzbekistan delivery", "Express 24 Tashkent food"]]],
];

export const WORLD_COMMERCE_CONTEXT_ENTRIES: ContextEntry[] = COMMERCE_PACKS.flatMap((pack) => [
  context(pack, pack[3], "Insurance", "insurance", "insurer"),
  context(pack, pack[4], "Shopping", "ecommerce", "merchant"),
  context(pack, pack[5], "Dining", pack[5][0].includes("delivery") || ["mjam", "just-eat", "thuisbezorgd", "foodora", "pyszne", "efood", "bolt-food", "bistro", "wolt", "glovo", "foody", "rappi", "pedidosya", "uber-eats", "yassir", "talabat", "vuba-vuba", "mr-d", "yango-deli", "dial-delivery", "hubtel", "chowdeck", "demae", "baemin", "meituan", "zomato", "foodpanda", "pickme", "foodmandu", "express24"].includes(pack[5][0]) ? "food_delivery" : "dining", "merchant"),
]);
