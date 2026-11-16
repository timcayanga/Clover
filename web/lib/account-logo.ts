import { ADDITIONAL_BANK_LOGOS } from "@/lib/bank-logo-catalog";

export type AccountLogoOption = {
  id: string;
  src: string;
  accessibleLabel: string;
  kind: "generic" | "institution";
};

const genericLogo = (id: string, fileName: string, accessibleLabel: string): AccountLogoOption => ({
  id: `generic-${id}`,
  src: `/assets/banks/${fileName}`,
  accessibleLabel,
  kind: "generic",
});

const institutionLogo = (fileName: string): AccountLogoOption => ({
  id: `institution-${fileName.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
  src: `/assets/banks/philippines/${fileName}`,
  accessibleLabel: `${fileName.replace(/\.[^.]+$/, "")} logo`,
  kind: "institution",
});

export const GENERIC_ACCOUNT_LOGO_OPTIONS: AccountLogoOption[] = [
  genericLogo("bank", "bank.png", "Generic bank logo"),
  genericLogo("cash", "cash.png", "Generic cash logo"),
  genericLogo("wallet", "wallet.png", "Generic wallet logo"),
  genericLogo("credit-card", "credit card.png", "Generic credit card logo"),
  genericLogo("investment", "investment.png", "Generic investment logo"),
  genericLogo("other", "others.png", "Generic account logo"),
];

const INSTITUTION_LOGO_FILES = [
  "ab capital securities.jpeg", "aia.svg", "al amanah.jpeg", "allbank.jpg", "anz bank.jpeg", "atram.png",
  "aub.png", "bangkok bank.png", "bank of america.png", "bank of china.png", "bank of commerce.png",
  "bayad center.png", "bdo.png", "binance.jpg", "bpi.png", "cathay united.jpg", "cebuana lhuillier.jpeg",
  "chang hwa.jpeg", "chinabank.png", "cimb.png", "citibank.png", "cliqq.webp", "coins.png", "ctbc.png",
  "dbp.png", "deutsche bank.png", "dragonfi.png", "dragonpay.avif", "eastwest.png", "first commercial bank.png",
  "gcash.png", "gotrade.png", "gotyme.png", "grabpay.png", "hsbc.png", "hua nan bank.jpeg", "icbc.png",
  "industrial bank of korea.png", "ing.jpeg", "jpmorganchase.webp", "keb hana.jpeg", "landbank.png",
  "lazada wallet.png", "manulife.png", "maribank.png", "maya.png", "maybank.jpg",
  "mega international commercial bank.jpeg", "metrobank.png", "mizuho.jpeg", "mufg.png", "ownbank.png",
  "paymongo.avif", "paypal.png", "pbcom.jpg", "pdax.png", "philippine veterans bank.jpeg", "philtrust.jpeg",
  "pnb.png", "psbank.jpg", "rcbc.png", "security bank.png", "shinhan bank.webp", "shopeepay.png",
  "standard chartered.jpg", "sterling bank.jpeg", "sumitomo mitsui.png", "sun life.png", "tala.png", "tonik.png",
  "truemoney.png", "ucpb.png", "unionbank.jpg", "united overseas bank.png", "uno bank.png", "wise.png",
] as const;

export const INSTITUTION_ACCOUNT_LOGO_OPTIONS: AccountLogoOption[] = [
  ...INSTITUTION_LOGO_FILES.map(institutionLogo),
  ...ADDITIONAL_BANK_LOGOS.map((logo) => ({
    id: `institution-${logo.file.replace(/[^a-z0-9]+/gi, "-")}`,
    src: logo.src,
    accessibleLabel: `${logo.label} logo (${logo.region === "uk" ? "UK" : logo.region.replace(/\b\w/g, (letter) => letter.toUpperCase())})`,
    kind: "institution" as const,
  })),
];
export const ACCOUNT_LOGO_OPTIONS = [...GENERIC_ACCOUNT_LOGO_OPTIONS, ...INSTITUTION_ACCOUNT_LOGO_OPTIONS];

const BUILT_IN_ACCOUNT_LOGOS = new Set(ACCOUNT_LOGO_OPTIONS.map((option) => option.src));
const currentLogoByPath = new Map(ACCOUNT_LOGO_OPTIONS.map((option) => [option.src.split("?")[0], option.src]));
export const getCurrentBuiltInAccountLogoUrl = (value: string) => currentLogoByPath.get(value.split("?")[0]) ?? null;
export const MAX_CUSTOM_ACCOUNT_LOGO_LENGTH = 350_000;

export const isValidAccountLogoUrl = (value: string | null) => {
  if (value === null) return true;
  if (BUILT_IN_ACCOUNT_LOGOS.has(value) || getCurrentBuiltInAccountLogoUrl(value)) return true;
  return /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) && value.length <= MAX_CUSTOM_ACCOUNT_LOGO_LENGTH;
};
