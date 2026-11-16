import { resolveGotradeSecuritySymbol } from "./gotrade-securities";
import { getAccountBrand, type AccountBrand } from "@/lib/account-brand";
import { isFixedIncomeInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";
import { matchInvestmentLogo } from "./investment-logo-matching";

type InvestmentAssetBrandInput = {
  symbol?: string | null;
  name?: string | null;
  subtype?: InvestmentSubtype | null;
  currency?: string | null;
  institution?: string | null;
  logoUrl?: string | null;
  market?: "ph" | "us" | "crypto" | "japan" | "indices" | null;
};

// One conservative asset resolver is shared by web and native responses.
export const getLocalInvestmentLogo = (params: InvestmentAssetBrandInput) => matchInvestmentLogo({ ...params, symbol: params.symbol || resolveGotradeSecuritySymbol(params) });

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter((value) => value.length > 0)));

export const getInvestmentAssetLogoCandidates = (params: InvestmentAssetBrandInput) => {
  if (!params.symbol?.trim() && !params.name?.trim()) {
    return [];
  }

  const localLogo = getLocalInvestmentLogo(params);
  return localLogo ? [localLogo] : [];
};

export const getInvestmentAssetBrand = (params: InvestmentAssetBrandInput): AccountBrand => {
  const label = params.symbol?.trim() || params.name?.trim() || "Investment";
  const isCrypto = params.subtype === "crypto";
  const isRealWorldAsset = params.subtype === "real_world_asset";
  const isFixedIncome = isFixedIncomeInvestmentSubtype(params.subtype);
  const localLogo = getLocalInvestmentLogo(params);
  const assetLogoCandidates = getInvestmentAssetLogoCandidates(params);
  // A deposit itself belongs to its issuer; an unknown security must never use its broker.
  const isGSave = /\bgsave\b/i.test(params.name ?? "");
  const namesIssuer = !!params.institution && (params.name ?? "").toLowerCase().includes(params.institution.toLowerCase());
  const issuerBrand = !localLogo && (isFixedIncome || ["other", "savings"].includes(params.subtype ?? "")) && params.institution && (namesIssuer || isGSave)
    ? getAccountBrand({ institution: isGSave ? "GSave" : params.institution, name: isGSave ? "GSave" : params.name, type: "investment" }) : null;
  const logoSrcs = assetLogoCandidates.length ? assetLogoCandidates : uniqueValues([...(issuerBrand?.logoSrcs ?? []), ...(issuerBrand?.logoSrc ? [issuerBrand.logoSrc] : [])]);

  const brand: AccountBrand = {
    label,
    logoSrc: null,
    logoSrcs,
    fallbackIconSrc: `/assets/investment-types/${params.subtype ?? "other"}.png`,
    logoBackground: localLogo ? "#ffffff" : undefined,
    logoFit: "contain",
    logoPadding: localLogo ? "4px" : undefined,
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

  if (!params.logoUrl) return brand;
  const isCustomImage = params.logoUrl.startsWith("data:image/");
  return {
    ...brand,
    logoSrc: params.logoUrl,
    logoSrcs: [params.logoUrl],
    logoBackground: "#ffffff",
    logoFit: isCustomImage ? "cover" : "contain",
    logoPadding: isCustomImage ? undefined : "4px",
  };
};
