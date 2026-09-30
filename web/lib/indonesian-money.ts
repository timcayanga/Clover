import { normalizeGlobalCurrencyCode } from "@/lib/financial-identity-detection";
import { hasRupiahMarker, normalizeIndonesianText, parseIndonesianAmount } from "@/lib/indonesian-financial-text";

/** Indonesian numeric notation with an explicit foreign ISO code. Never infer an exchange rate. */
export function readIndonesianMoney(value: string): { amount: number | null; currency: string | null } {
  let text = normalizeIndonesianText(value);
  const codes: string[] = [];
  const strip = (token: string) => {
    const currency = normalizeGlobalCurrencyCode(token);
    if (!currency) return token;
    codes.push(currency);
    return "";
  };
  // Keep signs and parentheses for the strict amount parser.
  text = text.replace(/^([(+\-]?\s*)([A-Za-z]{3})(?=\s*[+\-]?\d)/, (_, sign: string, token: string) => sign + strip(token));
  text = text.replace(/\s+([A-Za-z]{3})(?=\s*\)?$)/, (_, token: string) => strip(token)).trim();
  if (hasRupiahMarker(text)) codes.push("IDR");
  const unique = [...new Set(codes)];
  return { amount: unique.length > 1 ? null : parseIndonesianAmount(text), currency: unique.length === 1 ? unique[0]! : null };
}
