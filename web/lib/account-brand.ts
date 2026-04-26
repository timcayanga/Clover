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
      logoSrcs: philippinesLogoWithVariants("metrobank"),
      fallbackIconSrc: bankIcon,
      accent: "#E71F2C",
      background: "linear-gradient(135deg, rgba(231, 31, 44, 0.16), rgba(231, 31, 44, 0.06))",
    }),
  },
  {
    match: /\bSECURITY BANK\b/i,
    brand: makeBrand({
      label: "Security Bank",
      logoSrcs: philippinesLogoWithVariants("security bank", "security-bank"),
      fallbackIconSrc: bankIcon,
      accent: "#E29D2D",
      background: "linear-gradient(135deg, rgba(226, 157, 45, 0.18), rgba(226, 157, 45, 0.06))",
    }),
  },
  {
    match: /\b(EASTWEST|EAST WEST)\b/i,
    brand: makeBrand({
      label: "EastWest",
      logoSrcs: philippinesLogoWithVariants("eastwest"),
      fallbackIconSrc: bankIcon,
      accent: "#0AA06E",
      background: "linear-gradient(135deg, rgba(10, 160, 110, 0.18), rgba(10, 160, 110, 0.06))",
    }),
  },
  {
    match: /\bRCBC\b/i,
    brand: makeBrand({
      label: "RCBC",
      logoSrcs: philippinesLogoWithVariants("rcbc"),
      fallbackIconSrc: bankIcon,
      accent: "#20B0E0",
      background: "linear-gradient(135deg, rgba(32, 176, 224, 0.18), rgba(32, 176, 224, 0.06))",
    }),
  },
  {
    match: /\bUNIONBANK\b/i,
    brand: makeBrand({
      label: "UnionBank",
      logoSrcs: philippinesLogoWithVariants("unionbank"),
      fallbackIconSrc: bankIcon,
      accent: "#7A1F8A",
      background: "linear-gradient(135deg, rgba(122, 31, 138, 0.16), rgba(122, 31, 138, 0.06))",
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
      accent: "#0B1F3A",
      background: "linear-gradient(135deg, rgba(11, 31, 58, 0.14), rgba(11, 31, 58, 0.06))",
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
      accent: "#0078D4",
      background: "linear-gradient(135deg, rgba(0, 120, 212, 0.16), rgba(0, 120, 212, 0.06))",
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
      accent: "#0F766E",
      background: "linear-gradient(135deg, rgba(15, 118, 110, 0.16), rgba(15, 118, 110, 0.06))",
    }),
  },
  {
    match: /\b(BANK OF COMMERCE|BANKCOM)\b/i,
    brand: makeBrand({
      label: "Bank of Commerce",
      logoSrcs: philippinesLogoWithVariants("bank of commerce", "bank-of-commerce", "bankcom"),
      fallbackIconSrc: bankIcon,
      accent: "#0C7B72",
      background: "linear-gradient(135deg, rgba(12, 123, 114, 0.16), rgba(12, 123, 114, 0.06))",
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
    match: /\bMARI?BANK\b/i,
    brand: makeBrand({
      label: "MariBank",
      logoSrcs: philippinesLogoWithVariants("maribank"),
      fallbackIconSrc: bankIcon,
      accent: "#0F766E",
      background: "linear-gradient(135deg, rgba(15, 118, 110, 0.16), rgba(15, 118, 110, 0.06))",
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
