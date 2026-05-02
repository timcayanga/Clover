import type { AccountBrand } from "@/lib/account-brand";
import { isFixedIncomeInvestmentSubtype, isMarketInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";

type InvestmentAssetBrandInput = {
  symbol?: string | null;
  name?: string | null;
  subtype?: InvestmentSubtype | null;
  currency?: string | null;
};

const INVESTMENT_IMAGE_FOLDERS = {
  crypto: "crypto",
  ph: "ph markets",
  us: "us markets",
} as const;

const assetIconPath = "/assets/banks/investment.png";

const encodeAssetPath = (...segments: string[]) => `/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

const normalizeAssetStem = (value: string) => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const original = value.trim().replace(/\.[a-z0-9]+$/i, "");
  const lowerOriginal = original.toLowerCase();
  const withoutExtension = trimmed.replace(/\.[a-z0-9]+$/i, "");
  const parts = withoutExtension.split(/[^a-z0-9]+/g).filter(Boolean);
  const candidates = [
    original,
    original.toUpperCase(),
    lowerOriginal,
    withoutExtension,
    withoutExtension.replace(/[^a-z0-9]+/g, "-"),
    withoutExtension.replace(/[^a-z0-9]+/g, ""),
    lowerOriginal.replace(/[^a-z0-9]+/g, "-"),
    lowerOriginal.replace(/[^a-z0-9]+/g, ""),
    ...parts,
    ...parts.map((part) => part.toUpperCase()),
    parts.join("-"),
  ];

  return uniqueValues(candidates);
};

const getInvestmentImageFolderOrder = (params: InvestmentAssetBrandInput) => {
  if (params.subtype === "crypto") {
    return [INVESTMENT_IMAGE_FOLDERS.crypto, INVESTMENT_IMAGE_FOLDERS.ph, INVESTMENT_IMAGE_FOLDERS.us, ""];
  }

  if (isMarketInvestmentSubtype(params.subtype) || isFixedIncomeInvestmentSubtype(params.subtype)) {
    const preferredMarket = params.currency?.trim().toUpperCase() === "USD" ? INVESTMENT_IMAGE_FOLDERS.us : INVESTMENT_IMAGE_FOLDERS.ph;
    const secondaryMarket = preferredMarket === INVESTMENT_IMAGE_FOLDERS.us ? INVESTMENT_IMAGE_FOLDERS.ph : INVESTMENT_IMAGE_FOLDERS.us;
    return [preferredMarket, secondaryMarket, "", INVESTMENT_IMAGE_FOLDERS.crypto];
  }

  return ["", INVESTMENT_IMAGE_FOLDERS.ph, INVESTMENT_IMAGE_FOLDERS.us, INVESTMENT_IMAGE_FOLDERS.crypto];
};

const getInvestmentImageExtensions = (folder: string) =>
  folder === INVESTMENT_IMAGE_FOLDERS.crypto ? ["png", "webp", "jpg", "jpeg", "svg", "avif"] : ["svg", "png", "webp", "jpg", "jpeg", "avif"];

export const getInvestmentAssetLogoCandidates = (params: InvestmentAssetBrandInput) => {
  const folderOrder = getInvestmentImageFolderOrder(params);
  const stems = uniqueValues([
    ...(params.symbol ? normalizeAssetStem(params.symbol) : []),
    ...(params.name ? normalizeAssetStem(params.name) : []),
  ]);

  const candidates: string[] = [];

  for (const folder of folderOrder) {
    const extensions = getInvestmentImageExtensions(folder);

    for (const stem of stems) {
      for (const extension of extensions) {
        const fileName = `${stem}.${extension}`;
        candidates.push(folder ? encodeAssetPath("assets", "investments", folder, fileName) : encodeAssetPath("assets", "investments", fileName));
      }
    }
  }

  return uniqueValues(candidates);
};

export const getInvestmentAssetBrand = (params: InvestmentAssetBrandInput): AccountBrand => {
  const label = params.symbol?.trim() || params.name?.trim() || "Investment";
  const isCrypto = params.subtype === "crypto";
  const isFixedIncome = isFixedIncomeInvestmentSubtype(params.subtype);

  return {
    label,
    logoSrc: null,
    logoSrcs: getInvestmentAssetLogoCandidates(params),
    fallbackIconSrc: assetIconPath,
    accent: isCrypto ? "#22c55e" : isFixedIncome ? "#2563eb" : "#14b8a6",
    background: isCrypto
      ? "linear-gradient(135deg, rgba(34, 197, 94, 0.16), rgba(14, 165, 233, 0.06))"
      : isFixedIncome
        ? "linear-gradient(135deg, rgba(37, 99, 235, 0.16), rgba(37, 99, 235, 0.06))"
        : "linear-gradient(135deg, rgba(20, 184, 166, 0.16), rgba(20, 184, 166, 0.06))",
    foreground: "#0f172a",
  };
};
