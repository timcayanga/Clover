import { genericAccountColors, institutionAccountPalettes } from "./account-wallet";
// Clover Screens, 14 September 2026. Presentation only; never classify balances.
export const avatarGradients = [
  ["#0BAFC1", "#67DFB3"],
  ["#AD8DE9", "#65C5E8"],
  ["#FFB579", "#F18DAD"],
  ["#8CCBCB", "#B3E2CC"],
] as const;
export function avatarGradient(name: string): readonly [string, string] {
  const hash = Array.from(name.trim()).reduce(
    (value, char) => (value * 31 + char.charCodeAt(0)) | 0,
    0,
  );
  return avatarGradients[Math.abs(hash) % avatarGradients.length];
}
export function accountTypeIcon(type: string) {
  const key = type.toLowerCase().replaceAll(" ", "_");
  if (["bank_account", "savings", "checking"].includes(key)) return "bank";
  if (key === "liability") return "loan";
  return [
    "bank",
    "wallet",
    "credit_card",
    "cash",
    "investment",
    "loan",
    "mortgage",
    "line_of_credit",
    "receivable",
    "payable",
    "bnpl",
    "prepaid",
    "insurance",
  ].includes(key)
    ? key
    : "other";
}
// Offline fallback matches the desktop generic account gradients. Online responses
// supply the desktop resolver's complete institution-specific palette.
export type AccountCardPalette = {
  colors: [string, string, ...string[]];
  locations?: [number, number, ...number[]];
  foreground: string;
};
export function accountCardPalette(account: {
  type: string;
  institution?: string | null;
  name?: string | null;
  brandPalette?: AccountCardPalette | null;
}): AccountCardPalette {
  if (account.brandPalette?.colors.length && account.brandPalette.colors.length >= 2)
    return account.brandPalette;
  const institution = (account.institution || account.name || "").toLowerCase().replace(/[^a-z]/g, "");
  if (institutionAccountPalettes[institution]) return institutionAccountPalettes[institution];
  const type = accountTypeIcon(account.type);
  const colors = genericAccountColors[type] ?? genericAccountColors.other;
  return { colors, foreground: "#12383D" };
}
