type AccountBrandInput = {
  institution?: string | null;
  name?: string | null;
  type?: string | null;
};

export type AccountBrand = {
  label: string;
  logoSrc: string | null;
  logoSrcs: string[];
  fallbackIconSrc: string;
  accent: string;
  background: string;
  foreground: string;
};

const normalize = (value?: string | null) => String(value ?? "").trim().toLowerCase();

const iconPath = (fileName: string) => `/assets/banks/${fileName}`;

const philippinesLogoPath = (fileName: string) => `/assets/banks/philippines/${fileName}`;

const makeBrand = (params: {
  label: string;
  logoSrc?: string | null;
  logoSrcs?: string[];
  fallbackIconSrc: string;
  accent: string;
  background: string;
  foreground?: string;
}): AccountBrand => ({
  label: params.label,
  logoSrc: params.logoSrc ?? null,
  logoSrcs: params.logoSrcs ?? (params.logoSrc ? [params.logoSrc] : []),
  fallbackIconSrc: params.fallbackIconSrc,
  accent: params.accent,
  background: params.background,
  foreground: params.foreground ?? "#0f172a",
});

const bankIcon = iconPath("bank.png");
const cashIcon = iconPath("cash.png");
const creditCardIcon = iconPath("credit card.png");
const investmentIcon = iconPath("investment.png");
const othersIcon = iconPath("others.png");
const walletIcon = iconPath("wallet.png");
const philippinesLogo = (baseName: string) => [
  philippinesLogoPath(`${baseName}.png`),
  philippinesLogoPath(`${baseName}.jpg`),
  philippinesLogoPath(`${baseName}.jpeg`),
  philippinesLogoPath(`${baseName}.webp`),
  philippinesLogoPath(`${baseName}.avif`),
];
const philippinesLogoWithVariants = (...baseNames: string[]) =>
  baseNames.flatMap((baseName) => philippinesLogo(baseName));

const BANK_BRANDS: Array<{ match: RegExp; brand: AccountBrand }> = [
  {
    match: /\b(BANK OF THE PHILIPPINE ISLANDS|BPI)\b/i,
    brand: makeBrand({
      label: "BPI",
      logoSrcs: philippinesLogoWithVariants("bpi"),
      fallbackIconSrc: bankIcon,
      accent: "#E71F2C",
      background: "linear-gradient(135deg, rgba(231, 31, 44, 0.16), rgba(231, 31, 44, 0.06))",
    }),
  },
  {
    match: /\b(BDO|BANCO DE ORO)\b/i,
    brand: makeBrand({
      label: "BDO",
      logoSrcs: philippinesLogoWithVariants("bdo"),
      fallbackIconSrc: bankIcon,
      accent: "#0B63CE",
      background: "linear-gradient(135deg, rgba(11, 99, 206, 0.16), rgba(11, 99, 206, 0.06))",
    }),
  },
  {
    match: /\b(METROBANK|METROPOLITAN BANK)\b/i,
    brand: makeBrand({
      label: "Metrobank",
      logoSrc: philippinesLogoPath("metrobank.png"),
      logoSrcs: [philippinesLogoPath("metrobank.png")],
      fallbackIconSrc: bankIcon,
      accent: "#00539B",
      background: "linear-gradient(135deg, rgba(0, 83, 155, 0.18), rgba(0, 83, 155, 0.08))",
    }),
  },
  {
    match: /\bSECURITY BANK\b/i,
    brand: makeBrand({
      label: "Security Bank",
      logoSrcs: philippinesLogoWithVariants("security bank", "security-bank"),
      fallbackIconSrc: bankIcon,
      accent: "#1F3A5F",
      background: "linear-gradient(135deg, rgba(31, 58, 95, 0.18), rgba(163, 230, 53, 0.08))",
    }),
  },
  {
    match: /\b(EASTWEST|EAST WEST)\b/i,
    brand: makeBrand({
      label: "EastWest",
      logoSrcs: philippinesLogoWithVariants("eastwest"),
      fallbackIconSrc: bankIcon,
      accent: "#A3D900",
      background: "linear-gradient(135deg, rgba(163, 217, 0, 0.18), rgba(40, 56, 104, 0.08))",
    }),
  },
  {
    match: /\bRCBC\b/i,
    brand: makeBrand({
      label: "RCBC",
      logoSrcs: philippinesLogoWithVariants("rcbc"),
      fallbackIconSrc: bankIcon,
      accent: "#1FA8E0",
      background: "linear-gradient(135deg, rgba(31, 168, 224, 0.18), rgba(31, 168, 224, 0.06))",
    }),
  },
  {
    match: /\bUNIONBANK\b/i,
    brand: makeBrand({
      label: "UnionBank",
      logoSrcs: philippinesLogoWithVariants("unionbank"),
      fallbackIconSrc: bankIcon,
      accent: "#FF6A00",
      background: "linear-gradient(135deg, rgba(255, 106, 0, 0.18), rgba(255, 106, 0, 0.06))",
    }),
  },
  {
    match: /\bAUB\b/i,
    brand: makeBrand({
      label: "AUB",
      logoSrcs: philippinesLogoWithVariants("aub"),
      fallbackIconSrc: bankIcon,
      accent: "#D61F26",
      background: "linear-gradient(135deg, rgba(214, 31, 38, 0.16), rgba(214, 31, 38, 0.06))",
    }),
  },
  {
    match: /\bAB CAPITAL SECURITIES\b|\bAB CAPITAL\b/i,
    brand: makeBrand({
      label: "AB Capital Securities",
      logoSrcs: philippinesLogoWithVariants("ab capital securities"),
      fallbackIconSrc: investmentIcon,
      accent: "#0F4C81",
      background: "linear-gradient(135deg, rgba(15, 76, 129, 0.18), rgba(15, 76, 129, 0.06))",
    }),
  },
  {
    match: /\bCIMB\b/i,
    brand: makeBrand({
      label: "CIMB",
      logoSrcs: philippinesLogoWithVariants("cimb"),
      fallbackIconSrc: bankIcon,
      accent: "#E30613",
      background: "linear-gradient(135deg, rgba(227, 6, 19, 0.16), rgba(227, 6, 19, 0.06))",
    }),
  },
  {
    match: /\bCHINABANK\b/i,
    brand: makeBrand({
      label: "Chinabank",
      logoSrcs: philippinesLogoWithVariants("china bank", "chinabank"),
      fallbackIconSrc: bankIcon,
      accent: "#C81F25",
      background: "linear-gradient(135deg, rgba(200, 31, 37, 0.16), rgba(200, 31, 37, 0.06))",
    }),
  },
  {
    match: /\bMAYA\b/i,
    brand: makeBrand({
      label: "Maya",
      logoSrcs: philippinesLogoWithVariants("maya"),
      fallbackIconSrc: walletIcon,
      accent: "#34E6C7",
      background: "linear-gradient(135deg, rgba(52, 230, 199, 0.18), rgba(11, 31, 58, 0.08))",
      foreground: "#0b1f3a",
    }),
  },
  {
    match: /\bGCASH\b/i,
    brand: makeBrand({
      label: "GCash",
      logoSrcs: philippinesLogoWithVariants("gcash"),
      fallbackIconSrc: walletIcon,
      accent: "#118CF0",
      background: "linear-gradient(135deg, rgba(17, 140, 240, 0.16), rgba(17, 140, 240, 0.06))",
    }),
  },
  {
    match: /\bWISE\b/i,
    brand: makeBrand({
      label: "Wise",
      logoSrcs: philippinesLogoWithVariants("wise"),
      fallbackIconSrc: walletIcon,
      accent: "#00C389",
      background: "linear-gradient(135deg, rgba(0, 195, 137, 0.16), rgba(0, 195, 137, 0.06))",
    }),
  },
  {
    match: /\bGRABPAY\b/i,
    brand: makeBrand({
      label: "GrabPay",
      logoSrcs: philippinesLogoWithVariants("grabpay"),
      fallbackIconSrc: walletIcon,
      accent: "#00B14F",
      background: "linear-gradient(135deg, rgba(0, 177, 79, 0.16), rgba(0, 177, 79, 0.06))",
    }),
  },
  {
    match: /\bSHOPEEPAY\b/i,
    brand: makeBrand({
      label: "ShopeePay",
      logoSrcs: philippinesLogoWithVariants("shopeepay"),
      fallbackIconSrc: walletIcon,
      accent: "#F36D00",
      background: "linear-gradient(135deg, rgba(243, 109, 0, 0.16), rgba(243, 109, 0, 0.06))",
    }),
  },
  {
    match: /\bPDAX\b/i,
    brand: makeBrand({
      label: "PDAX",
      logoSrcs: philippinesLogoWithVariants("pdax"),
      fallbackIconSrc: investmentIcon,
      accent: "#1E4D8F",
      background: "linear-gradient(135deg, rgba(30, 77, 143, 0.16), rgba(176, 230, 176, 0.08))",
    }),
  },
  {
    match: /\b(BANK OF COMMERCE|BANKCOM)\b/i,
    brand: makeBrand({
      label: "Bank of Commerce",
      logoSrcs: philippinesLogoWithVariants("bank of commerce", "bank-of-commerce", "bankcom"),
      fallbackIconSrc: bankIcon,
      accent: "#E8C63D",
      background: "linear-gradient(135deg, rgba(232, 198, 61, 0.18), rgba(13, 27, 90, 0.08))",
    }),
  },
  {
    match: /\b(BANK OF CHINA|BOC)\b/i,
    brand: makeBrand({
      label: "Bank of China",
      logoSrcs: philippinesLogoWithVariants("bank of china", "bank-of-china", "boc"),
      fallbackIconSrc: bankIcon,
      accent: "#BF1E2E",
      background: "linear-gradient(135deg, rgba(191, 30, 46, 0.16), rgba(191, 30, 46, 0.06))",
    }),
  },
  {
    match: /\bHSBC\b/i,
    brand: makeBrand({
      label: "HSBC",
      logoSrcs: philippinesLogoWithVariants("hsbc"),
      fallbackIconSrc: bankIcon,
      accent: "#DB0011",
      background: "linear-gradient(135deg, rgba(219, 0, 17, 0.16), rgba(219, 0, 17, 0.06))",
    }),
  },
  {
    match: /\bLAND BANK\b|\bLANDBANK\b/i,
    brand: makeBrand({
      label: "LandBank",
      logoSrcs: philippinesLogoWithVariants("landbank", "land bank"),
      fallbackIconSrc: bankIcon,
      accent: "#00833E",
      background: "linear-gradient(135deg, rgba(0, 131, 62, 0.16), rgba(0, 131, 62, 0.06))",
    }),
  },
  {
    match: /\bMAYBANK\b/i,
    brand: makeBrand({
      label: "Maybank",
      logoSrcs: philippinesLogoWithVariants("maybank"),
      fallbackIconSrc: bankIcon,
      accent: "#FFCC00",
      background: "linear-gradient(135deg, rgba(255, 204, 0, 0.18), rgba(255, 204, 0, 0.08))",
      foreground: "#0f172a",
    }),
  },
  {
    match: /\bAL AMANAH\b/i,
    brand: makeBrand({
      label: "Al Amanah",
      logoSrcs: philippinesLogoWithVariants("al amanah"),
      fallbackIconSrc: bankIcon,
      accent: "#0F7B3A",
      background: "linear-gradient(135deg, rgba(15, 123, 58, 0.18), rgba(15, 123, 58, 0.06))",
    }),
  },
  {
    match: /\bANZ\b|\bANZ BANK\b/i,
    brand: makeBrand({
      label: "ANZ Bank",
      logoSrcs: philippinesLogoWithVariants("anz bank"),
      fallbackIconSrc: bankIcon,
      accent: "#0052CC",
      background: "linear-gradient(135deg, rgba(0, 82, 204, 0.18), rgba(0, 82, 204, 0.06))",
    }),
  },
  {
    match: /\bPNB\b/i,
    brand: makeBrand({
      label: "PNB",
      logoSrcs: philippinesLogoWithVariants("pnb"),
      fallbackIconSrc: bankIcon,
      accent: "#0055A5",
      background: "linear-gradient(135deg, rgba(0, 85, 165, 0.16), rgba(0, 85, 165, 0.06))",
    }),
  },
  {
    match: /\bPSBANK\b/i,
    brand: makeBrand({
      label: "PSBank",
      logoSrcs: philippinesLogoWithVariants("psbank"),
      fallbackIconSrc: bankIcon,
      accent: "#0B63CE",
      background: "linear-gradient(135deg, rgba(11, 99, 206, 0.16), rgba(11, 99, 206, 0.06))",
    }),
  },
  {
    match: /\bDRAGONFI\b/i,
    brand: makeBrand({
      label: "DragonFi",
      logoSrcs: philippinesLogoWithVariants("dragonfi"),
      fallbackIconSrc: investmentIcon,
      accent: "#6D28D9",
      background: "linear-gradient(135deg, rgba(109, 40, 217, 0.18), rgba(109, 40, 217, 0.06))",
    }),
  },
  {
    match: /\bDRAGONPAY\b/i,
    brand: makeBrand({
      label: "Dragonpay",
      logoSrcs: philippinesLogoWithVariants("dragonpay"),
      fallbackIconSrc: walletIcon,
      accent: "#0EA5A8",
      background: "linear-gradient(135deg, rgba(14, 165, 168, 0.18), rgba(14, 165, 168, 0.06))",
    }),
  },
  {
    match: /\bGO?TYME\b/i,
    brand: makeBrand({
      label: "GoTyme",
      logoSrcs: philippinesLogoWithVariants("gotyme"),
      fallbackIconSrc: walletIcon,
      accent: "#6D28D9",
      background: "linear-gradient(135deg, rgba(109, 40, 217, 0.16), rgba(109, 40, 217, 0.06))",
    }),
  },
  {
    match: /\bUCPB\b/i,
    brand: makeBrand({
      label: "UCPB",
      logoSrcs: philippinesLogoWithVariants("ucpb"),
      fallbackIconSrc: bankIcon,
      accent: "#00703C",
      background: "linear-gradient(135deg, rgba(0, 112, 60, 0.16), rgba(0, 112, 60, 0.06))",
    }),
  },
  {
    match: /\bPHILIPPINE VETERANS BANK\b|\bPVB\b/i,
    brand: makeBrand({
      label: "Philippine Veterans Bank",
      logoSrcs: philippinesLogoWithVariants("philippine veterans bank"),
      fallbackIconSrc: bankIcon,
      accent: "#0B6E4F",
      background: "linear-gradient(135deg, rgba(11, 110, 79, 0.18), rgba(11, 110, 79, 0.06))",
    }),
  },
  {
    match: /\bSTERLING BANK\b/i,
    brand: makeBrand({
      label: "Sterling Bank",
      logoSrcs: philippinesLogoWithVariants("sterling bank"),
      fallbackIconSrc: bankIcon,
      accent: "#1D4ED8",
      background: "linear-gradient(135deg, rgba(29, 78, 216, 0.18), rgba(29, 78, 216, 0.06))",
    }),
  },
  {
    match: /\bMARI?BANK\b/i,
    brand: makeBrand({
      label: "MariBank",
      logoSrcs: philippinesLogoWithVariants("maribank"),
      fallbackIconSrc: bankIcon,
      accent: "#F97316",
      background: "linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(49, 46, 129, 0.08))",
    }),
  },
  {
    match: /\bCITIBANK\b/i,
    brand: makeBrand({
      label: "Citibank",
      logoSrcs: philippinesLogoWithVariants("citibank"),
      fallbackIconSrc: bankIcon,
      accent: "#0F5EA8",
      background: "linear-gradient(135deg, rgba(15, 94, 168, 0.16), rgba(15, 94, 168, 0.06))",
    }),
  },
  {
    match: /\bPAYPAL\b/i,
    brand: makeBrand({
      label: "PayPal",
      logoSrcs: philippinesLogoWithVariants("paypal"),
      fallbackIconSrc: walletIcon,
      accent: "#003087",
      background: "linear-gradient(135deg, rgba(0, 48, 135, 0.16), rgba(0, 48, 135, 0.06))",
    }),
  },
  {
    match: /\bPAYMONGO\b/i,
    brand: makeBrand({
      label: "PayMongo",
      logoSrcs: philippinesLogoWithVariants("paymongo"),
      fallbackIconSrc: walletIcon,
      accent: "#4338CA",
      background: "linear-gradient(135deg, rgba(67, 56, 202, 0.16), rgba(67, 56, 202, 0.06))",
    }),
  },
  {
    match: /\bCLIQQ\b/i,
    brand: makeBrand({
      label: "CLIQQ",
      logoSrcs: philippinesLogoWithVariants("cliqq"),
      fallbackIconSrc: walletIcon,
      accent: "#F97316",
      background: "linear-gradient(135deg, rgba(249, 115, 22, 0.16), rgba(249, 115, 22, 0.06))",
    }),
  },
  {
    match: /\bING\b/i,
    brand: makeBrand({
      label: "ING",
      logoSrcs: philippinesLogoWithVariants("ing"),
      fallbackIconSrc: bankIcon,
      accent: "#FF6200",
      background: "linear-gradient(135deg, rgba(255, 98, 0, 0.18), rgba(255, 98, 0, 0.06))",
    }),
  },
  {
    match: /\bTONIK\b/i,
    brand: makeBrand({
      label: "Tonik",
      logoSrcs: philippinesLogoWithVariants("tonik"),
      fallbackIconSrc: walletIcon,
      accent: "#7650F2",
      background: "linear-gradient(135deg, rgba(118, 80, 242, 0.18), rgba(118, 80, 242, 0.06))",
    }),
  },
  {
    match: /\bBINANCE\b/i,
    brand: makeBrand({
      label: "Binance",
      logoSrcs: philippinesLogoWithVariants("binance"),
      fallbackIconSrc: investmentIcon,
      accent: "#F0B90B",
      background: "linear-gradient(135deg, rgba(240, 185, 11, 0.18), rgba(240, 185, 11, 0.06))",
    }),
  },
  {
    match: /\bGOTRADE\b|\bGO TRADE\b/i,
    brand: makeBrand({
      label: "GoTrade",
      logoSrcs: philippinesLogoWithVariants("gotrade"),
      fallbackIconSrc: investmentIcon,
      accent: "#16D3D3",
      background: "linear-gradient(135deg, rgba(22, 211, 211, 0.18), rgba(22, 211, 211, 0.06))",
    }),
  },
  {
    match: /\bATRAM\b/i,
    brand: makeBrand({
      label: "ATRAM",
      logoSrcs: philippinesLogoWithVariants("atram"),
      fallbackIconSrc: investmentIcon,
      accent: "#005BAC",
      background: "linear-gradient(135deg, rgba(0, 91, 172, 0.18), rgba(0, 91, 172, 0.06))",
    }),
  },
  {
    match: /\bCOINS(?:\.PH)?\b/i,
    brand: makeBrand({
      label: "Coins.ph",
      logoSrcs: philippinesLogoWithVariants("coins"),
      fallbackIconSrc: walletIcon,
      accent: "#1F3B7A",
      background: "linear-gradient(135deg, rgba(31, 59, 122, 0.18), rgba(31, 59, 122, 0.06))",
    }),
  },
  {
    match: /\bDBP\b/i,
    brand: makeBrand({
      label: "DBP",
      logoSrcs: philippinesLogoWithVariants("dbp"),
      fallbackIconSrc: bankIcon,
      accent: "#0054A6",
      background: "linear-gradient(135deg, rgba(0, 84, 166, 0.18), rgba(0, 84, 166, 0.06))",
    }),
  },
  {
    match: /\bCEBUANA\b/i,
    brand: makeBrand({
      label: "Cebuana Lhuillier",
      logoSrcs: philippinesLogoWithVariants("cebuana lhuillier"),
      fallbackIconSrc: walletIcon,
      accent: "#F36D00",
      background: "linear-gradient(135deg, rgba(243, 109, 0, 0.18), rgba(243, 109, 0, 0.06))",
    }),
  },
  {
    match: /\bLAZADA\b/i,
    brand: makeBrand({
      label: "Lazada Wallet",
      logoSrcs: philippinesLogoWithVariants("lazada wallet"),
      fallbackIconSrc: walletIcon,
      accent: "#2563EB",
      background: "linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(37, 99, 235, 0.06))",
    }),
  },
  {
    match: /\bTRUEMONEY\b/i,
    brand: makeBrand({
      label: "TrueMoney",
      logoSrcs: philippinesLogoWithVariants("truemoney"),
      fallbackIconSrc: walletIcon,
      accent: "#FF7A00",
      background: "linear-gradient(135deg, rgba(255, 122, 0, 0.18), rgba(255, 122, 0, 0.06))",
    }),
  },
  {
    match: /\bBAYAD\b/i,
    brand: makeBrand({
      label: "Bayad Center",
      logoSrcs: philippinesLogoWithVariants("bayad center"),
      fallbackIconSrc: walletIcon,
      accent: "#F59E0B",
      background: "linear-gradient(135deg, rgba(245, 158, 11, 0.18), rgba(245, 158, 11, 0.06))",
    }),
  },
  {
    match: /\bOWNBANK\b/i,
    brand: makeBrand({
      label: "OwnBank",
      logoSrcs: philippinesLogoWithVariants("ownbank"),
      fallbackIconSrc: bankIcon,
      accent: "#111827",
      background: "linear-gradient(135deg, rgba(17, 24, 39, 0.18), rgba(17, 24, 39, 0.06))",
      foreground: "#111827",
    }),
  },
  {
    match: /\bUNO BANK\b|\bUNOBANK\b/i,
    brand: makeBrand({
      label: "Uno Bank",
      logoSrcs: philippinesLogoWithVariants("uno bank"),
      fallbackIconSrc: bankIcon,
      accent: "#0F172A",
      background: "linear-gradient(135deg, rgba(15, 23, 42, 0.18), rgba(15, 23, 42, 0.06))",
      foreground: "#0f172a",
    }),
  },
  {
    match: /\bPBCOM\b/i,
    brand: makeBrand({
      label: "PBCOM",
      logoSrcs: philippinesLogoWithVariants("pbcom"),
      fallbackIconSrc: bankIcon,
      accent: "#E53935",
      background: "linear-gradient(135deg, rgba(229, 57, 53, 0.18), rgba(229, 57, 53, 0.06))",
    }),
  },
  {
    match: /\bPHILTRUST\b/i,
    brand: makeBrand({
      label: "Philtrust",
      logoSrcs: philippinesLogoWithVariants("philtrust"),
      fallbackIconSrc: bankIcon,
      accent: "#1E3A8A",
      background: "linear-gradient(135deg, rgba(30, 58, 138, 0.18), rgba(30, 58, 138, 0.06))",
    }),
  },
  {
    match: /\bMANULIFE\b/i,
    brand: makeBrand({
      label: "Manulife",
      logoSrcs: philippinesLogoWithVariants("manulife"),
      fallbackIconSrc: investmentIcon,
      accent: "#00833E",
      background: "linear-gradient(135deg, rgba(0, 131, 62, 0.18), rgba(0, 131, 62, 0.06))",
    }),
  },
  {
    match: /\bCATHAY UNITED\b/i,
    brand: makeBrand({
      label: "Cathay United",
      logoSrcs: philippinesLogoWithVariants("cathay united"),
      fallbackIconSrc: bankIcon,
      accent: "#008D4C",
      background: "linear-gradient(135deg, rgba(0, 141, 76, 0.18), rgba(0, 141, 76, 0.06))",
    }),
  },
  {
    match: /\bCHANG HWA\b/i,
    brand: makeBrand({
      label: "Chang Hwa",
      logoSrcs: philippinesLogoWithVariants("chang hwa"),
      fallbackIconSrc: bankIcon,
      accent: "#D50032",
      background: "linear-gradient(135deg, rgba(213, 0, 50, 0.18), rgba(213, 0, 50, 0.06))",
    }),
  },
  {
    match: /\b(UOB|UNITED OVERSEAS BANK)\b/i,
    brand: makeBrand({
      label: "United Overseas Bank",
      logoSrcs: philippinesLogoWithVariants("united overseas bank", "uob"),
      fallbackIconSrc: bankIcon,
      accent: "#E21B22",
      background: "linear-gradient(135deg, rgba(226, 27, 34, 0.18), rgba(226, 27, 34, 0.06))",
    }),
  },
  {
    match: /\bSTANDARD CHARTERED\b/i,
    brand: makeBrand({
      label: "Standard Chartered",
      logoSrcs: philippinesLogoWithVariants("standard chartered"),
      fallbackIconSrc: bankIcon,
      accent: "#005EB8",
      background: "linear-gradient(135deg, rgba(0, 94, 184, 0.18), rgba(0, 94, 184, 0.06))",
    }),
  },
  {
    match: /\bALLBANK\b/i,
    brand: makeBrand({
      label: "AllBank",
      logoSrcs: philippinesLogoWithVariants("allbank"),
      fallbackIconSrc: bankIcon,
      accent: "#2F855A",
      background: "linear-gradient(135deg, rgba(47, 133, 90, 0.18), rgba(47, 133, 90, 0.06))",
    }),
  },
  {
    match: /\bSHINHAN BANK\b|\bSHINHAN\b/i,
    brand: makeBrand({
      label: "Shinhan Bank",
      logoSrcs: philippinesLogoWithVariants("shinhan bank", "shinhan"),
      fallbackIconSrc: bankIcon,
      accent: "#0066B2",
      background: "linear-gradient(135deg, rgba(0, 102, 178, 0.18), rgba(0, 102, 178, 0.06))",
    }),
  },
  {
    match: /\bJPMORGAN(?: CHASE)?\b/i,
    brand: makeBrand({
      label: "JPMorgan Chase",
      logoSrcs: philippinesLogoWithVariants("jpmorganchase", "jpmorgan chase"),
      fallbackIconSrc: bankIcon,
      accent: "#0A4EA2",
      background: "linear-gradient(135deg, rgba(10, 78, 162, 0.18), rgba(10, 78, 162, 0.06))",
    }),
  },
  {
    match: /\bINDUSTRIAL BANK OF KOREA\b|\bIBK\b/i,
    brand: makeBrand({
      label: "Industrial Bank of Korea",
      logoSrcs: philippinesLogoWithVariants("industrial bank of korea", "ibk"),
      fallbackIconSrc: bankIcon,
      accent: "#0A5A9C",
      background: "linear-gradient(135deg, rgba(10, 90, 156, 0.18), rgba(10, 90, 156, 0.06))",
    }),
  },
  {
    match: /\bFIRST COMMERCIAL BANK\b/i,
    brand: makeBrand({
      label: "First Commercial Bank",
      logoSrcs: philippinesLogoWithVariants("first commercial bank"),
      fallbackIconSrc: bankIcon,
      accent: "#006B3F",
      background: "linear-gradient(135deg, rgba(0, 107, 63, 0.18), rgba(0, 107, 63, 0.06))",
    }),
  },
  {
    match: /\bBANK OF AMERICA\b/i,
    brand: makeBrand({
      label: "Bank of America",
      logoSrcs: philippinesLogoWithVariants("bank of america"),
      fallbackIconSrc: bankIcon,
      accent: "#B31B1B",
      background: "linear-gradient(135deg, rgba(179, 27, 27, 0.18), rgba(0, 58, 112, 0.08))",
    }),
  },
  {
    match: /\bCTBC\b/i,
    brand: makeBrand({
      label: "CTBC",
      logoSrcs: philippinesLogoWithVariants("ctbc"),
      fallbackIconSrc: bankIcon,
      accent: "#00A6A6",
      background: "linear-gradient(135deg, rgba(0, 166, 166, 0.18), rgba(0, 166, 166, 0.06))",
    }),
  },
  {
    match: /\bBANGKOK BANK\b/i,
    brand: makeBrand({
      label: "Bangkok Bank",
      logoSrcs: philippinesLogoWithVariants("bangkok bank"),
      fallbackIconSrc: bankIcon,
      accent: "#002B7F",
      background: "linear-gradient(135deg, rgba(0, 43, 127, 0.18), rgba(0, 43, 127, 0.06))",
    }),
  },
  {
    match: /\bMUFG\b/i,
    brand: makeBrand({
      label: "MUFG",
      logoSrcs: philippinesLogoWithVariants("mufg"),
      fallbackIconSrc: bankIcon,
      accent: "#C81E1E",
      background: "linear-gradient(135deg, rgba(200, 30, 30, 0.18), rgba(200, 30, 30, 0.06))",
    }),
  },
  {
    match: /\bMIZUHO\b/i,
    brand: makeBrand({
      label: "Mizuho",
      logoSrcs: philippinesLogoWithVariants("mizuho"),
      fallbackIconSrc: bankIcon,
      accent: "#001F7A",
      background: "linear-gradient(135deg, rgba(0, 31, 122, 0.18), rgba(0, 31, 122, 0.06))",
    }),
  },
  {
    match: /\bSUMITOMO MITSUI\b/i,
    brand: makeBrand({
      label: "Sumitomo Mitsui",
      logoSrcs: philippinesLogoWithVariants("sumitomo mitsui"),
      fallbackIconSrc: bankIcon,
      accent: "#006B4E",
      background: "linear-gradient(135deg, rgba(0, 107, 78, 0.18), rgba(0, 107, 78, 0.06))",
    }),
  },
  {
    match: /\bHUA NAN BANK\b/i,
    brand: makeBrand({
      label: "Hua Nan Bank",
      logoSrcs: philippinesLogoWithVariants("hua nan bank"),
      fallbackIconSrc: bankIcon,
      accent: "#E60012",
      background: "linear-gradient(135deg, rgba(230, 0, 18, 0.18), rgba(230, 0, 18, 0.06))",
    }),
  },
];

export const getAccountBrand = (params: AccountBrandInput): AccountBrand => {
  const institution = normalize(params.institution);
  const name = normalize(params.name);
  const type = normalize(params.type);

  if (type === "cash" || institution === "cash" || name === "cash") {
    return makeBrand({
      label: "Cash",
      logoSrc: null,
      logoSrcs: [],
      fallbackIconSrc: cashIcon,
      accent: "#16A34A",
      background: "linear-gradient(135deg, rgba(22, 163, 74, 0.16), rgba(22, 163, 74, 0.06))",
    });
  }

  for (const entry of BANK_BRANDS) {
    if (entry.match.test(`${params.institution ?? ""} ${params.name ?? ""}`)) {
      return entry.brand;
    }
  }

  if (institution === "wallet" || type === "wallet") {
    return makeBrand({
      label: "Wallet",
      logoSrc: null,
      logoSrcs: [],
      fallbackIconSrc: walletIcon,
      accent: "#0284C7",
      background: "linear-gradient(135deg, rgba(2, 132, 199, 0.16), rgba(2, 132, 199, 0.06))",
    });
  }

  if (type === "credit_card") {
    return makeBrand({
      label: params.institution?.trim() || "Credit Card",
      logoSrc: null,
      logoSrcs: [],
      fallbackIconSrc: creditCardIcon,
      accent: "#DC2626",
      background: "linear-gradient(135deg, rgba(220, 38, 38, 0.16), rgba(220, 38, 38, 0.06))",
    });
  }

  if (type === "investment") {
    return makeBrand({
      label: params.institution?.trim() || "Investment",
      logoSrc: null,
      logoSrcs: [],
      fallbackIconSrc: investmentIcon,
      accent: "#7C3AED",
      background: "linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(124, 58, 237, 0.06))",
    });
  }

  if (type === "other") {
    return makeBrand({
      label: params.institution?.trim() || "Other",
      logoSrc: null,
      logoSrcs: [],
      fallbackIconSrc: othersIcon,
      accent: "#64748B",
      background: "linear-gradient(135deg, rgba(100, 116, 139, 0.16), rgba(100, 116, 139, 0.06))",
    });
  }

  return makeBrand({
    label: params.institution?.trim() || params.name?.trim() || "Account",
    logoSrc: null,
    logoSrcs: [],
    fallbackIconSrc: bankIcon,
    accent: "#0EA5B7",
    background: "linear-gradient(135deg, rgba(14, 165, 183, 0.16), rgba(14, 165, 183, 0.06))",
  });
};
