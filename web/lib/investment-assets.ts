import { getAccountBrand, type AccountBrand } from "@/lib/account-brand";
import { isFixedIncomeInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";

type InvestmentAssetBrandInput = {
  symbol?: string | null;
  name?: string | null;
  subtype?: InvestmentSubtype | null;
  currency?: string | null;
  institution?: string | null;
};

const assetIconPath = "/assets/banks/investment.png";

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

const escapeSvgText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const getAssetMonogram = (params: InvestmentAssetBrandInput) => {
  const source = params.symbol?.trim() || params.name?.trim() || "IN";
  const words = source.split(/[^a-z0-9]+/i).filter(Boolean);
  const initials = (words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join("") : source.slice(0, 3)).toUpperCase();
  return initials || "IN";
};

const getAssetMonogramDataUri = (params: InvestmentAssetBrandInput) => {
  const isCrypto = params.subtype === "crypto";
  const isRealWorldAsset = params.subtype === "real_world_asset";
  const isFixedIncome = isFixedIncomeInvestmentSubtype(params.subtype);
  const background = isCrypto ? "#16a34a" : isRealWorldAsset ? "#b7791f" : isFixedIncome ? "#2563eb" : "#0891b2";
  const text = escapeSvgText(getAssetMonogram(params));
  const fontSize = text.length > 2 ? 22 : 26;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="${background}"/><text x="40" y="48" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="700">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const getInvestmentAssetLogoCandidates = (params: InvestmentAssetBrandInput) => {
  if (!params.symbol?.trim() && !params.name?.trim()) {
    return [];
  }

  // A deterministic local monogram avoids probing dozens of missing image URLs,
  // which previously made investment marks flicker while their fallbacks loaded.
  return [getAssetMonogramDataUri(params)];
};

export const getInvestmentAssetBrand = (params: InvestmentAssetBrandInput): AccountBrand => {
  const label = params.symbol?.trim() || params.name?.trim() || "Investment";
  const isCrypto = params.subtype === "crypto";
  const isRealWorldAsset = params.subtype === "real_world_asset";
  const isFixedIncome = isFixedIncomeInvestmentSubtype(params.subtype);
  const institutionBrand = params.institution
    ? getAccountBrand({
        institution: params.institution,
        name: params.name ?? null,
        type: "investment",
      })
    : null;
  const shouldPreferInstitutionLogo =
    !params.symbol?.trim() || !params.subtype || params.subtype === "other" || isFixedIncome;
  const institutionLogoCandidates = uniqueValues([
    ...(institutionBrand?.logoSrcs ?? []),
    ...(institutionBrand?.logoSrc ? [institutionBrand.logoSrc] : []),
  ]);
  const assetLogoCandidates = getInvestmentAssetLogoCandidates(params);
  const logoSrcs = shouldPreferInstitutionLogo
    ? uniqueValues([...institutionLogoCandidates, ...assetLogoCandidates])
    : uniqueValues([...assetLogoCandidates, ...institutionLogoCandidates]);

  return {
    label,
    logoSrc: null,
    logoSrcs,
    fallbackIconSrc: assetIconPath,
    accent: isCrypto ? "#22c55e" : isRealWorldAsset ? "#d69e2e" : isFixedIncome ? "#2563eb" : "#14b8a6",
    background: isCrypto
      ? "linear-gradient(135deg, rgba(34, 197, 94, 0.16), rgba(14, 165, 233, 0.06))"
      : isRealWorldAsset
        ? "linear-gradient(135deg, rgba(214, 158, 46, 0.18), rgba(180, 120, 31, 0.06))"
      : isFixedIncome
        ? "linear-gradient(135deg, rgba(37, 99, 235, 0.16), rgba(37, 99, 235, 0.06))"
        : "linear-gradient(135deg, rgba(20, 184, 166, 0.16), rgba(20, 184, 166, 0.06))",
    foreground: "#0f172a",
  };
};
