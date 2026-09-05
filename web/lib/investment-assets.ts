import { getAccountBrand, type AccountBrand } from "@/lib/account-brand";
import { isFixedIncomeInvestmentSubtype, type InvestmentSubtype } from "@/lib/investments";
import { INVESTMENT_LOGO_SYMBOLS } from "@/lib/investment-logo-catalog";
import { resolveGotradeSecuritySymbol } from "@/lib/gotrade-securities";

type InvestmentAssetBrandInput = {
  symbol?: string | null;
  name?: string | null;
  subtype?: InvestmentSubtype | null;
  currency?: string | null;
  institution?: string | null;
  logoUrl?: string | null;
  market?: "ph" | "us" | "crypto" | "japan" | "indices" | null;
};

const assetIconPath = "/assets/banks/investment.png";
const logoSets = Object.fromEntries(Object.entries(INVESTMENT_LOGO_SYMBOLS).map(([market, symbols]) => [market, new Set<string>(symbols)]));

export const getLocalInvestmentLogo = (params: InvestmentAssetBrandInput): string | null => {
  if (Boolean(isFixedIncomeInvestmentSubtype(params.subtype)) || params.subtype === "real_world_asset") return null;
  let symbol = (resolveGotradeSecuritySymbol(params) || params.name || "").trim().toUpperCase();
  let market: string | null = params.market ?? (params.subtype === "crypto" ? "crypto" : null);
  const prefix = symbol.match(/^(PSE|NASDAQ|NYSE|AMEX|TYO|JPX|INDEX):(.+)$/);
  if (prefix) {
    market = ({ PSE: "philippines", NASDAQ: "us", NYSE: "us", AMEX: "us", TYO: "japan", JPX: "japan", INDEX: "indices" } as Record<string,string>)[prefix[1]];
    symbol = prefix[2];
  } else if (symbol.endsWith(".PS")) { market = "philippines"; symbol = symbol.slice(0, -3); }
  else if (symbol.endsWith(".T")) { market = "japan"; symbol = symbol.slice(0, -2); }
  else if (symbol.startsWith("^")) { market = "indices"; symbol = symbol.slice(1); }
  if (market === "ph") market = "philippines";
  if (market === "crypto") {
    symbol = symbol.replace(/[-/]?(USDT|USD|PHP)$/, (suffix) => logoSets.crypto.has(symbol) ? suffix : "");
    symbol = ({ BITCOIN: "BTC", ETHEREUM: "ETH", SOLANA: "SOL", RIPPLE: "XRP", DOGECOIN: "DOGE" } as Record<string,string>)[symbol] ?? symbol;
  }
  market ??= params.currency?.toUpperCase() === "PHP" ? "philippines" : params.currency?.toUpperCase() === "USD" ? "us" : params.currency?.toUpperCase() === "JPY" ? "japan" : null;
  if (market !== "crypto" && logoSets.indices.has(symbol) && !logoSets[market ?? ""]?.has(symbol)) market = "indices";
  // Alphabet's two share classes use the same company artwork.
  if (market === "us" && symbol === "GOOGL" && !logoSets.us.has(symbol)) symbol = "GOOG";
  if (market === "us" && ["BRK-B", "BRK.B", "BRK-A"].includes(symbol)) symbol = "BRK.A";
  if (!market || !logoSets[market]?.has(symbol)) return null;
  return `/assets/investments/${market}/${encodeURIComponent(symbol)}.svg`;
};

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

  const localLogo = getLocalInvestmentLogo(params);
  return localLogo ? [localLogo, getAssetMonogramDataUri(params)] : [getAssetMonogramDataUri(params)];
};

export const getInvestmentAssetBrand = (params: InvestmentAssetBrandInput): AccountBrand => {
  const label = params.symbol?.trim() || params.name?.trim() || "Investment";
  const isCrypto = params.subtype === "crypto";
  const isRealWorldAsset = params.subtype === "real_world_asset";
  const isFixedIncome = isFixedIncomeInvestmentSubtype(params.subtype);
  const isGSaveAsset = /\bgsave\b/i.test(params.name ?? "");
  const isGotradeAsset = /\bgo\s*trade\b/i.test(params.institution ?? "");
  const brandingInstitution = isGSaveAsset ? "GSave" : params.institution;
  const institutionBrand = brandingInstitution
    ? getAccountBrand({
        institution: brandingInstitution,
        name: isGSaveAsset ? "GSave" : params.name ?? null,
        type: "investment",
      })
    : null;
  const localLogo = getLocalInvestmentLogo(params);
  const shouldPreferInstitutionLogo = !localLogo && (
    isGotradeAsset || !params.symbol?.trim() || !params.subtype || params.subtype === "other" || isFixedIncome);
  const institutionLogoCandidates = uniqueValues([
    ...(institutionBrand?.logoSrcs ?? []),
    ...(institutionBrand?.logoSrc ? [institutionBrand.logoSrc] : []),
  ]);
  const assetLogoCandidates = getInvestmentAssetLogoCandidates(params);
  const logoSrcs = shouldPreferInstitutionLogo
    ? uniqueValues([...institutionLogoCandidates, ...assetLogoCandidates])
    : uniqueValues([...assetLogoCandidates, ...institutionLogoCandidates]);

  const brand: AccountBrand = {
    label,
    logoSrc: null,
    logoSrcs,
    fallbackIconSrc: assetIconPath,
    logoBackground: localLogo ? "#ffffff" : shouldPreferInstitutionLogo ? institutionBrand?.logoBackground : undefined,
    logoFit: shouldPreferInstitutionLogo ? institutionBrand?.logoFit ?? "contain" : "contain",
    logoPadding: localLogo ? "4px" : shouldPreferInstitutionLogo ? institutionBrand?.logoPadding : undefined,
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
